const MEDIA_LIBRARY_KEY = "hgs_video_stories_media_clips"

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

const loadStoredClips = () => {
  try {
    return JSON.parse(localStorage.getItem(MEDIA_LIBRARY_KEY) || "[]")
  } catch (_error) {
    return []
  }
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
    metaSource: document.getElementById("media-meta-source"),
    metaDuration: document.getElementById("media-meta-duration"),
    metaCreated: document.getElementById("media-meta-created"),
    metaSize: document.getElementById("media-meta-size"),
  }

  const state = {
    clips: loadStoredClips(),
    selectedId: null,
  }

  if (state.clips.length > 0) {
    state.selectedId = state.clips[0].id
  }

  const renderMetadata = clip => {
    if (!clip) {
      elements.title.textContent = "Selected clip"
      elements.metaSource.textContent = "-"
      elements.metaDuration.textContent = "-"
      elements.metaCreated.textContent = "-"
      elements.metaSize.textContent = "-"
      return
    }

    elements.title.textContent = clip.title
    elements.metaSource.textContent = clip.source === "camera" ? "Camera + Microphone" : "Screen / Application"
    elements.metaDuration.textContent = formatTimer(clip.duration_seconds || 0)
    elements.metaCreated.textContent = formatCreatedAt(clip.created_at)
    elements.metaSize.textContent = `${(clip.size_bytes / (1024 * 1024)).toFixed(2)} MB`
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
        render()
      })
      item.appendChild(button)
      elements.list.appendChild(item)
    })
  }

  const render = () => {
    const hasClips = state.clips.length > 0
    elements.emptyState.classList.toggle("hidden", hasClips)
    elements.populatedState.classList.toggle("hidden", !hasClips)

    if (!hasClips) return

    renderList()
    const selected = state.clips.find(clip => clip.id === state.selectedId) || state.clips[0]
    renderMetadata(selected)
  }

  render()
}

document.addEventListener("DOMContentLoaded", initMediaLibrary)
document.addEventListener("phx:page-loading-stop", initMediaLibrary)
