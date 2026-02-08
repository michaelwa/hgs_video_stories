const STAGE_IMAGES = {
  idle: "/images/studio-idle.svg",
  preview_camera: "/images/studio-preview-camera.svg",
  preview_screen: "/images/studio-preview-screen.svg",
  playback: "/images/studio-playback.svg",
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

const formatClockTime = date => {
  const hour = date.getHours()
  const minute = String(date.getMinutes()).padStart(2, "0")
  const suffix = hour >= 12 ? "PM" : "AM"
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minute} ${suffix}`
}

const initRecordStudio = () => {
  const page = document.getElementById("recording-studio-page")
  if (!page) return

  const elements = {
    stateBadge: document.getElementById("studio-state-badge"),
    sourceBadge: document.getElementById("studio-source-badge"),
    timerBadge: document.getElementById("studio-timer-badge"),
    sourceStatusBadge: document.getElementById("source-status-badge"),
    sourceCamera: document.getElementById("source-camera"),
    sourceScreen: document.getElementById("source-screen"),
    cameraDevice: document.getElementById("camera-device"),
    micDevice: document.getElementById("microphone-device"),
    start: document.getElementById("record-start"),
    pause: document.getElementById("record-pause"),
    resume: document.getElementById("record-resume"),
    stop: document.getElementById("record-stop"),
    controlTimer: document.getElementById("record-control-timer"),
    controlHelp: document.getElementById("control-help"),
    tabPreview: document.getElementById("stage-tab-preview"),
    tabPlayback: document.getElementById("stage-tab-playback"),
    stageImage: document.getElementById("stage-image"),
    stageTitle: document.getElementById("stage-title"),
    stageCaption: document.getElementById("stage-caption"),
    clipList: document.getElementById("clip-list"),
    clipEmpty: document.getElementById("clip-empty"),
    clipRename: document.getElementById("clip-rename"),
    clipDownload: document.getElementById("clip-download"),
    clipRerecord: document.getElementById("clip-rerecord"),
    clipDelete: document.getElementById("clip-delete"),
  }

  const state = {
    status: "idle",
    source: null,
    mode: "preview",
    seconds: 0,
    timerRef: null,
    selectedClipId: null,
    clips: [
      {id: 1, title: "Clip 01", source: "camera", duration: 42, at: "9:41 AM"},
      {id: 2, title: "Clip 02", source: "screen", duration: 76, at: "9:45 AM"},
    ],
  }

  const setButtonDisabled = (button, disabled) => {
    button.disabled = disabled
    button.classList.toggle("opacity-60", disabled)
    button.classList.toggle("cursor-not-allowed", disabled)
  }

  const selectSourceButtonStyles = source => {
    ;[elements.sourceCamera, elements.sourceScreen].forEach(button => {
      const isSelected = button.dataset.source === source
      button.classList.toggle("border-primary/40", isSelected)
      button.classList.toggle("bg-primary/10", isSelected)
      button.classList.toggle("border-base-300", !isSelected)
      button.classList.toggle("bg-base-100", !isSelected)
    })
  }

  const setStagePreview = () => {
    if (!state.source) {
      elements.stageImage.src = STAGE_IMAGES.idle
      elements.stageTitle.textContent = "Choose a source to begin previewing."
      elements.stageCaption.textContent = "The same stage is used for both live preview and clip playback."
      return
    }

    const key = state.source === "camera" ? "preview_camera" : "preview_screen"
    elements.stageImage.src = STAGE_IMAGES[key]
    elements.stageTitle.textContent =
      state.source === "camera"
        ? "Live camera preview ready."
        : "Desktop/application preview ready."
    elements.stageCaption.textContent = "Use Start Recording when you are ready."
  }

  const setStagePlayback = () => {
    const selected = state.clips.find(clip => clip.id === state.selectedClipId)

    if (!selected) {
      elements.stageImage.src = STAGE_IMAGES.idle
      elements.stageTitle.textContent = "Choose a clip to review playback."
      elements.stageCaption.textContent = "Select any clip from the library to switch into review mode."
      return
    }

    elements.stageImage.src = STAGE_IMAGES.playback
    elements.stageTitle.textContent = `${selected.title} · ${selected.source === "camera" ? "Camera" : "Screen"}`
    elements.stageCaption.textContent = `Duration ${formatTimer(selected.duration)} · Recorded ${selected.at}`
  }

  const renderClips = () => {
    elements.clipList.innerHTML = ""

    state.clips.forEach(clip => {
      const item = document.createElement("li")
      const button = document.createElement("button")
      const isSelected = state.selectedClipId === clip.id
      button.type = "button"
      button.dataset.clipId = String(clip.id)
      button.className = isSelected
        ? "w-full rounded-2xl border border-primary/40 bg-primary/10 p-3 text-left"
        : "w-full rounded-2xl border border-base-300 bg-base-200/70 p-3 text-left"
      button.innerHTML = `<p class=\"text-sm font-semibold\">${clip.title} · ${clip.source === "camera" ? "Camera" : "Screen"}</p><p class=\"text-xs text-base-content/65\">${formatTimer(clip.duration)} · ${clip.at}</p>`
      button.addEventListener("click", () => {
        state.selectedClipId = clip.id
        state.mode = "playback"
        state.status = "reviewing"
        render()
      })
      item.appendChild(button)
      elements.clipList.appendChild(item)
    })

    elements.clipEmpty.classList.toggle("hidden", state.clips.length > 0)
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

  const render = () => {
    const timerText = formatTimer(state.seconds)

    elements.stateBadge.textContent = `State: ${state.status}`
    elements.sourceBadge.textContent = state.source
      ? `Source: ${SOURCE_LABELS[state.source]}`
      : "Source: not selected"
    elements.timerBadge.textContent = `Timer: ${timerText}`
    elements.controlTimer.textContent = timerText

    const hasSource = Boolean(state.source)
    elements.sourceStatusBadge.textContent = hasSource ? "Source selected" : "Select a source first"
    elements.sourceStatusBadge.classList.toggle("badge-success", hasSource)
    elements.sourceStatusBadge.classList.toggle("badge-outline", true)

    elements.cameraDevice.disabled = !hasSource
    elements.micDevice.disabled = !hasSource
    elements.controlHelp.textContent = hasSource
      ? "Switch source at any time while not actively recording."
      : "Select a capture source to unlock recording controls."

    selectSourceButtonStyles(state.source)

    setButtonDisabled(elements.start, !(state.status === "previewing"))
    setButtonDisabled(elements.pause, !(state.status === "recording"))
    setButtonDisabled(elements.resume, !(state.status === "paused"))
    setButtonDisabled(elements.stop, !(state.status === "recording" || state.status === "paused"))

    const canReview = state.mode === "playback" && state.selectedClipId !== null
    ;[elements.clipRename, elements.clipDownload, elements.clipDelete].forEach(button => {
      setButtonDisabled(button, !canReview)
    })
    setButtonDisabled(elements.clipRerecord, !hasSource)

    elements.tabPreview.classList.toggle("tab-active", state.mode === "preview")
    elements.tabPlayback.classList.toggle("tab-active", state.mode === "playback")

    if (state.mode === "playback") {
      setStagePlayback()
    } else {
      setStagePreview()
    }

    renderClips()
  }

  elements.sourceCamera.addEventListener("click", () => {
    state.source = "camera"
    state.status = "previewing"
    state.mode = "preview"
    stopTimer()
    state.seconds = 0
    render()
  })

  elements.sourceScreen.addEventListener("click", () => {
    state.source = "screen"
    state.status = "previewing"
    state.mode = "preview"
    stopTimer()
    state.seconds = 0
    render()
  })

  elements.start.addEventListener("click", () => {
    if (state.status !== "previewing") return
    state.status = "recording"
    state.mode = "preview"
    state.seconds = 0
    startTimer()
    render()
  })

  elements.pause.addEventListener("click", () => {
    if (state.status !== "recording") return
    state.status = "paused"
    stopTimer()
    render()
  })

  elements.resume.addEventListener("click", () => {
    if (state.status !== "paused") return
    state.status = "recording"
    startTimer()
    render()
  })

  elements.stop.addEventListener("click", () => {
    if (!(state.status === "recording" || state.status === "paused")) return
    stopTimer()
    const clip = {
      id: Date.now(),
      title: `Clip ${String(state.clips.length + 1).padStart(2, "0")}`,
      source: state.source || "camera",
      duration: Math.max(5, state.seconds),
      at: formatClockTime(new Date()),
    }
    state.clips = [clip, ...state.clips]
    state.selectedClipId = clip.id
    state.seconds = 0
    state.status = "reviewing"
    state.mode = "playback"
    render()
  })

  elements.tabPreview.addEventListener("click", () => {
    state.mode = "preview"
    if (state.source && !["recording", "paused"].includes(state.status)) {
      state.status = "previewing"
    }
    render()
  })

  elements.tabPlayback.addEventListener("click", () => {
    state.mode = "playback"
    if (state.selectedClipId) {
      state.status = "reviewing"
    }
    render()
  })

  elements.clipRerecord.addEventListener("click", () => {
    if (!state.source) return
    state.status = "previewing"
    state.mode = "preview"
    state.selectedClipId = null
    stopTimer()
    state.seconds = 0
    render()
  })

  elements.clipDelete.addEventListener("click", () => {
    if (!state.selectedClipId) return
    state.clips = state.clips.filter(clip => clip.id !== state.selectedClipId)
    state.selectedClipId = state.clips[0]?.id || null
    state.mode = state.selectedClipId ? "playback" : "preview"
    state.status = state.selectedClipId ? "reviewing" : (state.source ? "previewing" : "idle")
    render()
  })

  window.addEventListener("beforeunload", stopTimer)

  render()
}

document.addEventListener("DOMContentLoaded", initRecordStudio)

document.addEventListener("phx:page-loading-stop", initRecordStudio)
