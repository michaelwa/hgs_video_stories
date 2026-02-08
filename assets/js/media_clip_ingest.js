export const uploadClipToServer = async ({blob, id, title, source, durationSeconds, createdAt}) => {
  const uploadFile = new File([blob], `${id}.webm`, {
    type: blob.type || "video/webm",
  })

  const formData = new FormData()
  formData.append("clip", uploadFile)
  formData.append("title", title)
  formData.append("source", source)
  formData.append("duration_seconds", String(durationSeconds || 0))
  formData.append("created_at", createdAt)

  const response = await fetch("/api/media_clips", {
    method: "POST",
    body: formData,
    headers: {
      "x-requested-with": "XMLHttpRequest",
    },
  })

  if (!response.ok) {
    let reason = "Upload failed"
    try {
      const json = await response.json()
      if (json?.error) {
        reason = json.error
      }
    } catch (_error) {
    }
    throw new Error(reason)
  }

  return response.json()
}
