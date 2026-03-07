import {addClipToStore, supportsPersistentClipStore} from "./media_clip_store"
import {uploadClipToServer} from "./media_clip_ingest"

const STAGE_IMAGES = {
  idle: "/images/studio-idle.svg",
  preview_camera: "/images/studio-preview-camera.svg",
  preview_screen: "/images/studio-preview-screen.svg",
}

const GLOBAL_CLEANUP_KEY = "__recordStudioCleanup"

const SOURCE_LABELS = {
  camera: "camera + mic",
  screen: "screen / app",
}

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
    sourceStatusBadge: document.getElementById("source-status-badge"),
    captureMode: document.getElementById("capture-mode"),
    sourceClear: document.getElementById("source-clear"),
    cameraDevice: document.getElementById("camera-device"),
    micDevice: document.getElementById("microphone-device"),
    start: document.getElementById("record-start"),
    pause: document.getElementById("record-pause"),
    resume: document.getElementById("record-resume"),
    stop: document.getElementById("record-stop"),
    toggleCamera: document.getElementById("toggle-camera"),
    toggleMicrophone: document.getElementById("toggle-microphone"),
    toggleCameraLabel: document.getElementById("toggle-camera-label"),
    toggleMicrophoneLabel: document.getElementById("toggle-microphone-label"),
    recordControlsGroup: document.getElementById("record-controls-group"),
    recordControlsLockedNote: document.getElementById("record-controls-locked-note"),
    controlTimer: document.getElementById("record-control-timer"),
    controlHelp: document.getElementById("control-help"),
    stageVideo: document.getElementById("stage-video"),
    stageImage: document.getElementById("stage-image"),
    stageTitle: document.getElementById("stage-title"),
    stageCaption: document.getElementById("stage-caption"),
    lastCaptureNote: document.getElementById("last-capture-note"),
    lastDownload: document.getElementById("last-download"),
    ingestStatusNote: document.getElementById("ingest-status-note"),
    ingestServerLink: document.getElementById("ingest-server-link"),
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
    cameraEnabled: true,
    microphoneEnabled: true,
  }

  const setButtonDisabled = (button, disabled) => {
    button.disabled = disabled
    button.classList.toggle("opacity-60", disabled)
    button.classList.toggle("cursor-not-allowed", disabled)
  }

  const getSelectedDeviceId = selectElement => {
    const value = selectElement.value
    if (value === "" || ["cam-1", "cam-2", "mic-1", "mic-2"].includes(value)) {
      return undefined
    }
    return value
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

  const stopPreviewStream = () => {
    if (!state.previewStream) return
    state.previewStream.getTracks().forEach(track => track.stop())
    state.previewStream = null
    stopPlayback()
  }

  const applyTrackEnabledState = () => {
    if (!state.previewStream) return
    state.previewStream.getVideoTracks().forEach(track => {
      track.enabled = state.cameraEnabled
    })
    state.previewStream.getAudioTracks().forEach(track => {
      track.enabled = state.microphoneEnabled
    })
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
    state.cameraEnabled = true
    state.microphoneEnabled = true
    elements.captureMode.value = ""
    await render()
  }

  const setStageImage = (src, title, caption) => {
    elements.stageVideo.classList.add("hidden")
    elements.stageImage.classList.remove("hidden")
    elements.stageImage.src = src
    setText(elements.stageTitle, title)
    setText(elements.stageCaption, caption)
  }

  const setLivePreview = async stream => {
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

  const buildCameraStream = async () => {
    const cameraId = getSelectedDeviceId(elements.cameraDevice)
    const micId = getSelectedDeviceId(elements.micDevice)
    let cameraStream = null
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

    let micStream = null
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

    return new MediaStream([
      ...cameraStream.getVideoTracks(),
      ...(micStream ? micStream.getAudioTracks() : []),
    ])
  }

  const buildScreenStream = async () => {
    const micId = getSelectedDeviceId(elements.micDevice)
    const displayStream = await navigator.mediaDevices.getDisplayMedia({video: true, audio: true})

    let micStream = null
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: micId ? {deviceId: {exact: micId}} : true,
      })
    } catch (_error) {
      micStream = null
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
    state.cameraEnabled = true
    state.microphoneEnabled = true
    state.status = "previewing"
    state.seconds = 0
    state.errorMessage = null
    stopTimer()
    await render()

    try {
      state.previewStream = source === "camera" ? await buildCameraStream() : await buildScreenStream()
      applyTrackEnabledState()
      await render()
    } catch (error) {
      state.status = "error"
      if (source === "camera" && error.name === "NotReadableError") {
        state.errorMessage = "Camera is busy or unavailable. Turn off capture or refresh the tab, then try again."
      } else {
        state.errorMessage = `Could not start ${source} capture (${error.name || "permission denied"}).`
      }
      await render()
    }
  }

  const setIngestState = ({status, message = null, serverUrl = null}) => {
    state.ingestStatus = status
    state.ingestMessage = message
    state.ingestServerUrl = serverUrl
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

      const sourceLabel = state.source === "screen" ? "Screen Capture" : "Camera Capture"
      const clipRecord = {
        id: clipId,
        title: `${sourceLabel} ${new Date(clipId).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}`,
        source: state.source || "camera",
        duration_seconds: Math.max(1, state.seconds),
        created_at: new Date(clipId).toISOString(),
        size_bytes: blob.size,
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
        })

        if (persistedLocally) {
          await addClipToStore({
            ...clipRecord,
            blob,
            server_url: ingestResult.url,
            server_saved_at: ingestResult.saved_at,
            server_id: ingestResult.id,
          })
        }

        setIngestState({
          status: "saved",
          message: "Clip ingested to server.",
          serverUrl: ingestResult.url,
        })
      } catch (error) {
        setIngestState({
          status: "failed",
          message: `Server ingest failed (${error.message || "unknown error"}).`,
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

    elements.sourceStatusBadge.textContent = state.status === "error"
      ? "Capture error"
      : hasSource
        ? hasPreviewStream
          ? "Source selected"
          : "Awaiting browser permission"
        : "Select a source first"

    elements.sourceStatusBadge.classList.toggle("badge-success", hasPreviewStream)
    elements.sourceStatusBadge.classList.toggle(
      "badge-warning",
      hasSource && !hasPreviewStream && state.status !== "error"
    )
    elements.sourceStatusBadge.classList.toggle("badge-error", state.status === "error")

    elements.captureMode.disabled = state.status === "recording" || state.status === "paused"
    elements.cameraDevice.disabled = state.status === "recording" || state.status === "paused"
    elements.micDevice.disabled = state.status === "recording" || state.status === "paused"

    setButtonDisabled(elements.start, !(state.status === "previewing" && hasPreviewStream))
    setButtonDisabled(elements.pause, !(state.status === "recording"))
    setButtonDisabled(elements.resume, !(state.status === "paused"))
    setButtonDisabled(elements.stop, !(state.status === "recording" || state.status === "paused"))
    setButtonDisabled(elements.sourceClear, !hasSource || state.status === "recording" || state.status === "paused")
    elements.recordControlsGroup?.classList.toggle("hidden", !hasSource)
    elements.recordControlsGroup?.classList.toggle("flex", hasSource)
    elements.recordControlsLockedNote?.classList.toggle("hidden", hasSource)
    setButtonDisabled(elements.toggleCamera, !hasPreviewStream || !hasSource)
    setButtonDisabled(elements.toggleMicrophone, !hasPreviewStream || !hasSource)
    setText(elements.toggleCameraLabel, state.cameraEnabled ? "Camera On" : "Camera Off")
    setText(elements.toggleMicrophoneLabel, state.microphoneEnabled ? "Mic On" : "Mic Off")

    if (state.status === "idle") {
      setStageImage(
        STAGE_IMAGES.idle,
        "Choose a source to begin previewing.",
        "This page is dedicated to capture only. Manage clips in Media Library."
      )
    } else if (state.status === "error") {
      const fallback = state.source === "screen" ? STAGE_IMAGES.preview_screen : STAGE_IMAGES.preview_camera
      setStageImage(
        fallback,
        "Capture could not start.",
        "Check permissions and try selecting source again."
      )
    } else if (hasPreviewStream) {
      await setLivePreview(state.previewStream)
      setText(elements.stageTitle, state.source === "camera"
        ? "Live camera preview ready."
        : "Desktop/application preview ready.")
      setText(elements.stageCaption, "Use Start Recording when you are ready.")
    } else {
      const waiting = state.source === "screen" ? STAGE_IMAGES.preview_screen : STAGE_IMAGES.preview_camera
      setStageImage(waiting, "Waiting for source permission.", "Approve browser permission prompt to continue.")
    }

    elements.controlHelp.textContent = state.errorMessage || (hasSource
      ? hasPreviewStream
        ? "Recordings are ingested to server automatically and retained locally."
        : "Waiting for permission to access your selected source."
      : "Select a capture source to unlock recording controls.")

    if (state.lastCapture) {
      const mb = (state.lastCapture.size / (1024 * 1024)).toFixed(2)
      elements.lastCaptureNote.textContent = `Last capture retained in browser memory (${mb} MB).`
      setButtonDisabled(elements.lastDownload, false)
    } else {
      elements.lastCaptureNote.textContent = "No captures in memory yet."
      setButtonDisabled(elements.lastDownload, true)
    }

    elements.ingestStatusNote.textContent = state.ingestMessage || "Server ingest status will appear here after recording."
    if (state.ingestServerUrl) {
      elements.ingestServerLink.classList.remove("hidden")
      elements.ingestServerLink.href = state.ingestServerUrl
    } else {
      elements.ingestServerLink.classList.add("hidden")
      elements.ingestServerLink.href = "#"
    }
  }

  elements.captureMode.addEventListener("change", async () => {
    const mode = elements.captureMode.value
    if (mode === "camera" || mode === "screen") {
      await setupSource(mode)
      return
    }
    await resetToIdle()
  })

  elements.sourceClear.addEventListener("click", () => resetToIdle())

  elements.cameraDevice.addEventListener("change", async () => {
    if (state.source === "camera" && state.status !== "recording" && state.status !== "paused") {
      await setupSource("camera")
    }
  })

  elements.micDevice.addEventListener("change", async () => {
    if (state.source && state.status !== "recording" && state.status !== "paused") {
      await setupSource(state.source)
    }
  })

  elements.start.addEventListener("click", async () => {
    if (!(state.status === "previewing" && state.previewStream)) return

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

  elements.toggleCamera?.addEventListener("click", async () => {
    if (!state.previewStream) return
    state.cameraEnabled = !state.cameraEnabled
    applyTrackEnabledState()
    await render()
  })

  elements.toggleMicrophone?.addEventListener("click", async () => {
    if (!state.previewStream) return
    state.microphoneEnabled = !state.microphoneEnabled
    applyTrackEnabledState()
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
    if (state.lastCapture?.url) {
      URL.revokeObjectURL(state.lastCapture.url)
    }
    page.dataset.initialized = "false"
  }

  window[GLOBAL_CLEANUP_KEY] = cleanup
  window.addEventListener("beforeunload", cleanup)

  render()
}

document.addEventListener("DOMContentLoaded", initRecordStudio)
document.addEventListener("phx:page-loading-stop", initRecordStudio)
