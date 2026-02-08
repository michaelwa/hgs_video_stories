import {
  addClipToStore,
  getClipById,
  listClipMetadata,
  removeClipById,
  supportsPersistentClipStore,
} from "./media_clip_store"

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

const initMediaLibrary = () => {
  const page = document.getElementById("media-library-page")
  if (!page || page.dataset.initialized === "true") return
  page.dataset.initialized = "true"

  const elements = {
    emptyState: document.getElementById("media-empty-state"),
    populatedState: document.getElementById("media-populated-state"),
    list: document.getElementById("media-clip-list"),
    title: document.getElementById("media-selected-title"),
    previewVideo: document.getElementById("media-preview-video"),
    previewImage: document.getElementById("media-preview-image"),
    saveServer: document.getElementById("media-save-server"),
    download: document.getElementById("media-download"),
    delete: document.getElementById("media-delete"),
    helper: document.getElementById("media-library-helper"),
    serverLink: document.getElementById("media-server-link"),
    metaSource: document.getElementById("media-meta-source"),
    metaDuration: document.getElementById("media-meta-duration"),
    metaCreated: document.getElementById("media-meta-created"),
    metaSize: document.getElementById("media-meta-size"),
  }

  const state = {
    clips: [],
    selectedId: null,
    previewUrl: null,
  }

  const revokePreviewUrl = () => {
    if (!state.previewUrl) return
    URL.revokeObjectURL(state.previewUrl)
    state.previewUrl = null
  }

  const renderMetadata = async clip => {
    if (!clip) {
      elements.title.textContent = "Selected clip"
      elements.metaSource.textContent = "-"
      elements.metaDuration.textContent = "-"
      elements.metaCreated.textContent = "-"
      elements.metaSize.textContent = "-"
      elements.saveServer.disabled = true
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
    elements.metaSource.textContent = clip.source === "camera" ? "Camera + Microphone" : "Screen / Application"
    elements.metaDuration.textContent = formatTimer(clip.duration_seconds || 0)
    elements.metaCreated.textContent = formatCreatedAt(clip.created_at)
    elements.metaSize.textContent = `${(clip.size_bytes / (1024 * 1024)).toFixed(2)} MB`
    elements.saveServer.disabled = false
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
      elements.helper.textContent = "This clip has metadata only and cannot be previewed or downloaded."
      revokePreviewUrl()
      elements.previewVideo.pause()
      elements.previewVideo.classList.add("hidden")
      elements.previewVideo.removeAttribute("src")
      elements.previewVideo.load()
      elements.previewImage.classList.remove("hidden")
      return
    }

    elements.helper.textContent = "Choose a clip to preview, download, or delete."
    revokePreviewUrl()
    state.previewUrl = URL.createObjectURL(fullClip.blob)
    elements.previewImage.classList.add("hidden")
    elements.previewVideo.classList.remove("hidden")
    elements.previewVideo.src = state.previewUrl
    elements.previewVideo.load()
  }

  const renderList = () => {
    elements.list.innerHTML = ""

    state.clips.forEach(clip => {
      const item = document.createElement("li")
      const button = document.createElement("button")
      const selected = state.selectedId === clip.id
      button.type = "button"
      button.className = selected
        ? "w-full rounded-2xl border border-primary/40 bg-primary/10 p-3 text-left"
        : "w-full rounded-2xl border border-base-300 bg-base-200/70 p-3 text-left"
      button.innerHTML = `<p class=\"text-sm font-semibold\">${clip.title}</p><p class=\"text-xs text-base-content/65\">${formatTimer(clip.duration_seconds || 0)} · ${formatCreatedAt(clip.created_at)}</p>`
      button.addEventListener("click", () => {
        state.selectedId = clip.id
        render().catch(() => {})
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
    const selected = state.clips.find(clip => clip.id === state.selectedId) || state.clips[0]
    await renderMetadata(selected)
  }

  const syncState = async () => {
    state.clips = await listClipMetadata()
    state.selectedId = state.clips[0]?.id ?? null
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

    const uploadFile = new File([fullClip.blob], `${selected.id}.webm`, {
      type: fullClip.blob.type || "video/webm",
    })

    const formData = new FormData()
    formData.append("clip", uploadFile)
    formData.append("title", selected.title)
    formData.append("source", selected.source)
    formData.append("duration_seconds", String(selected.duration_seconds || 0))
    formData.append("created_at", selected.created_at)

    const response = await fetch("/api/media_clips", {
      method: "POST",
      body: formData,
      headers: {
        "x-requested-with": "XMLHttpRequest",
      },
    })

    if (!response.ok) {
      throw new Error("Upload failed")
    }

    const result = await response.json()

    await addClipToStore({
      ...fullClip,
      server_url: result.url,
      server_saved_at: result.saved_at,
      server_id: result.id,
    })

    await syncState()
    state.selectedId = selected.id
    await render()
    elements.helper.textContent = "Clip saved to server."
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

  window.addEventListener("beforeunload", revokePreviewUrl)

  if (!supportsPersistentClipStore()) {
    elements.helper.textContent = "This browser does not support persistent clip storage."
  }

  syncState()
    .then(() => render())
    .catch(() => {
      elements.helper.textContent = "Could not load media library."
    })
}

document.addEventListener("DOMContentLoaded", initMediaLibrary)
document.addEventListener("phx:page-loading-stop", initMediaLibrary)
