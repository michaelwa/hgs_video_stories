import {addClipToStore, supportsPersistentClipStore} from "./media_clip_store"
import {uploadClipToServer} from "./media_clip_ingest"
import {Socket as PhoenixSocket} from "phoenix"

const STAGE_IMAGES = {
  idle: "/images/studio-idle.svg",
  preview_camera: "/images/studio-preview-camera.svg",
  preview_mic: "/images/studio-preview-mic.svg",
  preview_screen: "/images/studio-preview-screen.svg",
}

const GLOBAL_CLEANUP_KEY = "__recordStudioCleanup"

const SOURCE_LABELS = {
  camera: "camera + mic",
  camera_only: "camera only",
  mic_only: "mic only",
  screen: "screen / app",
  screen_only: "screen only",
}

const DEFAULT_DEVICE_IDS = new Set(["default", "communications"])
const CAMERA_OFF_VALUE = "__camera_off__"
const MICROPHONE_OFF_VALUE = "__mic_off__"
const CAMERA_MODES = new Set(["camera", "camera_only"])
const SCREEN_MODES = new Set(["screen", "screen_only"])
const MICROPHONE_MODES = new Set(["camera", "screen", "mic_only"])
const MIC_ONLY_MODES = new Set(["mic_only"])
const DEFAULT_STAGE_FRAME_CLASSES = ["h-52", "sm:h-80", "lg:h-[26rem]"]
const AUDIO_STAGE_FRAME_CLASSES = ["h-36", "sm:h-48", "lg:h-56"]

const modeUsesCamera = mode => CAMERA_MODES.has(mode)
const modeUsesMicrophone = mode => MICROPHONE_MODES.has(mode)

const formatTimer = totalSeconds => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

const findSupportedMimeType = () => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ]

  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "video/webm"
}

const connectTranscriptChannel = ({mediaId, transcriptionSessionId}) =>
  new Promise((resolve, reject) => {
    const socket = new PhoenixSocket("/socket")
    socket.connect()

    const channel = socket.channel(`transcripts:${mediaId}`, {
      transcription_session_id: transcriptionSessionId,
    })

    channel.join()
      .receive("ok", () => resolve({socket, channel}))
      .receive("error", payload => {
        socket.disconnect()
        reject(new Error(payload?.reason || "Could not join transcript channel."))
      })
      .receive("timeout", () => {
        socket.disconnect()
        reject(new Error("Timed out joining transcript channel."))
      })
  })

const pushChannelEvent = (channel, event, payload) =>
  new Promise((resolve, reject) => {
    channel.push(event, payload)
      .receive("ok", response => resolve(response))
      .receive("error", response => reject(new Error(response?.error || "Channel event failed.")))
      .receive("timeout", () => reject(new Error("Channel event timed out.")))
  })

const negotiateRealtimeSdp = async ({offerSdp, ephemeralKey, model}) => {
  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ephemeralKey}`,
      "content-type": "application/sdp",
    },
    body: offerSdp,
  })

  if (response.ok) {
    return response.text()
  }

  const errorText = (await response.text()).trim()
  const detail = errorText || `model=${model}, status=${response.status}`
  throw new Error(`OpenAI SDP negotiation failed: status ${response.status} (${detail})`)
}

const initRecordStudio = () => {
  const existingCleanup = window[GLOBAL_CLEANUP_KEY]
  if (typeof existingCleanup === "function") {
    existingCleanup()
    window[GLOBAL_CLEANUP_KEY] = null
  }

  const page = document.getElementById("recording-studio-page")
  if (!page || page.dataset.initialized === "true") return
  page.dataset.initialized = "true"

  const elements = {
    stateBadge: document.getElementById("studio-state-badge"),
    sourceBadge: document.getElementById("studio-source-badge"),
    timerBadge: document.getElementById("studio-timer-badge"),
    ingestBadge: document.getElementById("studio-ingest-badge"),
    transcriptionBadge: document.getElementById("studio-transcription-badge"),
    captureMode: document.getElementById("capture-mode"),
    cameraDevice: document.getElementById("camera-device"),
    micDevice: document.getElementById("microphone-device"),
    start: document.getElementById("record-start"),
    pause: document.getElementById("record-pause"),
    resume: document.getElementById("record-resume"),
    stop: document.getElementById("record-stop"),
    recordControlsGroup: document.getElementById("record-controls-group"),
    controlTimer: document.getElementById("record-control-timer"),
    captureFeedbackPanel: document.getElementById("capture-feedback-panel"),
    lastCapturePanel: document.getElementById("last-capture-panel"),
    stageFrame: document.getElementById("stage-frame"),
    stageVideo: document.getElementById("stage-video"),
    stageImage: document.getElementById("stage-image"),
    stageAudioWave: document.getElementById("stage-audio-wave"),
    stageTitle: document.getElementById("stage-title"),
    stageCaption: document.getElementById("stage-caption"),
    lastCaptureNote: document.getElementById("last-capture-note"),
    lastDownload: document.getElementById("last-download"),
    ingestStatusNote: document.getElementById("ingest-status-note"),
    transcriptionStatusNote: document.getElementById("transcription-status-note"),
    transcriptionPreviewPanel: document.getElementById("transcription-preview-panel"),
    transcriptionPreviewText: document.getElementById("transcription-preview-text"),
  }

  if (!elements.stateBadge) return

  const setText = (element, text) => {
    if (element) {
      element.textContent = text
    }
  }

  const state = {
    status: "idle",
    source: null,
    seconds: 0,
    timerRef: null,
    previewStream: null,
    recorder: null,
    chunks: [],
    errorMessage: null,
    lastCapture: null,
    ingestStatus: "idle",
    ingestMessage: null,
    ingestServerUrl: null,
    transcriptionStatus: "idle",
    transcriptionMessage: null,
    transcriptionPreview: "",
    transcriptionFinalText: "",
    transcriptionCleanup: null,
    audioContext: null,
    audioWaveRef: null,
    audioSourceNode: null,
    audioAnalyser: null,
    audioWaveMode: "level",
    audioWaveHistory: [],
  }

  const setButtonDisabled = (button, disabled) => {
    button.disabled = disabled
    button.classList.toggle("opacity-60", disabled)
    button.classList.toggle("cursor-not-allowed", disabled)
  }

  const getSelectedDeviceId = selectElement => {
    const value = selectElement.value
    if (value === "" || value === CAMERA_OFF_VALUE || value === MICROPHONE_OFF_VALUE) {
      return undefined
    }
    return value
  }

  const setSelectOptions = (selectElement, {options, defaultLabel, unavailableLabel, offLabel, offValue}) => {
    const previousValue = selectElement.value
    selectElement.replaceChildren()

    if (offLabel && offValue) {
      selectElement.appendChild(new Option(offLabel, offValue))
    }

    const defaultOption = new Option(options.length === 0 ? unavailableLabel : defaultLabel, "")
    selectElement.appendChild(defaultOption)

    options.forEach(option => {
      selectElement.appendChild(new Option(option.label, option.value))
    })

    if (previousValue === offValue) {
      selectElement.value = offValue
      return
    }

    const canRestorePreviousValue = options.some(option => option.value === previousValue)
    selectElement.value = canRestorePreviousValue ? previousValue : ""
  }

  const ensureControlValue = (selectElement, offValue) => {
    if (selectElement.value === offValue) {
      selectElement.value = ""
    }
  }

  const syncDeviceControlsForMode = mode => {
    if (!mode || mode === "off") {
      elements.cameraDevice.value = CAMERA_OFF_VALUE
      elements.micDevice.value = MICROPHONE_OFF_VALUE
      return
    }

    if (modeUsesCamera(mode)) {
      ensureControlValue(elements.cameraDevice, CAMERA_OFF_VALUE)
    } else {
      elements.cameraDevice.value = CAMERA_OFF_VALUE
    }

    if (modeUsesMicrophone(mode)) {
      ensureControlValue(elements.micDevice, MICROPHONE_OFF_VALUE)
    } else {
      elements.micDevice.value = MICROPHONE_OFF_VALUE
    }
  }

  const refreshDeviceOptions = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setSelectOptions(elements.cameraDevice, {
        options: [],
        defaultLabel: "System default camera",
        unavailableLabel: "Camera enumeration unavailable",
        offLabel: "Camera Off",
        offValue: CAMERA_OFF_VALUE,
      })
      setSelectOptions(elements.micDevice, {
        options: [],
        defaultLabel: "System default microphone",
        unavailableLabel: "Microphone enumeration unavailable",
        offLabel: "Microphone Off",
        offValue: MICROPHONE_OFF_VALUE,
      })
      return
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cameraOptions = devices
        .filter(device => device.kind === "videoinput" && !DEFAULT_DEVICE_IDS.has(device.deviceId))
        .map((device, index) => ({
          value: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
        }))
      const microphoneOptions = devices
        .filter(device => device.kind === "audioinput" && !DEFAULT_DEVICE_IDS.has(device.deviceId))
        .map((device, index) => ({
          value: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }))

      setSelectOptions(elements.cameraDevice, {
        options: cameraOptions,
        defaultLabel: "System default camera",
        unavailableLabel: "No camera detected",
        offLabel: "Camera Off",
        offValue: CAMERA_OFF_VALUE,
      })
      setSelectOptions(elements.micDevice, {
        options: microphoneOptions,
        defaultLabel: "System default microphone",
        unavailableLabel: "No microphone detected",
        offLabel: "Microphone Off",
        offValue: MICROPHONE_OFF_VALUE,
      })
    } catch (_error) {
      setSelectOptions(elements.cameraDevice, {
        options: [],
        defaultLabel: "System default camera",
        unavailableLabel: "Could not read cameras",
        offLabel: "Camera Off",
        offValue: CAMERA_OFF_VALUE,
      })
      setSelectOptions(elements.micDevice, {
        options: [],
        defaultLabel: "System default microphone",
        unavailableLabel: "Could not read microphones",
        offLabel: "Microphone Off",
        offValue: MICROPHONE_OFF_VALUE,
      })
    }
  }

  const stopTimer = () => {
    if (state.timerRef) {
      clearInterval(state.timerRef)
      state.timerRef = null
    }
  }

  const startTimer = () => {
    stopTimer()
    state.timerRef = setInterval(() => {
      state.seconds += 1
      const formatted = formatTimer(state.seconds)
      setText(elements.timerBadge, `Timer: ${formatted}`)
      setText(elements.controlTimer, formatted)
    }, 1000)
  }

  const stopPlayback = () => {
    elements.stageVideo.pause()
    elements.stageVideo.removeAttribute("src")
    elements.stageVideo.srcObject = null
    elements.stageVideo.load()
  }

  const setStageFrameMode = micOnly => {
    const removeClasses = micOnly ? DEFAULT_STAGE_FRAME_CLASSES : AUDIO_STAGE_FRAME_CLASSES
    const addClasses = micOnly ? AUDIO_STAGE_FRAME_CLASSES : DEFAULT_STAGE_FRAME_CLASSES
    elements.stageFrame?.classList.remove(...removeClasses)
    elements.stageFrame?.classList.add(...addClasses)
  }

  const stopAudioWavePreview = () => {
    if (state.audioWaveRef) {
      cancelAnimationFrame(state.audioWaveRef)
      state.audioWaveRef = null
    }

    if (state.audioSourceNode) {
      state.audioSourceNode.disconnect()
      state.audioSourceNode = null
    }

    state.audioAnalyser = null
    state.audioWaveHistory = []

    if (state.audioContext) {
      state.audioContext.close().catch(() => {})
      state.audioContext = null
    }

    if (elements.stageAudioWave) {
      elements.stageAudioWave.classList.add("hidden")
      const ctx = elements.stageAudioWave.getContext("2d")
      if (ctx) {
        ctx.clearRect(0, 0, elements.stageAudioWave.width, elements.stageAudioWave.height)
      }
    }
  }

  const startAudioWavePreview = stream => {
    if (!elements.stageAudioWave) return

    const tracks = stream.getAudioTracks()
    if (tracks.length === 0) {
      stopAudioWavePreview()
      return
    }

    if (state.audioAnalyser && state.audioContext && state.audioSourceNode) {
      elements.stageAudioWave.classList.remove("hidden")
      return
    }

    stopAudioWavePreview()
    elements.stageAudioWave.classList.remove("hidden")

    const canvas = elements.stageAudioWave
    const ctx = canvas.getContext("2d")
    if (!ctx || !window.AudioContext) return

    const audioContext = new AudioContext()
    const audioStream = new MediaStream(tracks)
    const sourceNode = audioContext.createMediaStreamSource(audioStream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048
    sourceNode.connect(analyser)

    state.audioContext = audioContext
    state.audioSourceNode = sourceNode
    state.audioAnalyser = analyser
    state.audioWaveHistory = []

    const data = new Uint8Array(analyser.fftSize)
    const draw = () => {
      if (!state.audioAnalyser || !elements.stageAudioWave) return

      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const nextWidth = Math.max(1, Math.floor(rect.width * dpr))
      const nextHeight = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }

      state.audioAnalyser.getByteTimeDomainData(data)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = "rgba(15, 23, 42, 0.15)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      if (state.audioWaveMode === "timeline") {
        let peak = 0
        for (let i = 0; i < data.length; i += 1) {
          const sample = Math.abs(data[i] - 128)
          if (sample > peak) peak = sample
        }

        const normalized = peak / 128
        const historyMax = Math.max(30, Math.floor(canvas.width / 3))
        state.audioWaveHistory.push(normalized)
        if (state.audioWaveHistory.length > historyMax) {
          state.audioWaveHistory.shift()
        }

        ctx.lineWidth = Math.max(2, Math.floor(dpr * 2))
        ctx.strokeStyle = "rgba(56, 189, 248, 0.95)"
        ctx.beginPath()
        const step = canvas.width / Math.max(1, historyMax - 1)
        for (let i = 0; i < state.audioWaveHistory.length; i += 1) {
          const amplitude = state.audioWaveHistory[i]
          const y = canvas.height / 2 - amplitude * (canvas.height * 0.42)
          const x = i * step
          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
      } else {
        ctx.lineWidth = Math.max(2, Math.floor(dpr * 2))
        ctx.strokeStyle = "rgba(56, 189, 248, 0.95)"
        ctx.beginPath()

        const sliceWidth = canvas.width / data.length
        let x = 0
        for (let i = 0; i < data.length; i += 1) {
          const value = data[i] / 255
          const y = value * canvas.height
          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
          x += sliceWidth
        }

        ctx.lineTo(canvas.width, canvas.height / 2)
        ctx.stroke()
      }

      state.audioWaveRef = requestAnimationFrame(draw)
    }

    draw()
  }

  const stopPreviewStream = () => {
    if (state.previewStream) {
      state.previewStream.getTracks().forEach(track => track.stop())
      state.previewStream = null
    }
    stopAudioWavePreview()
    stopPlayback()
  }

  const stopRecorderIfNeeded = () => {
    if (state.recorder && state.recorder.state !== "inactive") {
      state.recorder.stop()
    }
    state.recorder = null
  }

  const resetToIdle = async () => {
    stopTimer()
    stopRecorderIfNeeded()
    stopPreviewStream()
    state.source = null
    state.status = "idle"
    state.seconds = 0
    state.errorMessage = null
    elements.captureMode.value = "off"
    await render()
  }

  const setStageImage = (src, title, caption) => {
    elements.stageVideo.classList.add("hidden")
    elements.stageImage.classList.remove("hidden")
    elements.stageAudioWave?.classList.add("hidden")
    elements.stageImage.src = src
    setText(elements.stageTitle, title)
    setText(elements.stageCaption, caption)
  }

  const showStageAudioWave = (title, caption) => {
    elements.stageVideo.classList.add("hidden")
    elements.stageImage.classList.add("hidden")
    elements.stageAudioWave?.classList.remove("hidden")
    setText(elements.stageTitle, title)
    setText(elements.stageCaption, caption)
  }

  const setLivePreview = async stream => {
    elements.stageAudioWave?.classList.add("hidden")
    elements.stageImage.classList.add("hidden")
    elements.stageVideo.classList.remove("hidden")
    elements.stageVideo.controls = false
    elements.stageVideo.muted = true
    elements.stageVideo.srcObject = stream
    try {
      await elements.stageVideo.play()
    } catch (_error) {
    }
  }

  const buildCameraStream = async mode => {
    const captureMicrophone = mode === "camera"
    const cameraOff = elements.cameraDevice.value === CAMERA_OFF_VALUE
    const microphoneOff = !captureMicrophone || elements.micDevice.value === MICROPHONE_OFF_VALUE
    const cameraId = getSelectedDeviceId(elements.cameraDevice)
    const micId = getSelectedDeviceId(elements.micDevice)

    if (cameraOff && microphoneOff) {
      return new MediaStream([])
    }

    let cameraStream = null
    if (!cameraOff) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: cameraId ? {deviceId: {exact: cameraId}} : true,
          audio: false,
        })
      } catch (error) {
        if (cameraId) {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          })
        } else {
          try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            })
          } catch (_fallbackError) {
            throw error
          }
        }
      }
    }

    let micStream = null
    if (!microphoneOff) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: micId ? {deviceId: {exact: micId}} : true,
        })
      } catch (error) {
        if (micId) {
          try {
            micStream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: true,
            })
          } catch (_fallbackError) {
            micStream = null
          }
        } else {
          micStream = null
        }
      }
    }

    return new MediaStream([
      ...(cameraStream ? cameraStream.getVideoTracks() : []),
      ...(micStream ? micStream.getAudioTracks() : []),
    ])
  }

  const buildScreenStream = async mode => {
    const captureSystemAudio = mode === "screen"
    const captureMicrophone = mode === "screen"
    const microphoneOff = !captureMicrophone || elements.micDevice.value === MICROPHONE_OFF_VALUE
    const micId = getSelectedDeviceId(elements.micDevice)
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: captureSystemAudio,
    })

    let micStream = null
    if (captureMicrophone && !microphoneOff) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: micId ? {deviceId: {exact: micId}} : true,
        })
      } catch (_error) {
        micStream = null
      }
    }

    const combined = new MediaStream([
      ...displayStream.getVideoTracks(),
      ...displayStream.getAudioTracks(),
      ...(micStream ? micStream.getAudioTracks() : []),
    ])

    const [videoTrack] = combined.getVideoTracks()
    if (videoTrack) {
      videoTrack.addEventListener("ended", () => {
        if (state.status !== "recording" && state.status !== "paused") {
          resetToIdle()
        }
      })
    }

    return combined
  }

  const buildMicOnlyStream = async () => {
    const microphoneOff = elements.micDevice.value === MICROPHONE_OFF_VALUE
    if (microphoneOff) {
      return new MediaStream([])
    }

    const micId = getSelectedDeviceId(elements.micDevice)
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: micId ? {deviceId: {exact: micId}} : true,
      })
    } catch (error) {
      if (micId) {
        return navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        })
      }
      throw error
    }
  }

  const setupSource = async source => {
    if (state.status === "recording" || state.status === "paused") {
      state.errorMessage = "Stop recording before switching sources."
      await render()
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      state.status = "error"
      state.errorMessage = "This browser does not support required media APIs."
      await render()
      return
    }

    stopPreviewStream()
    state.source = source
    elements.captureMode.value = source
    syncDeviceControlsForMode(source)
    state.status = "previewing"
    state.seconds = 0
    state.errorMessage = null
    stopTimer()
    await render()

    try {
      const isCameraMode = CAMERA_MODES.has(source)
      const isScreenMode = SCREEN_MODES.has(source)
      state.previewStream = isCameraMode
        ? await buildCameraStream(source)
        : isScreenMode
          ? await buildScreenStream(source)
          : await buildMicOnlyStream()
      if (isCameraMode && state.previewStream.getTracks().length === 0) {
        state.status = "error"
        state.errorMessage = "Camera and microphone are both off. Enable at least one to preview."
        await render()
        return
      }
      if (MIC_ONLY_MODES.has(source) && state.previewStream.getTracks().length === 0) {
        state.status = "error"
        state.errorMessage = "Microphone is off. Select a microphone input to preview."
        await render()
        return
      }
      await refreshDeviceOptions()
      await render()
    } catch (error) {
      state.status = "error"
      if (CAMERA_MODES.has(source) && error.name === "NotReadableError") {
        state.errorMessage = "Camera is busy or unavailable. Turn off capture or refresh the tab, then try again."
      } else {
        const sourceLabel = SOURCE_LABELS[source] || source
        state.errorMessage = `Could not start ${sourceLabel} capture (${error.name || "permission denied"}).`
      }
      await render()
    }
  }

  const setIngestState = ({status, message = null, serverUrl = null}) => {
    state.ingestStatus = status
    state.ingestMessage = message
    state.ingestServerUrl = serverUrl
  }

  const setTranscriptionState = ({status, message = null, preview = null, finalText = null}) => {
    state.transcriptionStatus = status
    state.transcriptionMessage = message

    if (preview !== null) {
      state.transcriptionPreview = preview
    }

    if (finalText !== null) {
      state.transcriptionFinalText = finalText
    }
  }

  const readTranscriptText = event => {
    if (typeof event?.transcript === "string" && event.transcript !== "") return event.transcript
    if (typeof event?.text === "string" && event.text !== "") return event.text
    if (typeof event?.delta === "string" && event.delta !== "") return event.delta

    const transcriptChunk = event?.item?.content?.find?.(
      contentItem => typeof contentItem?.transcript === "string" && contentItem.transcript !== ""
    )

    if (transcriptChunk) return transcriptChunk.transcript

    return ""
  }

  const runTranscriptionForClip = async ({blob, mediaId}) => {
    if (typeof state.transcriptionCleanup === "function") {
      state.transcriptionCleanup()
      state.transcriptionCleanup = null
    }

    setTranscriptionState({
      status: "starting",
      message: "Starting transcription session...",
      preview: "",
      finalText: "",
    })
    await render()

    let socket = null
    let channel = null
    let peerConnection = null
    let eventChannel = null
    let audioElement = null
    let audioUrl = null
    let audioContext = null

    const cleanup = () => {
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ""
        audioElement = null
      }

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
        audioUrl = null
      }

      if (audioContext) {
        audioContext.close().catch(() => {})
        audioContext = null
      }

      if (eventChannel) {
        eventChannel.close()
        eventChannel = null
      }

      if (peerConnection) {
        peerConnection.close()
        peerConnection = null
      }

      if (channel) {
        channel.leave()
        channel = null
      }

      if (socket) {
        socket.disconnect()
        socket = null
      }
    }

    state.transcriptionCleanup = cleanup

    try {
      const sessionResponse = await fetch("/api/realtime/sessions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify({media_id: mediaId}),
      })

      if (!sessionResponse.ok) {
        let reason = "Failed to bootstrap transcription session."
        try {
          const json = await sessionResponse.json()
          if (json?.error) reason = json.error
        } catch (_error) {
        }
        throw new Error(reason)
      }

      const session = await sessionResponse.json()
      const transcriptionSessionId = session?.transcription_session_id
      const openai = session?.openai

      if (!transcriptionSessionId || !openai?.ephemeral_key || !openai?.model) {
        throw new Error("Session bootstrap response was incomplete.")
      }

      setTranscriptionState({
        status: "connecting",
        message: "Connecting to transcription services...",
      })
      await render()

      const channelConnection = await connectTranscriptChannel({
        mediaId,
        transcriptionSessionId,
      })

      socket = channelConnection.socket
      channel = channelConnection.channel

      peerConnection = new RTCPeerConnection()
      eventChannel = peerConnection.createDataChannel("oai-events")

      let completedCount = 0
      let livePreview = ""

      eventChannel.addEventListener("message", eventMessage => {
        try {
          const eventData = JSON.parse(eventMessage.data)

          if (channel) {
            void pushChannelEvent(channel, "transcript.audit", {
              media_id: mediaId,
              event_type: eventData?.type || "unknown",
              item_id: eventData?.item_id || eventData?.item?.id || null,
              payload: eventData,
              source_ts: new Date().toISOString(),
            }).catch(() => {})
          }

          if (eventData?.type === "conversation.item.input_audio_transcription.delta") {
            const deltaText = readTranscriptText(eventData)
            if (deltaText) {
              livePreview = `${livePreview}${deltaText}`.slice(-2400)
              setTranscriptionState({
                status: "streaming",
                message: "Transcribing captured audio...",
                preview: livePreview,
              })
              void render()
            }
          }

          if (eventData?.type === "conversation.item.input_audio_transcription.completed") {
            const completedText = readTranscriptText(eventData)
            if (!completedText) return

            completedCount += 1
            livePreview = ""
            const nextFinalText = state.transcriptionFinalText
              ? `${state.transcriptionFinalText}\n${completedText}`
              : completedText

            setTranscriptionState({
              status: "streaming",
              message: "Transcribing captured audio...",
              preview: "",
              finalText: nextFinalText,
            })
            void render()

            if (channel) {
              void pushChannelEvent(channel, "transcript.completed", {
                transcription_session_id: transcriptionSessionId,
                media_id: mediaId,
                item_id: eventData?.item_id || eventData?.item?.id || `item-${completedCount}`,
                seq: completedCount,
                text: completedText,
                source_ts: new Date().toISOString(),
              }).catch(() => {})
            }
          }
        } catch (_error) {
        }
      })

      audioElement = document.createElement("audio")
      audioElement.muted = true
      audioElement.preload = "auto"
      audioUrl = URL.createObjectURL(blob)
      audioElement.src = audioUrl

      await new Promise((resolve, reject) => {
        const handleLoaded = () => {
          audioElement.removeEventListener("loadedmetadata", handleLoaded)
          audioElement.removeEventListener("error", handleError)
          resolve()
        }

        const handleError = () => {
          audioElement.removeEventListener("loadedmetadata", handleLoaded)
          audioElement.removeEventListener("error", handleError)
          reject(new Error("Recorded clip metadata could not be loaded."))
        }

        audioElement.addEventListener("loadedmetadata", handleLoaded)
        audioElement.addEventListener("error", handleError)
      })

      await audioElement.play()

      await new Promise(resolve => setTimeout(resolve, 100))

      let outboundStream =
        typeof audioElement.captureStream === "function"
          ? audioElement.captureStream()
          : typeof audioElement.mozCaptureStream === "function"
            ? audioElement.mozCaptureStream()
            : null

      if (!outboundStream || outboundStream.getAudioTracks().length === 0) {
        if (!window.AudioContext) {
          throw new Error("Browser does not support audio capture stream for transcription.")
        }

        audioContext = new AudioContext()
        if (audioContext.state === "suspended") {
          await audioContext.resume()
        }

        const sourceNode = audioContext.createMediaElementSource(audioElement)
        const destinationNode = audioContext.createMediaStreamDestination()
        sourceNode.connect(destinationNode)
        outboundStream = destinationNode.stream
      }

      if (!outboundStream) {
        throw new Error("Browser does not support audio capture stream for transcription.")
      }

      const [audioTrack] = outboundStream.getAudioTracks()
      if (!audioTrack) {
        throw new Error("Recorded clip did not include a playable audio track.")
      }

      peerConnection.addTrack(audioTrack, outboundStream)

      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)

      const answerSdp = await negotiateRealtimeSdp({
        offerSdp: offer.sdp,
        ephemeralKey: openai.ephemeral_key,
        model: openai.model,
      })
      await peerConnection.setRemoteDescription({type: "answer", sdp: answerSdp})

      setTranscriptionState({
        status: "streaming",
        message: "Transcribing captured audio...",
      })
      await render()

      await new Promise((resolve, reject) => {
        const handleEnded = () => {
          audioElement.removeEventListener("ended", handleEnded)
          audioElement.removeEventListener("error", handleError)
          resolve()
        }

        const handleError = () => {
          audioElement.removeEventListener("ended", handleEnded)
          audioElement.removeEventListener("error", handleError)
          reject(new Error("Recorded clip playback failed during transcription."))
        }

        audioElement.addEventListener("ended", handleEnded)
        audioElement.addEventListener("error", handleError)
      })

      if (channel) {
        await pushChannelEvent(channel, "transcript.stop", {reason: "completed"})
      }

      setTranscriptionState({
        status: "completed",
        message: state.transcriptionFinalText
          ? "Transcription completed and saved."
          : "Transcription completed with no text detected.",
      })
      await render()
    } catch (error) {
      setTranscriptionState({
        status: "failed",
        message: `Transcription failed (${error.message || "unknown error"}).`,
      })
      await render()
    } finally {
      cleanup()
      state.transcriptionCleanup = null
    }
  }

  const handleRecordingStop = async () => {
    const blob = new Blob(state.chunks, {type: state.recorder?.mimeType || "video/webm"})
    state.chunks = []

    if (blob.size > 0) {
      const clipId = Date.now()
      if (state.lastCapture?.url) {
        URL.revokeObjectURL(state.lastCapture.url)
      }

      state.lastCapture = {
        url: URL.createObjectURL(blob),
        filename: `capture-${clipId}.webm`,
        size: blob.size,
      }

      const sourceLabelByMode = {
        camera: "Camera + Mic Capture",
        camera_only: "Camera Capture",
        mic_only: "Microphone Capture",
        screen: "Screen + Audio Capture",
        screen_only: "Screen Capture",
      }
      const sourceLabel = sourceLabelByMode[state.source] || "Capture"
      const hadAudio = (state.previewStream?.getAudioTracks()?.length || 0) > 0
      const clipRecord = {
        id: clipId,
        title: `${sourceLabel} ${new Date(clipId).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}`,
        source: state.source || "camera",
        duration_seconds: Math.max(1, state.seconds),
        created_at: new Date(clipId).toISOString(),
        size_bytes: blob.size,
        had_audio: hadAudio,
      }

      let persistedLocally = false
      if (supportsPersistentClipStore()) {
        await addClipToStore({
          ...clipRecord,
          blob,
        })
        persistedLocally = true
      } else {
        state.errorMessage = "Clip recorded, but this browser cannot persist clips for Media Library."
      }

      setIngestState({
        status: "uploading",
        message: "Uploading clip to server...",
      })
      await render()

      try {
        const ingestResult = await uploadClipToServer({
          blob,
          id: clipRecord.id,
          title: clipRecord.title,
          source: clipRecord.source,
          durationSeconds: clipRecord.duration_seconds,
          createdAt: clipRecord.created_at,
          hadAudio: clipRecord.had_audio,
        })

        if (persistedLocally) {
          await addClipToStore({
            ...clipRecord,
            blob,
            server_url: ingestResult.url,
            server_saved_at: ingestResult.saved_at,
            server_id: ingestResult.media_id ?? ingestResult.id,
          })
        }

        setIngestState({
          status: "saved",
          message: "Clip ingested to server.",
          serverUrl: ingestResult.url,
        })

        if (clipRecord.had_audio) {
          const rawMediaId = ingestResult.media_id ?? ingestResult.id
          const mediaId = Number.parseInt(rawMediaId, 10)
          if (Number.isInteger(mediaId) && mediaId > 0) {
            void runTranscriptionForClip({blob, mediaId})
          } else {
            setTranscriptionState({
              status: "failed",
              message: "Transcription could not start because media_id was missing.",
            })
          }
        } else {
          setTranscriptionState({
            status: "skipped",
            message: "Clip saved without audio. Transcription skipped.",
            preview: "",
            finalText: "",
          })
        }
      } catch (error) {
        setIngestState({
          status: "failed",
          message: `Server ingest failed (${error.message || "unknown error"}).`,
        })

        setTranscriptionState({
          status: "idle",
          message: null,
          preview: "",
          finalText: "",
        })
      }
    }

    await resetToIdle()
  }

  const render = async () => {
    const timerText = formatTimer(state.seconds)
    const hasSource = Boolean(state.source)
    const hasPreviewStream = Boolean(state.previewStream)

    elements.stateBadge.textContent = `State: ${state.status}`
    elements.sourceBadge.textContent = hasSource
      ? `Source: ${SOURCE_LABELS[state.source]}`
      : "Source: not selected"
    setText(elements.timerBadge, `Timer: ${timerText}`)
    setText(elements.controlTimer, timerText)

    elements.ingestBadge.textContent = `Ingest: ${state.ingestStatus}`
    elements.ingestBadge.classList.remove("badge-success", "badge-warning", "badge-error")
    if (state.ingestStatus === "saved") {
      elements.ingestBadge.classList.add("badge-success")
    } else if (state.ingestStatus === "uploading") {
      elements.ingestBadge.classList.add("badge-warning")
    } else if (state.ingestStatus === "failed") {
      elements.ingestBadge.classList.add("badge-error")
    }

    elements.transcriptionBadge.textContent = `Transcription: ${state.transcriptionStatus}`
    elements.transcriptionBadge.classList.remove("badge-success", "badge-warning", "badge-error")
    if (state.transcriptionStatus === "completed" || state.transcriptionStatus === "skipped") {
      elements.transcriptionBadge.classList.add("badge-success")
    } else if (state.transcriptionStatus === "queued" || state.transcriptionStatus === "starting" || state.transcriptionStatus === "connecting" || state.transcriptionStatus === "streaming") {
      elements.transcriptionBadge.classList.add("badge-warning")
    } else if (state.transcriptionStatus === "failed") {
      elements.transcriptionBadge.classList.add("badge-error")
    }

    elements.captureMode.disabled = state.status === "recording" || state.status === "paused"
    elements.cameraDevice.disabled = state.status === "recording" || state.status === "paused"
    elements.micDevice.disabled = state.status === "recording" || state.status === "paused"

    setButtonDisabled(elements.start, !(state.status === "previewing" && hasPreviewStream))
    setButtonDisabled(elements.pause, !(state.status === "recording"))
    setButtonDisabled(elements.resume, !(state.status === "paused"))
    setButtonDisabled(elements.stop, !(state.status === "recording" || state.status === "paused"))
    elements.recordControlsGroup?.classList.toggle("hidden", !hasSource)
    elements.recordControlsGroup?.classList.toggle("flex", hasSource)

    if (state.status === "idle") {
      setStageFrameMode(false)
      state.audioWaveMode = "level"
      stopAudioWavePreview()
      setStageImage(
        STAGE_IMAGES.idle,
        "Choose a source to begin previewing.",
        "This page is dedicated to capture only. Manage clips in Media Library."
      )
    } else if (state.status === "error") {
      setStageFrameMode(MIC_ONLY_MODES.has(state.source))
      state.audioWaveMode = "level"
      stopAudioWavePreview()
      const fallback = MIC_ONLY_MODES.has(state.source)
        ? STAGE_IMAGES.preview_mic
        : SCREEN_MODES.has(state.source)
          ? STAGE_IMAGES.preview_screen
          : STAGE_IMAGES.preview_camera
      setStageImage(
        fallback,
        "Capture could not start.",
        "Check permissions and try selecting source again."
      )
    } else if (hasPreviewStream && MIC_ONLY_MODES.has(state.source)) {
      setStageFrameMode(true)
      state.audioWaveMode = state.status === "recording" || state.status === "paused" ? "timeline" : "level"
      showStageAudioWave(
        state.status === "recording" || state.status === "paused"
          ? "Recording microphone waveform."
          : "Microphone input ready.",
        "Use Start Recording when you are ready."
      )
      startAudioWavePreview(state.previewStream)
    } else if (hasPreviewStream) {
      setStageFrameMode(false)
      state.audioWaveMode = "level"
      stopAudioWavePreview()
      await setLivePreview(state.previewStream)
      setText(elements.stageTitle, CAMERA_MODES.has(state.source)
        ? "Live camera preview ready."
        : "Desktop/application preview ready.")
      setText(elements.stageCaption, "Use Start Recording when you are ready.")
    } else {
      setStageFrameMode(MIC_ONLY_MODES.has(state.source))
      state.audioWaveMode = "level"
      stopAudioWavePreview()
      const waiting = MIC_ONLY_MODES.has(state.source)
        ? STAGE_IMAGES.preview_mic
        : SCREEN_MODES.has(state.source)
          ? STAGE_IMAGES.preview_screen
          : STAGE_IMAGES.preview_camera
      setStageImage(waiting, "Waiting for source permission.", "Approve browser permission prompt to continue.")
    }

    const ingestStatusMessage = state.errorMessage || state.ingestMessage
    const transcriptionStatusMessage = state.transcriptionMessage
    const transcriptPreviewText = state.transcriptionFinalText || state.transcriptionPreview
    const hasFeedback = Boolean(state.lastCapture || ingestStatusMessage || transcriptionStatusMessage || transcriptPreviewText)
    elements.captureFeedbackPanel?.classList.toggle("hidden", !hasFeedback)
    elements.captureFeedbackPanel?.classList.toggle("flex", hasFeedback)

    if (state.lastCapture) {
      const mb = (state.lastCapture.size / (1024 * 1024)).toFixed(2)
      elements.lastCaptureNote.textContent = `Last capture retained in browser memory (${mb} MB).`
      elements.lastCapturePanel?.classList.remove("hidden")
      elements.lastCapturePanel?.classList.add("flex")
      setButtonDisabled(elements.lastDownload, false)
    } else {
      elements.lastCapturePanel?.classList.add("hidden")
      elements.lastCapturePanel?.classList.remove("flex")
      setButtonDisabled(elements.lastDownload, true)
    }

    if (ingestStatusMessage) {
      elements.ingestStatusNote.textContent = ingestStatusMessage
      elements.ingestStatusNote.classList.remove("hidden")
    } else {
      elements.ingestStatusNote.textContent = ""
      elements.ingestStatusNote.classList.add("hidden")
    }

    if (transcriptionStatusMessage) {
      elements.transcriptionStatusNote.textContent = transcriptionStatusMessage
      elements.transcriptionStatusNote.classList.remove("hidden")
    } else {
      elements.transcriptionStatusNote.textContent = ""
      elements.transcriptionStatusNote.classList.add("hidden")
    }

    if (transcriptPreviewText) {
      elements.transcriptionPreviewText.textContent = transcriptPreviewText
      elements.transcriptionPreviewPanel.classList.remove("hidden")
    } else {
      elements.transcriptionPreviewText.textContent = ""
      elements.transcriptionPreviewPanel.classList.add("hidden")
    }

  }

  elements.captureMode.addEventListener("change", async () => {
    const mode = elements.captureMode.value
    if (CAMERA_MODES.has(mode) || SCREEN_MODES.has(mode) || MIC_ONLY_MODES.has(mode)) {
      await setupSource(mode)
      return
    }
    await resetToIdle()
  })

  elements.cameraDevice.addEventListener("change", async () => {
    if (CAMERA_MODES.has(state.source) && state.status !== "recording" && state.status !== "paused") {
      await setupSource(state.source)
    }
  })

  elements.micDevice.addEventListener("change", async () => {
    if (MICROPHONE_MODES.has(state.source) && state.status !== "recording" && state.status !== "paused") {
      await setupSource(state.source)
    }
  })

  elements.start.addEventListener("click", async () => {
    if (!(state.status === "previewing" && state.previewStream)) return

    const recordingHasAudio = (state.previewStream?.getAudioTracks()?.length || 0) > 0
    setTranscriptionState({
      status: recordingHasAudio ? "queued" : "idle",
      message: recordingHasAudio ? "Transcription will begin after recording is uploaded." : null,
      preview: "",
      finalText: "",
    })

    const mimeType = findSupportedMimeType()
    state.chunks = []
    state.recorder = new MediaRecorder(state.previewStream, {mimeType})

    state.recorder.addEventListener("dataavailable", event => {
      if (event.data?.size > 0) {
        state.chunks.push(event.data)
      }
    })

    state.recorder.addEventListener("stop", () => {
      handleRecordingStop()
    })

    state.seconds = 0
    state.status = "recording"
    state.errorMessage = null
    state.recorder.start(1000)
    startTimer()
    await render()
  })

  elements.pause.addEventListener("click", async () => {
    if (state.status !== "recording" || !state.recorder) return
    state.recorder.pause()
    state.status = "paused"
    stopTimer()
    await render()
  })

  elements.resume.addEventListener("click", async () => {
    if (state.status !== "paused" || !state.recorder) return
    state.recorder.resume()
    state.status = "recording"
    startTimer()
    await render()
  })

  elements.stop.addEventListener("click", async () => {
    if (!(state.status === "recording" || state.status === "paused") || !state.recorder) return
    stopTimer()
    stopRecorderIfNeeded()
    state.status = "idle"
    await render()
  })

  elements.lastDownload.addEventListener("click", () => {
    if (!state.lastCapture?.url) return
    const link = document.createElement("a")
    link.href = state.lastCapture.url
    link.download = state.lastCapture.filename
    link.click()
  })

  const cleanup = () => {
    stopTimer()
    stopRecorderIfNeeded()
    stopPreviewStream()
    if (typeof state.transcriptionCleanup === "function") {
      state.transcriptionCleanup()
      state.transcriptionCleanup = null
    }
    if (state.lastCapture?.url) {
      URL.revokeObjectURL(state.lastCapture.url)
    }
    if (navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange)
    }
    window.removeEventListener("beforeunload", handleBeforeUnload)
    page.dataset.initialized = "false"
  }

  const handleDeviceChange = () => {
    void refreshDeviceOptions()
  }

  const handleBeforeUnload = () => {
    cleanup()
  }

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange)
  }

  window[GLOBAL_CLEANUP_KEY] = cleanup
  window.addEventListener("beforeunload", handleBeforeUnload)

  void refreshDeviceOptions()
  render()
}

document.addEventListener("DOMContentLoaded", initRecordStudio)
document.addEventListener("phx:page-loading-stop", initRecordStudio)
