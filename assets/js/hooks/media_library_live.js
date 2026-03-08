import {addClipToStore, getClipById, listClipMetadata, removeClipById, supportsPersistentClipStore} from "../media_clip_store"
import {uploadClipToServer} from "../media_clip_ingest"

const MediaLibrary = {
  mounted() {
    this.previewUrl = null
    this.selectedPreviewId = null
    this.syncOnFocus = () => this.syncClips()

    this.handleEvent("media-upload-request", payload => {
      this.uploadClip(payload?.clipId)
    })

    this.handleEvent("media-download-request", payload => {
      this.downloadClip(payload?.clipId)
    })

    this.handleEvent("media-delete-request", payload => {
      this.deleteClip(payload?.clipId)
    })

    window.addEventListener("focus", this.syncOnFocus)
    this.syncClips()
    this.loadSelectedPreview()
  },

  updated() {
    this.loadSelectedPreview()
  },

  destroyed() {
    this.revokePreviewUrl()
    window.removeEventListener("focus", this.syncOnFocus)
  },

  async syncClips() {
    if (!supportsPersistentClipStore()) {
      this.pushEvent("sync_error", {
        message: "This browser does not support persistent clip storage.",
      })
      return
    }

    try {
      const clips = await listClipMetadata()
      this.pushEvent("sync_clips", {clips})
    } catch (_error) {
      this.pushEvent("sync_error", {message: "Could not load media library."})
    }
  },

  async loadSelectedPreview() {
    const selectedId = this.el.dataset.selectedId
    const previewVideo = document.getElementById("media-preview-video")
    const previewImage = document.getElementById("media-preview-image")

    if (!previewVideo || !previewImage) return

    if (!selectedId) {
      this.selectedPreviewId = null
      this.revokePreviewUrl()
      previewVideo.pause()
      previewVideo.classList.add("hidden")
      previewVideo.removeAttribute("src")
      previewVideo.load()
      previewImage.classList.remove("hidden")
      return
    }

    if (this.selectedPreviewId === selectedId && previewVideo.getAttribute("src")) {
      return
    }

    const fullClip = await getClipById(Number(selectedId))

    if (!fullClip?.blob) {
      this.selectedPreviewId = selectedId
      this.revokePreviewUrl()
      previewVideo.pause()
      previewVideo.classList.add("hidden")
      previewVideo.removeAttribute("src")
      previewVideo.load()
      previewImage.classList.remove("hidden")
      return
    }

    this.selectedPreviewId = selectedId
    this.revokePreviewUrl()
    this.previewUrl = URL.createObjectURL(fullClip.blob)
    previewImage.classList.add("hidden")
    previewVideo.classList.remove("hidden")
    previewVideo.src = this.previewUrl
    previewVideo.load()
  },

  revokePreviewUrl() {
    if (!this.previewUrl) return
    URL.revokeObjectURL(this.previewUrl)
    this.previewUrl = null
  },

  async uploadClip(clipId) {
    try {
      const fullClip = await getClipById(Number(clipId))

      if (!fullClip?.blob) {
        this.pushEvent("media_action_error", {message: "Cannot upload clip because local blob is unavailable."})
        return
      }

      const result = await uploadClipToServer({
        blob: fullClip.blob,
        id: fullClip.id,
        title: fullClip.title,
        source: fullClip.source,
        durationSeconds: fullClip.duration_seconds,
        createdAt: fullClip.created_at,
        hadAudio: fullClip.had_audio || false,
      })

      await addClipToStore({
        ...fullClip,
        server_url: result.url,
        server_saved_at: result.saved_at,
        server_id: result.media_id ?? result.id,
      })

      const clips = await listClipMetadata()
      this.pushEvent("media_upload_complete", {
        clips,
        message: "Clip saved to server.",
      })
    } catch (_error) {
      this.pushEvent("media_action_error", {message: "Could not save clip to server."})
    }
  },

  async downloadClip(clipId) {
    try {
      const fullClip = await getClipById(Number(clipId))
      if (!fullClip?.blob) {
        this.pushEvent("media_action_error", {message: "Cannot download clip because local blob is unavailable."})
        return
      }

      const url = URL.createObjectURL(fullClip.blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${(fullClip.title || "capture").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.webm`
      link.click()
      URL.revokeObjectURL(url)
      this.pushEvent("media_action_complete", {message: "Download started."})
    } catch (_error) {
      this.pushEvent("media_action_error", {message: "Could not download clip."})
    }
  },

  async deleteClip(clipId) {
    try {
      await removeClipById(Number(clipId))
      const clips = await listClipMetadata()
      this.pushEvent("media_delete_complete", {
        clips,
        message: "Clip deleted.",
      })
    } catch (_error) {
      this.pushEvent("media_action_error", {message: "Could not delete clip."})
    }
  },
}

export default MediaLibrary
