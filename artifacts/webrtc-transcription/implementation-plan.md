# Implementation Plan

## Phase 1: Align existing clip ingest with transcription lifecycle

1. Ensure `POST /api/media_clips` returns stable server `media_id` for downstream transcription binding.
2. Add/return `had_audio` metadata from `/record` capture flow.
3. Update `/record` JS flow to branch:
   - save clip only when `had_audio == false`
   - save clip + transcription when `had_audio == true`

## Phase 2: Transcription schema and context

1. Add migration for `transcription_sessions`.
2. Add migration for `transcription_segments` (canonical completed text).
3. Add migration for `transcription_event_logs` (raw audit payloads).
4. Add Ecto schemas and context module (`MediaTranscription` or equivalent).
5. Add DB constraints:
   - one active session per media item
   - unique segment key for idempotency

## Phase 3: Realtime session bootstrap

1. Add `POST /api/realtime/sessions` endpoint.
2. Validate user access to `media_id` from clip ingest.
3. Create or reuse active transcription session for the media item.
4. Call OpenAI Realtime sessions API via `Req` with transcription config.
5. Return ephemeral client secret + app session metadata.

## Phase 4: Channel ingestion

1. Add channel topic `transcripts:<media_id>`.
2. Authorize user against media ownership/permission.
3. Add channel events:
   - `transcript.completed`
   - `transcript.audit`
   - `transcript.stop`
4. Implement payload validation and bounded size checks.
5. Persist canonical rows and audit rows with idempotency guarantees.

## Phase 5: Browser integration on `/record`

1. Add JS module for OpenAI WebRTC transcription session handling.
2. Hook transcription start after successful clip ingest response.
3. Render local partial text from delta events (no DB write).
4. On completed events, push canonical payload to channel.
5. Push raw event envelopes for audit logging.
6. Update `/record` UI statuses to show ingest and transcription independently.

## Phase 6: Observability and reliability

1. Add structured logs for clip ingest, transcription start/stop, persist failures.
2. Add telemetry events for recording and transcription lifecycle correlation.
3. Add retry behavior for temporary channel disconnects.
4. Add guardrails to avoid duplicate transcription start for same `media_id`.

## Phase 7: Test and polish

1. Context tests for idempotent upserts.
2. Channel tests for auth and payload validation.
3. Controller tests for session bootstrap endpoint.
4. JS/integration test for `/record` path:
   - with audio: clip saved + transcription created
   - without audio: clip saved only
5. Run `mix precommit` and fix all failures.

## Delivery split (tickets)

1. Ticket A: media ingest contract update (`media_id`, `had_audio`) + tests.
2. Ticket B: transcription DB + context + tests.
3. Ticket C: bootstrap endpoint + OpenAI Req client + tests.
4. Ticket D: channel + ingestion + tests.
5. Ticket E: `/record` frontend orchestration + telemetry.
