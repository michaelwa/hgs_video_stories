import {addClipToStore, supportsPersistentClipStore} from "./media_clip_store"
import {uploadClipToServer} from "./media_clip_ingest"

const STAGE_IMAGES = {
  idle: "/images/studio-idle.svg",
  preview_camera: "/images/studio-preview-camera.svg",
  preview_screen: "/images/studio-preview-screen.svg",
}

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
  const page = document.getElementById("recording-studio-page")
  if (!page || page.dataset.initialized === "true") return
  page.dataset.initialized = "true"

  const elements = {
    stateBadge: document.getElementById("studio-state-badge"),
    sourceBadge: document.getElementById("studio-source-badge"),
    timerBadge: document.getElementById("studio-timer-badge"),
    ingestBadge: document.getElementById("studio-ingest-badge"),
    sourceStatusBadge: document.getElementById("source-status-badge"),
    sourceCamera: document.getElementById("source-camera"),
    sourceScreen: document.getElementById("source-screen"),
    sourceClear: document.getElementById("source-clear"),
    cameraDevice: document.getElementById("camera-device"),
    micDevice: document.getElementById("microphone-device"),
    start: document.getElementById("record-start"),
    pause: document.getElementById("record-pause"),
    resume: document.getElementById("record-resume"),
    stop: document.getElementById("record-stop"),
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
  }

  const setButtonDisabled = (button, disabled) => {
    button.disabled = disabled
    button.classList.toggle("opacity-60", disabled)
    button.classList.toggle("cursor-not-allowed", disabled)
  }

  const getSelectedDeviceId = selectElement => {
    const value = selectElement.value
    if (value === "" || value.startsWith("cam-") || value.startsWith("mic-")) {
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
      elements.timerBadge.textContent = `Timer: ${formatted}`
      elements.controlTimer.textContent = formatted
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
    await render()
  }

  const setStageImage = (src, title, caption) => {
    elements.stageVideo.classList.add("hidden")
    elements.stageImage.classList.remove("hidden")
    elements.stageImage.src = src
    elements.stageTitle.textContent = title
    elements.stageCaption.textContent = caption
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

    return navigator.mediaDevices.getUserMedia({
      video: cameraId ? {deviceId: {exact: cameraId}} : true,
      audio: micId ? {deviceId: {exact: micId}} : true,
    })
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
    state.status = "previewing"
    state.seconds = 0
    state.errorMessage = null
    stopTimer()
    await render()

    try {
      state.previewStream = source === "camera" ? await buildCameraStream() : await buildScreenStream()
      await render()
    } catch (error) {
      state.status = "error"
      state.errorMessage = `Could not start ${source} capture (${error.name || "permission denied"}).`
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
    elements.timerBadge.textContent = `Timer: ${timerText}`
    elements.controlTimer.textContent = timerText

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

    elements.cameraDevice.disabled = !hasSource || state.source !== "camera" || state.status === "recording"
    elements.micDevice.disabled = !hasSource || state.status === "recording"

    setButtonDisabled(elements.start, !(state.status === "previewing" && hasPreviewStream))
    setButtonDisabled(elements.pause, !(state.status === "recording"))
    setButtonDisabled(elements.resume, !(state.status === "paused"))
    setButtonDisabled(elements.stop, !(state.status === "recording" || state.status === "paused"))
    setButtonDisabled(elements.sourceClear, !hasSource || state.status === "recording" || state.status === "paused")

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
      elements.stageTitle.textContent = state.source === "camera"
        ? "Live camera preview ready."
        : "Desktop/application preview ready."
      elements.stageCaption.textContent = "Use Start Recording when you are ready."
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

  elements.sourceCamera.addEventListener("click", () => setupSource("camera"))
  elements.sourceScreen.addEventListener("click", () => setupSource("screen"))

  elements.sourceClear.addEventListener("click", () => resetToIdle())

  elements.cameraDevice.addEventListener("change", () => {
    if (state.source === "camera" && state.status !== "recording" && state.status !== "paused") {
      setupSource("camera")
    }
  })

  elements.micDevice.addEventListener("change", () => {
    if (state.source && state.status !== "recording" && state.status !== "paused") {
      setupSource(state.source)
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

  elements.lastDownload.addEventListener("click", () => {
    if (!state.lastCapture?.url) return
    const link = document.createElement("a")
    link.href = state.lastCapture.url
    link.download = state.lastCapture.filename
    link.click()
  })

  window.addEventListener("beforeunload", () => {
    stopTimer()
    stopRecorderIfNeeded()
    stopPreviewStream()
    if (state.lastCapture?.url) {
      URL.revokeObjectURL(state.lastCapture.url)
    }
  })

  render()
}

document.addEventListener("DOMContentLoaded", initRecordStudio)
document.addEventListener("phx:page-loading-stop", initRecordStudio)
