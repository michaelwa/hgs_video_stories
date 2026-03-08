# Data Model

## Existing media clip record

The media clip ingest response/store must expose:

- `media_id` (stable server id)
- `had_audio` (boolean)

This is required so transcription sessions can bind to the exact saved clip and only start when audio is present.

## Table: transcription_sessions

Fields:

- `id` (uuid, pk)
- `media_id` (fk or app-level id)
- `user_id` (fk)
- `status` (`active`, `stopped`, `failed`, `completed`)
- `started_at` (utc_datetime_usec)
- `ended_at` (utc_datetime_usec, nullable)
- `inserted_at`, `updated_at`

Constraints and indexes:

- partial unique index: one active session per media item
- index on `media_id`
- index on `user_id`

## Table: transcription_segments

Canonical final transcript segments only.

Fields:

- `id` (uuid, pk)
- `transcription_session_id` (fk)
- `media_id`
- `item_id` (OpenAI event item id)
- `seq` (integer)
- `text` (string/text)
- `source_ts` (utc_datetime_usec)
- `inserted_at`, `updated_at`

Constraints and indexes:

- unique index on `(transcription_session_id, item_id, seq)`
- index on `(media_id, inserted_at)`

Write rules:

- Upsert by unique key.
- Ignore duplicate writes from retries.

## Table: transcription_event_logs

Append-only raw event audit.

Fields:

- `id` (uuid, pk)
- `transcription_session_id` (fk)
- `media_id`
- `event_type` (string)
- `item_id` (string, nullable)
- `source_ts` (utc_datetime_usec, nullable)
- `payload` (map/json)
- `inserted_at`

Constraints and indexes:

- index on `(transcription_session_id, inserted_at)`
- index on `event_type`
- optional unique hash index for dedupe if needed later

Retention policy options:

1. keep forever (strict audit)
2. archive after N days
3. strip large payload fields after retention threshold
