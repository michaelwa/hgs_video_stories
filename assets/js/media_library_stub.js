import {
  addClipToStore,
  getClipById,
  listClipMetadata,
  removeClipById,
  supportsPersistentClipStore,
} from "./media_clip_store"
import {uploadClipToServer} from "./media_clip_ingest"
import {Socket as PhoenixSocket} from "phoenix"

const formatTimer = totalSeconds => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

const formatCreatedAt = iso => {
  const date = new Date(iso)
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

const formatTimelineMs = totalMs => {
  const safeMs = Math.max(0, totalMs || 0)
  const minutes = Math.floor(safeMs / 60_000)
  const seconds = Math.floor((safeMs % 60_000) / 1000)
  const milliseconds = safeMs % 1000
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`
}

const SOURCE_DISPLAY_LABELS = {
  camera: "Camera + Microphone",
  camera_only: "Camera only",
  mic_only: "Microphone only",
  screen: "Screen / Application + Audio",
  screen_only: "Screen / Application only",
}
const formatTimelineStatus = clip => {
  if (!clip.server_url) return "Upload required"
  if (!clip.had_audio) return "No audio"

  switch (clip.timeline_status) {
    case "completed":
      return "Timeline ready"
    case "pending":
      return "Queued"
    case "processing":
      return "Processing"
    case "failed":
      return "Failed"
    default:
      return "Not generated"
  }
}

const timelineButtonLabel = clip => {
  if (!clip.server_url) return "Upload First"
  if (!clip.had_audio) return "No Audio"
  if (clip.timeline_status === "completed") return "Timeline Ready"
  if (clip.timeline_status === "pending" || clip.timeline_status === "processing") {
    return "Timeline Queued"
  }
  if (clip.timeline_status === "failed") return "Retry Timeline"
  return "Generate Timeline"
}

const timelineButtonDisabled = clip => {
  if (!clip.server_url) return true
  if (!clip.had_audio) return true
  return clip.timeline_status === "pending" || clip.timeline_status === "processing" || clip.timeline_status === "completed"
}

const fetchTimelineStatuses = async mediaIds => {
  if (mediaIds.length === 0) return new Map()

  const response = await fetch(`/api/media_clips/timeline_transcriptions?media_ids=${mediaIds.join(",")}`, {
    headers: {
      accept: "application/json",
      "x-requested-with": "XMLHttpRequest",
    },
  })

  if (!response.ok) {
    throw new Error("Could not load timeline transcription statuses.")
  }

  const payload = await response.json()
  const items = Array.isArray(payload?.items) ? payload.items : []
  return new Map(items.map(item => [item.media_id, item]))
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

  const payload = await response.json()
  return payload.timeline_transcription
}

const fetchTimelineDetail = async mediaId => {
  const response = await fetch(`/api/media_clips/${mediaId}/timeline_transcription`, {
    headers: {
      accept: "application/json",
      "x-requested-with": "XMLHttpRequest",
    },
  })

  if (!response.ok) {
    throw new Error("Could not load timeline segments.")
  }

  return response.json()
}

const connectMediaTimelineChannel = () =>
  new Promise((resolve, reject) => {
    const socket = new PhoenixSocket("/socket")
    socket.connect()

    const channel = socket.channel("media_timeline", {})

    channel.join()
      .receive("ok", () => resolve({socket, channel}))
      .receive("error", payload => {
        socket.disconnect()
        reject(new Error(payload?.reason || "Could not join media timeline channel."))
      })
      .receive("timeout", () => {
        socket.disconnect()
        reject(new Error("Timed out joining media timeline channel."))
      })
  })

const initMediaLibrary = () => {
  const page = document.getElementById("media-library-page")
  if (!page || page.dataset.initialized === "true") return
  page.dataset.initialized = "true"

  const elements = {
    emptyState: document.getElementById("media-empty-state"),
    populatedState: document.getElementById("media-populated-state"),
    list: document.getElementById("media-clip-list"),
    selectedPanel: document.getElementById("media-selected-panel"),
    title: document.getElementById("media-selected-title"),
    previewVideo: document.getElementById("media-preview-video"),
    previewImage: document.getElementById("media-preview-image"),
    saveServer: document.getElementById("media-save-server"),
    generateTimeline: document.getElementById("media-generate-timeline"),
    viewTimeline: document.getElementById("media-view-timeline"),
    download: document.getElementById("media-download"),
    delete: document.getElementById("media-delete"),
    helper: document.getElementById("media-library-helper"),
    timelineHelper: document.getElementById("media-timeline-helper"),
    serverLink: document.getElementById("media-server-link"),
    metaSource: document.getElementById("media-meta-source"),
    metaDuration: document.getElementById("media-meta-duration"),
    metaCreated: document.getElementById("media-meta-created"),
    metaSize: document.getElementById("media-meta-size"),
    metaTimeline: document.getElementById("media-meta-timeline"),
    timelinePanel: document.getElementById("media-timeline-panel"),
    timelineSummary: document.getElementById("media-timeline-summary"),
    timelineSegments: document.getElementById("media-timeline-segments"),
    timelineModeToggle: document.getElementById("media-timeline-mode-toggle"),
    timelineModeRaw: document.getElementById("media-timeline-mode-raw"),
    timelineModeAccurate: document.getElementById("media-timeline-mode-accurate"),
  }

  const state = {
    clips: [],
    selectedId: null,
    previewUrl: null,
    timelineStatuses: new Map(),
    timelineDetails: new Map(),
    channelConnection: null,
    timelinePanelOpen: false,
    timelinePanelMode: "raw",
  }

  const decorateClip = clip => {
    const timeline = state.timelineStatuses.get(clip.id)
    return {
      ...clip,
      timeline_status: timeline?.status || null,
      timeline_segment_count: timeline?.segment_count || 0,
      timeline_error_message: timeline?.error_message || null,
    }
  }

  const revokePreviewUrl = () => {
    if (!state.previewUrl) return
    URL.revokeObjectURL(state.previewUrl)
    state.previewUrl = null
  }

  const refreshTimelineStatuses = async () => {
    state.timelineStatuses = await fetchTimelineStatuses(state.clips.map(clip => clip.id))
  }

  const applyTimelineStatusUpdate = payload => {
    if (!payload || typeof payload.media_id !== "number") return

    state.timelineStatuses.set(payload.media_id, payload)

    if (payload.status !== "completed") {
      state.timelineDetails.delete(payload.media_id)
    }
  }

  const ensureTimelineDetailLoaded = async clip => {
    if (!clip || !clip.server_url || !clip.had_audio) return null

    const cached = state.timelineDetails.get(clip.id)
    if (cached) return cached

    const detail = await fetchTimelineDetail(clip.id)
    state.timelineDetails.set(clip.id, detail)
    return detail
  }

  const renderTimelineModeToggle = clip => {
    const accurateAvailable = clip?.timeline_status === "completed"

    elements.timelineModeToggle.classList.toggle("hidden", !clip)
    elements.timelineModeRaw.classList.toggle("btn-primary", state.timelinePanelMode === "raw")
    elements.timelineModeRaw.classList.toggle("btn-ghost", state.timelinePanelMode !== "raw")
    elements.timelineModeAccurate.classList.toggle("btn-primary", state.timelinePanelMode === "accurate")
    elements.timelineModeAccurate.classList.toggle("btn-ghost", state.timelinePanelMode !== "accurate")
    elements.timelineModeAccurate.disabled = !accurateAvailable
  }

  const renderTimelinePanel = async clip => {
    elements.timelineSegments.replaceChildren()

    if (!clip || !state.timelinePanelOpen) {
      elements.timelinePanel.classList.add("hidden")
      elements.timelineModeToggle.classList.add("hidden")
      return
    }

    renderTimelineModeToggle(clip)

    const detail = await ensureTimelineDetailLoaded(clip)
    const previewSegments = Array.isArray(detail?.preview_segments) ? detail.preview_segments : []
    const accurateSegments = Array.isArray(detail?.timeline_segments) ? detail.timeline_segments : []

    if (state.timelinePanelMode === "raw") {
      elements.timelineSummary.textContent =
        previewSegments.length > 0
          ? `${previewSegments.length} raw transcript segment${previewSegments.length === 1 ? "" : "s"} from the live preview pass.`
          : "No raw transcript segments are available."

      if (previewSegments.length === 0) {
        const item = document.createElement("li")
        item.className = "rounded-xl border border-dashed border-base-300 bg-base-200/40 px-4 py-3 text-sm text-base-content/65"
        item.textContent = "No raw transcript segments are available."
        elements.timelineSegments.appendChild(item)
      } else {
        previewSegments.forEach(segment => {
          const item = document.createElement("li")
          item.className = "rounded-2xl border border-base-300 bg-base-200/50 px-4 py-3"

          const seq = document.createElement("p")
          seq.className = "text-[11px] font-medium uppercase tracking-wide text-base-content/55"
          seq.textContent = `Raw Segment ${segment.seq}`

          const text = document.createElement("p")
          text.className = "mt-2 text-sm text-base-content/80"
          text.textContent = segment.text

          item.appendChild(seq)
          item.appendChild(text)
          elements.timelineSegments.appendChild(item)
        })
      }

      elements.timelinePanel.classList.remove("hidden")
      return
    }

    if (clip.timeline_status !== "completed") {
      elements.timelineSummary.textContent = "Timeline segments will be available after processing completes."
      const item = document.createElement("li")
      item.className = "rounded-xl border border-dashed border-base-300 bg-base-200/40 px-4 py-3 text-sm text-base-content/65"
      item.textContent = clip.timeline_status === "failed"
        ? clip.timeline_error_message || "Timeline generation failed."
        : "No timeline is available for this clip yet."
      elements.timelineSegments.appendChild(item)
      elements.timelinePanel.classList.remove("hidden")
      return
    }

    elements.timelineSummary.textContent =
      accurateSegments.length > 0
        ? `${accurateSegments.length} timestamped segment${accurateSegments.length === 1 ? "" : "s"} from the accurate timeline pass.`
        : "Timeline completed, but no segments were returned."

    if (accurateSegments.length === 0) {
      const item = document.createElement("li")
      item.className = "rounded-xl border border-dashed border-base-300 bg-base-200/40 px-4 py-3 text-sm text-base-content/65"
      item.textContent = "No timeline segments are available."
      elements.timelineSegments.appendChild(item)
    } else {
      accurateSegments.forEach(segment => {
        const item = document.createElement("li")
        item.className = "rounded-2xl border border-base-300 bg-base-200/50 px-4 py-3"

        const heading = document.createElement("div")
        heading.className = "flex items-center justify-between gap-3"

        const seq = document.createElement("p")
        seq.className = "text-[11px] font-medium uppercase tracking-wide text-base-content/55"
        seq.textContent = `Segment ${segment.seq}`

        const time = document.createElement("p")
        time.className = "rounded-full border border-base-300 bg-base-100 px-2 py-1 text-[11px] font-medium text-base-content/70"
        time.textContent = `${formatTimelineMs(segment.start_ms)} - ${formatTimelineMs(segment.end_ms)}`

        const text = document.createElement("p")
        text.className = "mt-2 text-sm text-base-content/80"
        text.textContent = segment.text

        heading.appendChild(seq)
        heading.appendChild(time)
        item.appendChild(heading)
        item.appendChild(text)
        elements.timelineSegments.appendChild(item)
      })
    }

    elements.timelinePanel.classList.remove("hidden")
  }

  const renderMetadata = async clip => {
    if (!clip) {
      elements.title.textContent = "Selected clip"
      elements.metaSource.textContent = "-"
      elements.metaDuration.textContent = "-"
      elements.metaCreated.textContent = "-"
      elements.metaSize.textContent = "-"
      elements.metaTimeline.textContent = "-"
      elements.saveServer.disabled = true
      elements.generateTimeline.disabled = true
      elements.viewTimeline.disabled = true
      elements.download.disabled = true
      elements.delete.disabled = true
      elements.serverLink.classList.add("hidden")
      elements.serverLink.href = "#"
      elements.previewVideo.pause()
      elements.previewVideo.classList.add("hidden")
      elements.previewVideo.removeAttribute("src")
      elements.previewVideo.load()
      elements.previewImage.classList.remove("hidden")
      return
    }

    elements.title.textContent = clip.title
    elements.metaSource.textContent = SOURCE_DISPLAY_LABELS[clip.source] || "Unknown"
    elements.metaDuration.textContent = formatTimer(clip.duration_seconds || 0)
    elements.metaCreated.textContent = formatCreatedAt(clip.created_at)
    elements.metaSize.textContent = `${(clip.size_bytes / (1024 * 1024)).toFixed(2)} MB`
    elements.metaTimeline.textContent = formatTimelineStatus(clip)
    elements.saveServer.disabled = false
    elements.generateTimeline.disabled = timelineButtonDisabled(clip)
    elements.generateTimeline.textContent = timelineButtonLabel(clip)
    elements.viewTimeline.disabled = !clip.server_url || !clip.had_audio
    elements.viewTimeline.textContent = state.timelinePanelOpen ? "Hide Transcript" : "Show Transcript"
    elements.download.disabled = false
    elements.delete.disabled = false

    if (clip.server_url) {
      elements.saveServer.textContent = "Saved to Server"
      elements.serverLink.classList.remove("hidden")
      elements.serverLink.href = clip.server_url
    } else {
      elements.saveServer.textContent = "Save to Server"
      elements.serverLink.classList.add("hidden")
      elements.serverLink.href = "#"
    }

    const fullClip = await getClipById(clip.id)
    if (!fullClip?.blob) {
      elements.download.disabled = true
      elements.delete.disabled = true
      elements.saveServer.disabled = true
      elements.generateTimeline.disabled = true
      elements.viewTimeline.disabled = true
      elements.helper.textContent = "This clip has metadata only and cannot be previewed or downloaded."
      revokePreviewUrl()
      elements.previewVideo.pause()
      elements.previewVideo.classList.add("hidden")
      elements.previewVideo.removeAttribute("src")
      elements.previewVideo.load()
      elements.previewImage.classList.remove("hidden")
      return
    }

    if (!clip.server_url) {
      elements.helper.textContent = "Save this clip to the server before requesting a timeline transcription."
    } else if (!clip.had_audio) {
      elements.helper.textContent = "This clip has no audio track, so timeline transcription is unavailable."
    } else if (clip.timeline_status === "completed") {
      elements.helper.textContent = `Timeline transcription is ready (${clip.timeline_segment_count} segments).`
    } else if (clip.timeline_status === "failed" && clip.timeline_error_message) {
      elements.helper.textContent = `Timeline transcription failed: ${clip.timeline_error_message}`
    } else if (clip.timeline_status === "pending" || clip.timeline_status === "processing") {
      elements.helper.textContent = "Timeline transcription is queued on the server."
    } else {
      elements.helper.textContent = "Choose whether this clip is worth the extra timeline transcription cost."
    }

    revokePreviewUrl()
    state.previewUrl = URL.createObjectURL(fullClip.blob)
    elements.previewImage.classList.add("hidden")
    elements.previewVideo.classList.remove("hidden")
    elements.previewVideo.src = state.previewUrl
    elements.previewVideo.load()

    await renderTimelinePanel(clip)
  }

  const renderList = () => {
    elements.list.innerHTML = ""

    state.clips.forEach(baseClip => {
      const clip = decorateClip(baseClip)
      const item = document.createElement("li")
      const button = document.createElement("button")
      const selected = state.selectedId === clip.id
      const tone = clip.timeline_status === "completed"
        ? "border-emerald-300/70 bg-emerald-50"
        : clip.timeline_status === "failed"
          ? "border-rose-300/70 bg-rose-50"
          : clip.timeline_status === "pending" || clip.timeline_status === "processing"
            ? "border-amber-300/70 bg-amber-50"
            : "border-base-300 bg-base-200/70"

      button.type = "button"
      button.className = selected
        ? `w-full rounded-2xl border p-3 text-left ${tone} ring-2 ring-primary/40 shadow-sm`
        : `w-full rounded-2xl border p-3 text-left ${tone}`

      button.innerHTML =
        `<div class="flex items-start justify-between gap-3">` +
        `<div>` +
        `<p class="text-sm font-semibold">${clip.title}</p>` +
        `<p class="text-xs text-base-content/65">${formatTimer(clip.duration_seconds || 0)} · ${formatCreatedAt(clip.created_at)}</p>` +
        `</div>` +
        `<span class="rounded-full border border-base-300 bg-base-100 px-2 py-1 text-[11px] font-medium text-base-content/70">${formatTimelineStatus(clip)}</span>` +
        `</div>`

      button.addEventListener("click", () => {
        state.selectedId = clip.id
        state.timelinePanelOpen = false
        state.timelinePanelMode = "raw"
        render()
          .then(() => {
            elements.selectedPanel?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            })
          })
          .catch(() => {})
      })

      item.appendChild(button)
      elements.list.appendChild(item)
    })
  }

  const render = async () => {
    const hasClips = state.clips.length > 0
    elements.emptyState.classList.toggle("hidden", hasClips)
    elements.populatedState.classList.toggle("hidden", !hasClips)

    if (!hasClips) return

    renderList()
    const selectedClip =
      state.clips.find(clip => clip.id === state.selectedId) || state.clips[0]

    await renderMetadata(selectedClip ? decorateClip(selectedClip) : null)
  }

  const syncState = async () => {
    state.clips = await listClipMetadata()
    state.selectedId = state.selectedId || state.clips[0]?.id || null
    await refreshTimelineStatuses()
  }

  const downloadSelected = async () => {
    const selected = state.clips.find(clip => clip.id === state.selectedId)
    if (!selected) return
    const fullClip = await getClipById(selected.id)
    if (!fullClip?.blob) return

    const url = URL.createObjectURL(fullClip.blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${selected.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "capture"}.webm`
    link.click()
    URL.revokeObjectURL(url)
  }

  const deleteSelected = async () => {
    const selected = state.clips.find(clip => clip.id === state.selectedId)
    if (!selected) return
    await removeClipById(selected.id)
    await syncState()
    await render()
  }

  const saveSelectedToServer = async () => {
    const selected = state.clips.find(clip => clip.id === state.selectedId)
    if (!selected) return
    if (selected.server_url) {
      elements.helper.textContent = "This clip already has a server copy."
      return
    }

    const fullClip = await getClipById(selected.id)
    if (!fullClip?.blob) {
      elements.helper.textContent = "Cannot upload clip because local blob is unavailable."
      return
    }

    elements.saveServer.disabled = true
    elements.saveServer.textContent = "Saving..."
    elements.helper.textContent = "Uploading clip to server..."

    const result = await uploadClipToServer({
      blob: fullClip.blob,
      id: selected.id,
      title: selected.title,
      source: selected.source,
      durationSeconds: selected.duration_seconds,
      createdAt: selected.created_at,
      hadAudio: selected.had_audio || false,
    })

    await addClipToStore({
      ...fullClip,
      server_url: result.url,
      server_saved_at: result.saved_at,
      server_id: result.media_id ?? result.id,
    })

    await syncState()
    state.selectedId = selected.id
    await render()
    elements.helper.textContent = "Clip saved to server."
  }

  const generateSelectedTimeline = async () => {
    const selected = state.clips.find(clip => clip.id === state.selectedId)
    if (!selected) return

    const selectedClip = decorateClip(selected)
    if (!selectedClip.server_url) {
      elements.helper.textContent = "Save the clip to the server before requesting a timeline."
      return
    }

    if (!selectedClip.had_audio) {
      elements.helper.textContent = "This clip has no audio track."
      return
    }

    elements.generateTimeline.disabled = true
    elements.generateTimeline.textContent = "Queueing..."
    elements.helper.textContent = "Queueing timeline transcription..."

    await queueTimelineTranscription(selectedClip.id)
    applyTimelineStatusUpdate({
      media_id: selectedClip.id,
      status: "pending",
      timeline_available: false,
      segment_count: 0,
      error_message: null,
      model: "whisper-1",
    })
    await render()
    elements.helper.textContent = "Timeline transcription queued."
  }

  const cleanupChannel = () => {
    const connection = state.channelConnection
    if (!connection) return
    connection.channel.leave()
    connection.socket.disconnect()
    state.channelConnection = null
  }

  elements.download.addEventListener("click", () => {
    downloadSelected().catch(() => {})
  })
  elements.delete.addEventListener("click", () => {
    deleteSelected().catch(() => {})
  })
  elements.saveServer.addEventListener("click", () => {
    saveSelectedToServer().catch(() => {
      elements.helper.textContent = "Could not save clip to server."
      render().catch(() => {})
    })
  })
  elements.generateTimeline.addEventListener("click", () => {
    generateSelectedTimeline().catch(error => {
      elements.helper.textContent = error.message || "Could not queue timeline transcription."
      render().catch(() => {})
    })
  })
  elements.viewTimeline.addEventListener("click", () => {
    state.timelinePanelOpen = !state.timelinePanelOpen
    render()
      .then(() => {
        if (state.timelinePanelOpen) {
          elements.timelinePanel?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
        }
      })
      .catch(() => {})
  })
  elements.timelineModeRaw.addEventListener("click", () => {
    state.timelinePanelMode = "raw"
    render().catch(() => {})
  })
  elements.timelineModeAccurate.addEventListener("click", () => {
    state.timelinePanelMode = "accurate"
    render().catch(() => {})
  })

  window.addEventListener("beforeunload", revokePreviewUrl)
  window.addEventListener("beforeunload", cleanupChannel)

  if (!supportsPersistentClipStore()) {
    elements.helper.textContent = "This browser does not support persistent clip storage."
  }

  Promise.all([syncState(), connectMediaTimelineChannel()])
    .then(async ([, connection]) => {
      state.channelConnection = connection

      connection.channel.on("timeline.status_updated", payload => {
        applyTimelineStatusUpdate(payload)
        render().catch(() => {})
      })

      await render()
    })
    .catch(() => {
      elements.helper.textContent = "Could not load media library."
      elements.timelineHelper.textContent = "Timeline transcription status is unavailable right now."
    })
}

document.addEventListener("DOMContentLoaded", initMediaLibrary)
