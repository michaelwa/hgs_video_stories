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
const TIMELINE_POLL_INTERVAL_MS = 3000

const modeUsesCamera = mode => CAMERA_MODES.has(mode)
const modeUsesMicrophone = mode => MICROPHONE_MODES.has(mode)

const formatTimer = totalSeconds => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

const formatTimelineMs = totalMs => {
  const safeMs = Math.max(0, totalMs)
  const minutes = Math.floor(safeMs / 60_000)
  const seconds = Math.floor((safeMs % 60_000) / 1000)
  const milliseconds = safeMs % 1000
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`
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

const waitForDataChannelOpen = eventChannel =>
  new Promise((resolve, reject) => {
    if (eventChannel.readyState === "open") {
      resolve()
      return
    }

    const handleOpen = () => {
      eventChannel.removeEventListener("open", handleOpen)
      eventChannel.removeEventListener("close", handleClose)
      resolve()
    }

    const handleClose = () => {
      eventChannel.removeEventListener("open", handleOpen)
      eventChannel.removeEventListener("close", handleClose)
      reject(new Error("Realtime event channel closed before opening."))
    }

    eventChannel.addEventListener("open", handleOpen)
    eventChannel.addEventListener("close", handleClose)
  })

const sendRealtimeEvent = (eventChannel, payload) => {
  eventChannel.send(JSON.stringify(payload))
}

const loadTimelineTranscription = async mediaId => {
  const response = await fetch(`/api/media_clips/${mediaId}/timeline_transcription`, {
    headers: {
      accept: "application/json",
      "x-requested-with": "XMLHttpRequest",
    },
  })

  if (!response.ok) {
    let reason = "Could not load timeline transcription."
    try {
      const json = await response.json()
      if (json?.error) reason = json.error
    } catch (_error) {
    }
    throw new Error(reason)
  }

  return response.json()
}

const queueTimelineTranscription = async mediaId => {
  const response = await fetch(`/api/media_clips/${mediaId}/timeline_transcription`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "x-requested-with": "XMLHttpRequest",
    },
  })

  if (!response.ok) {
    let reason = "Could not queue timeline transcription."
    try {
      const json = await response.json()
      if (json?.error) reason = json.error
    } catch (_error) {
    }
    throw new Error(reason)
  }

  return response.json()
}

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
    timelineGenerationToggle: document.getElementById("timeline-generation-toggle"),
    timelineGenerationButton: document.getElementById("timeline-generation-button"),
    ingestStatusNote: document.getElementById("ingest-status-note"),
    transcriptionStatusNote: document.getElementById("transcription-status-note"),
    transcriptionDisplayToggle: document.getElementById("transcription-display-toggle"),
    transcriptionModePreview: document.getElementById("transcription-mode-preview"),
    transcriptionModeTimeline: document.getElementById("transcription-mode-timeline"),
    transcriptionPreviewPanel: document.getElementById("transcription-preview-panel"),
    transcriptionPreviewText: document.getElementById("transcription-preview-text"),
    transcriptionTimelinePanel: document.getElementById("transcription-timeline-panel"),
    transcriptionTimelineList: document.getElementById("transcription-timeline-list"),
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
    currentClipId: null,
    ingestStatus: "idle",
    ingestMessage: null,
    ingestServerUrl: null,
    transcriptionStatus: "idle",
    transcriptionMessage: null,
    transcriptionDisplayMode: "preview",
    transcriptionPreview: "",
    transcriptionFinalText: "",
    transcriptionTimelineSegments: [],
    timelineGenerationEnabled: false,
    timelinePollRef: null,
    timelineStatus: "idle",
    timelineStatusMessage: null,
    transcriptionCleanup: null,
    transcriptionConnection: null,
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
    state.currentClipId = null
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

  const setTimelineTranscriptionState = ({status, message = null, segments = null}) => {
    state.timelineStatus = status
    state.timelineStatusMessage = message

    if (segments !== null) {
      state.transcriptionTimelineSegments = segments
    }
  }

  const stopTimelinePolling = () => {
    if (state.timelinePollRef) {
      window.clearInterval(state.timelinePollRef)
      state.timelinePollRef = null
    }
  }

  const syncTimelineTranscription = async mediaId => {
    const payload = await loadTimelineTranscription(mediaId)
    const timeline = payload?.timeline_transcription || {}
    const segments = Array.isArray(payload?.segments) ? payload.segments : []

    setTimelineTranscriptionState({
      status: timeline.status || "missing",
      message: timeline.error_message || null,
      segments: segments.map(segment => ({
        itemId: `timeline-${segment.seq}`,
        seq: segment.seq,
        startMs: segment.start_ms || 0,
        endMs: segment.end_ms || 0,
        text: segment.text || "",
      })),
    })

    if (timeline.status === "completed" || timeline.status === "failed" || timeline.status === "missing") {
      stopTimelinePolling()
    }
  }

  const startTimelinePolling = mediaId => {
    stopTimelinePolling()
    state.timelinePollRef = window.setInterval(() => {
      void syncTimelineTranscription(mediaId).then(() => render()).catch(() => {})
    }, TIMELINE_POLL_INTERVAL_MS)
  }

  const queueAccurateTimelineTranscription = async mediaId => {
    setTimelineTranscriptionState({
      status: "pending",
      message: "Queueing accurate timeline transcription...",
      segments: [],
    })
    await render()

    await queueTimelineTranscription(mediaId)

    setTimelineTranscriptionState({
      status: "pending",
      message: "Timeline transcription queued. Processing starts after upload.",
    })

    await syncTimelineTranscription(mediaId)

    if (state.timelineStatus === "pending" || state.timelineStatus === "processing") {
      startTimelinePolling(mediaId)
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

  const startLiveTranscription = async ({stream, mediaId}) => {
    if (typeof state.transcriptionCleanup === "function") {
      state.transcriptionCleanup()
      state.transcriptionCleanup = null
    }

    state.transcriptionConnection = null

    const audioTracks = stream?.getAudioTracks?.() || []
    if (audioTracks.length === 0) {
      setTranscriptionState({
        status: "skipped",
        message: "Capture has no audio track. Transcription skipped.",
        preview: "",
        finalText: "",
      })
      await render()
      return
    }

    setTranscriptionState({
      status: "starting",
      message: "Starting live transcription...",
      preview: "",
      finalText: "",
    })
    await render()

    let socket = null
    let channel = null
    let peerConnection = null
    let eventChannel = null
    let completedCount = 0

    const cleanup = () => {
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
      state.transcriptionConnection = {
        channel,
        transcriptionSessionId,
        eventChannel,
      }

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
              // Keep preview on the model's native turn boundaries. The earlier manual
              // chunk-commit experiment produced timeline-like windows, but it also
              // degraded transcription quality enough that we do not use it in runtime.
              const nextPreview = `${state.transcriptionPreview}${deltaText}`.slice(-2400)
              setTranscriptionState({
                status: "streaming",
                message: "Transcribing live audio...",
                preview: nextPreview,
              })
              void render()
            }
          }

          if (eventData?.type === "conversation.item.input_audio_transcription.completed") {
            const completedText = readTranscriptText(eventData)
            if (!completedText) return

            completedCount += 1
            const nextFinalText = state.transcriptionFinalText
              ? `${state.transcriptionFinalText}\n${completedText}`
              : completedText
            const itemId = eventData?.item_id || eventData?.item?.id || `item-${completedCount}`

            setTranscriptionState({
              status: "streaming",
              message: "Transcribing live audio...",
              preview: "",
              finalText: nextFinalText,
            })
            void render()

            if (channel) {
              void pushChannelEvent(channel, "transcript.completed", {
                transcription_session_id: transcriptionSessionId,
                media_id: mediaId,
                item_id: itemId,
                seq: completedCount,
                text: completedText,
                source_ts: new Date().toISOString(),
              }).catch(() => {})
            }
          }
        } catch (_error) {
        }
      })

      for (const audioTrack of audioTracks) {
        peerConnection.addTrack(audioTrack, stream)
      }

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
        message: "Transcribing live audio...",
      })
      await render()
    } catch (error) {
      setTranscriptionState({
        status: "failed",
        message: `Transcription failed (${error.message || "unknown error"}).`,
      })
      await render()
    } finally {
      if (state.transcriptionStatus === "failed") {
        cleanup()
        state.transcriptionCleanup = null
        state.transcriptionConnection = null
      }
    }
  }

  const stopLiveTranscription = async reason => {
    const connection = state.transcriptionConnection

    if (!connection) {
      if (typeof state.transcriptionCleanup === "function") {
        state.transcriptionCleanup()
        state.transcriptionCleanup = null
      }
      return
    }

    try {
      await pushChannelEvent(connection.channel, "transcript.stop", {reason})
      setTranscriptionState({
        status: "completed",
        message: state.transcriptionFinalText
          ? "Live transcription completed and saved."
          : "Live transcription completed with no text detected.",
      })
    } catch (error) {
      setTranscriptionState({
        status: "failed",
        message: `Transcription finalization failed (${error.message || "unknown error"}).`,
      })
    } finally {
      if (typeof state.transcriptionCleanup === "function") {
        state.transcriptionCleanup()
      }
      state.transcriptionCleanup = null
      state.transcriptionConnection = null
      await render()
    }
  }

  const handleRecordingStop = async () => {
    await stopLiveTranscription("completed")

    const blob = new Blob(state.chunks, {type: state.recorder?.mimeType || "video/webm"})
    state.chunks = []

    if (blob.size > 0) {
      const clipId = state.currentClipId || Date.now()
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

        if (!clipRecord.had_audio) {
          setTranscriptionState({
            status: "skipped",
            message: "Clip saved without audio. Transcription skipped.",
            preview: "",
            finalText: "",
          })
          setTimelineTranscriptionState({
            status: "skipped",
            message: "Timeline transcription is unavailable because this clip has no audio.",
            segments: [],
          })
        } else if (state.timelineGenerationEnabled) {
          try {
            await queueAccurateTimelineTranscription(clipRecord.id)
          } catch (timelineError) {
            setTimelineTranscriptionState({
              status: "failed",
              message: timelineError.message || "Could not queue timeline transcription.",
              segments: [],
            })
          }
        } else {
          setTimelineTranscriptionState({
            status: "idle",
            message: "Timeline generation is off for this recording.",
            segments: [],
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
        setTimelineTranscriptionState({
          status: "idle",
          message: null,
          segments: [],
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
    const timelineStatusMessage = state.timelineStatusMessage
    const hasTimelineSegments = state.transcriptionTimelineSegments.length > 0
    const hasFeedback = Boolean(
      hasSource ||
      state.lastCapture ||
      ingestStatusMessage ||
      transcriptionStatusMessage ||
      timelineStatusMessage ||
      transcriptPreviewText ||
      hasTimelineSegments
    )
    elements.captureFeedbackPanel?.classList.toggle("hidden", !hasFeedback)
    elements.captureFeedbackPanel?.classList.toggle("flex", hasFeedback)
    elements.timelineGenerationToggle?.classList.toggle("hidden", false)
    elements.timelineGenerationButton?.classList.toggle("btn-primary", state.timelineGenerationEnabled)
    elements.timelineGenerationButton?.classList.toggle("btn-ghost", !state.timelineGenerationEnabled)
    elements.timelineGenerationButton.textContent = state.timelineGenerationEnabled
      ? "Timeline On"
      : "Timeline Off"

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
      const combinedMessage =
        state.transcriptionDisplayMode === "timeline" && timelineStatusMessage
          ? `${transcriptionStatusMessage} ${timelineStatusMessage}`
          : transcriptionStatusMessage

      elements.transcriptionStatusNote.textContent = combinedMessage
      elements.transcriptionStatusNote.classList.remove("hidden")
    } else if (timelineStatusMessage) {
      elements.transcriptionStatusNote.textContent = timelineStatusMessage
      elements.transcriptionStatusNote.classList.remove("hidden")
    } else {
      elements.transcriptionStatusNote.textContent = ""
      elements.transcriptionStatusNote.classList.add("hidden")
    }

    const showToggle = Boolean(transcriptPreviewText || hasTimelineSegments || state.transcriptionStatus !== "idle")
    elements.transcriptionDisplayToggle.classList.toggle("hidden", !showToggle)

    elements.transcriptionModePreview.classList.toggle("btn-primary", state.transcriptionDisplayMode === "preview")
    elements.transcriptionModePreview.classList.toggle("btn-ghost", state.transcriptionDisplayMode !== "preview")
    elements.transcriptionModeTimeline.classList.toggle("btn-primary", state.transcriptionDisplayMode === "timeline")
    elements.transcriptionModeTimeline.classList.toggle("btn-ghost", state.transcriptionDisplayMode !== "timeline")

    if (transcriptPreviewText && state.transcriptionDisplayMode === "preview") {
      elements.transcriptionPreviewText.textContent = transcriptPreviewText
      elements.transcriptionPreviewPanel.classList.remove("hidden")
    } else {
      elements.transcriptionPreviewText.textContent = ""
      elements.transcriptionPreviewPanel.classList.add("hidden")
    }

    elements.transcriptionTimelineList.replaceChildren()
    if (state.transcriptionDisplayMode === "timeline") {
      if (state.transcriptionTimelineSegments.length > 0) {
        state.transcriptionTimelineSegments.forEach(segment => {
          const item = document.createElement("li")
          item.className = "rounded-md border border-base-300 bg-base-100 px-3 py-2"

          const timestamp = document.createElement("p")
          timestamp.className = "text-[11px] font-medium uppercase tracking-wide text-base-content/55"
          timestamp.textContent = `${formatTimelineMs(segment.startMs)} - ${formatTimelineMs(segment.endMs)}`

          const text = document.createElement("p")
          text.className = "mt-1 text-xs text-base-content/85"
          text.textContent = segment.text

          item.appendChild(timestamp)
          item.appendChild(text)
          elements.transcriptionTimelineList.appendChild(item)
        })
      } else {
        const item = document.createElement("li")
        item.className = "rounded-md border border-dashed border-base-300 bg-base-100 px-3 py-2 text-xs text-base-content/65"
        if (!state.timelineGenerationEnabled) {
          item.textContent = "Timeline generation is off for this recording."
        } else if (state.status === "recording" || state.status === "paused") {
          item.textContent = "Accurate timeline transcription is generated after recording finishes."
        } else if (timelineStatusMessage) {
          item.textContent = timelineStatusMessage
        } else {
          item.textContent = "No timeline segments yet."
        }
        elements.transcriptionTimelineList.appendChild(item)
      }
      elements.transcriptionTimelinePanel.classList.remove("hidden")
    } else {
      elements.transcriptionTimelinePanel.classList.add("hidden")
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

  elements.transcriptionModePreview.addEventListener("click", async () => {
    state.transcriptionDisplayMode = "preview"
    await render()
  })

  elements.transcriptionModeTimeline.addEventListener("click", async () => {
    state.transcriptionDisplayMode = "timeline"
    await render()
  })

  elements.timelineGenerationButton.addEventListener("click", async () => {
    state.timelineGenerationEnabled = !state.timelineGenerationEnabled
    await render()
  })

  elements.start.addEventListener("click", async () => {
    if (!(state.status === "previewing" && state.previewStream)) return

    const clipId = Date.now()
    state.currentClipId = clipId
    state.transcriptionDisplayMode = "preview"
    stopTimelinePolling()
    setTimelineTranscriptionState({
      status: state.timelineGenerationEnabled ? "idle" : "disabled",
      message: state.timelineGenerationEnabled
        ? "Timeline transcription will be queued after upload."
        : "Timeline generation is off for this recording.",
      segments: [],
    })
    const recordingHasAudio = (state.previewStream?.getAudioTracks()?.length || 0) > 0
    setTranscriptionState({
      status: recordingHasAudio ? "queued" : "idle",
      message: recordingHasAudio ? "Connecting live transcription..." : null,
      preview: "",
      finalText: "",
    })
    setIngestState({
      status: "idle",
      message: null,
      serverUrl: null,
    })
    state.errorMessage = null
    await render()

    if (recordingHasAudio) {
      await startLiveTranscription({
        stream: state.previewStream,
        mediaId: clipId,
      })
    }

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
    stopTimelinePolling()
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
