const DB_NAME = "hgs_video_stories_media_db"
const DB_VERSION = 1
const STORE_NAME = "clips"
const LEGACY_MEDIA_LIBRARY_KEY = "hgs_video_stories_media_clips"

const hasIndexedDb = () => typeof window !== "undefined" && "indexedDB" in window

const openDatabase = () =>
  new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB is not available in this browser."))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = event => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {keyPath: "id"})
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("Failed to open media database."))
  })

const readLegacyMetadata = () => {
  try {
    const clips = JSON.parse(localStorage.getItem(LEGACY_MEDIA_LIBRARY_KEY) || "[]")
    return Array.isArray(clips) ? clips : []
  } catch (_error) {
    return []
  }
}

export const supportsPersistentClipStore = hasIndexedDb

export const addClipToStore = async clipRecord => {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    store.put(clipRecord)
    tx.oncomplete = () => resolve(clipRecord)
    tx.onerror = () => reject(tx.error || new Error("Failed to save clip."))
  })
}

export const listClipMetadata = async () => {
  if (!hasIndexedDb()) {
    return readLegacyMetadata()
  }

  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      const clips = (request.result || []).map(clip => ({
        id: clip.id,
        title: clip.title,
        source: clip.source,
        duration_seconds: clip.duration_seconds,
        created_at: clip.created_at,
        size_bytes: clip.size_bytes,
        server_url: clip.server_url || null,
        server_saved_at: clip.server_saved_at || null,
        server_id: clip.server_id || null,
      }))

      clips.sort((a, b) => b.id - a.id)
      resolve(clips)
    }
    request.onerror = () => reject(request.error || new Error("Failed to load clip metadata."))
  })
}

export const getClipById = async id => {
  if (!hasIndexedDb()) return null

  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(id)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error("Failed to load clip."))
  })
}

export const removeClipById = async id => {
  if (!hasIndexedDb()) return false

  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error || new Error("Failed to delete clip."))
  })
}
