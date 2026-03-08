# Architecture

## Objective

Use the existing `/record` capture lifecycle to produce both:

1. persisted media clip (video/audio) and
2. persisted transcript (when audio is present)

while keeping API keys and persistence policy under Phoenix control.

## Topology

1. User records clip via existing browser `MediaRecorder` flow on `/record`.
2. Browser uploads clip to `POST /api/media_clips` (existing ingest path).
3. If capture has audio, browser starts a transcription session bound to the saved `media_id`.
4. Browser establishes direct WebRTC session with OpenAI Realtime.
5. Browser forwards selected transcript events to Phoenix Channel for persistence.
6. Phoenix persists canonical transcript rows and raw event audit rows.

## Data-plane and control-plane split

- Data plane: browser audio and transcript stream over WebRTC directly with OpenAI.
- Control plane: session authorization, policy, persistence, and audit via Phoenix.

## Components

- Browser UI (`/record`):
  - Existing capture controls and `MediaRecorder` implementation remain in place.
  - Determines whether audio is present in the recording mode/track set.
  - Starts transcription only after clip ingest returns a server `media_id`.
  - Renders local delta text and sends completed/audit events to Phoenix.
- Phoenix endpoints:
  - Existing clip ingest endpoint (`/api/media_clips`).
  - New endpoint to mint short-lived Realtime session (`Req`) bound to `media_id`.
- Phoenix Channel (`transcripts:<media_id>`):
  - Authenticates user/session ownership.
  - Validates payload shape and size.
  - Performs idempotent writes.
- Storage:
  - Canonical transcript segment table (final text only).
  - Raw event log table (audit, replay, debug).

## Sequence

1. User starts/stops recording on `/record`.
2. Browser creates blob and uploads via existing `uploadClipToServer`.
3. Server responds with persisted clip metadata including canonical `media_id`.
4. Browser checks audio presence (`had_audio`) from capture mode/tracks.
5. If no audio: workflow ends with saved clip only.
6. If audio exists:
   - Browser calls `POST /api/realtime/sessions` with `media_id`.
   - Phoenix verifies access, creates/reuses active transcription session.
   - Phoenix requests ephemeral token from OpenAI and returns client-safe session details.
   - Browser negotiates SDP with OpenAI Realtime endpoint.
7. Browser handles transcript events:
   - `conversation.item.input_audio_transcription.delta` (UI only)
   - `conversation.item.input_audio_transcription.completed` (persist)
8. Browser pushes canonical and audit payloads to channel.
9. Phoenix upserts canonical segment and inserts raw audit rows.
10. Browser ends transcription and Phoenix closes session status.

## Diarization note

Diarization means per-segment speaker attribution (for example `speaker_a`, `speaker_b`, timestamps). It is deferred from v1 to reduce complexity. If required later, extend the canonical segment schema with speaker fields and add attribution pipeline logic.
