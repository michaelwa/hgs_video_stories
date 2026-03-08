# Event and API Contracts

## HTTP: ingest recorded clip (existing endpoint, extended payload)

`POST /api/media_clips`

Request form fields (current + additions):

- `clip` (file)
- `title`
- `source`
- `duration_seconds`
- `created_at`
- `had_audio` (`true|false`)

Response (canonical clip record):

```json
{
  "media_id": "<server-media-id>",
  "title": "Camera + Mic Capture 2:04 PM",
  "source": "camera",
  "duration_seconds": 19,
  "created_at": "2026-03-07T20:00:00Z",
  "saved_at": "2026-03-07T20:00:02Z",
  "size_bytes": 4850120,
  "url": "/uploads/media_clips/123-camera.webm",
  "had_audio": true
}
```

Notes:

- `media_id` is required for downstream transcription binding.
- Browser starts transcription only if `had_audio` is true.

## HTTP: create/reuse transcription session

`POST /api/realtime/sessions`

Request:

```json
{
  "media_id": "<server-media-id>"
}
```

Response:

```json
{
  "transcription_session_id": "<uuid>",
  "media_id": "<server-media-id>",
  "openai": {
    "ephemeral_key": "<short-lived-client-secret>",
    "expires_at": "2026-03-07T20:00:00Z",
    "model": "gpt-4o-transcribe",
    "turn_detection": "server_vad"
  }
}
```

## Channel topic

`transcripts:<media_id>`

Join payload:

```json
{
  "transcription_session_id": "<uuid>"
}
```

## Channel events from browser

### `transcript.completed`

Purpose: canonical persist.

```json
{
  "transcription_session_id": "<uuid>",
  "media_id": "<server-media-id>",
  "item_id": "<openai-item-id>",
  "seq": 1,
  "text": "Final transcript text for this completed segment.",
  "source_ts": "2026-03-07T20:00:02.123Z",
  "received_ts": "2026-03-07T20:00:02.310Z"
}
```

### `transcript.audit`

Purpose: append-only raw event archive.

```json
{
  "transcription_session_id": "<uuid>",
  "media_id": "<server-media-id>",
  "event_type": "conversation.item.input_audio_transcription.completed",
  "item_id": "<openai-item-id>",
  "source_ts": "2026-03-07T20:00:02.123Z",
  "payload": {
    "...": "raw event payload"
  }
}
```

### `transcript.stop`

Purpose: close active session for the media item.

```json
{
  "transcription_session_id": "<uuid>",
  "reason": "user_stopped"
}
```

## Server behavior

1. Reject events where topic `media_id` does not match payload `media_id`.
2. Reject events where user lacks media access.
3. Upsert `transcript.completed` by unique key.
4. Insert `transcript.audit` rows append-only.
5. Return acknowledgements with deterministic status (`ok`, `duplicate`, `error`).
