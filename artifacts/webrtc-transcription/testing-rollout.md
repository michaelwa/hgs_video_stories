# Testing and Rollout

## Test matrix

1. Clip ingest contract:
   - `POST /api/media_clips` returns `media_id` and `had_audio` correctly.
2. Audio gating:
   - when `had_audio` is false, no transcription session is requested.
3. Endpoint auth:
   - unauthorized user cannot mint ephemeral session.
4. Endpoint correctness:
   - valid `media_id` returns ephemeral token and transcription session metadata.
5. Channel auth:
   - user cannot join transcript topic for media they do not own.
6. Idempotency:
   - duplicate `transcript.completed` payload does not duplicate canonical rows.
7. Audit logging:
   - `transcript.audit` always inserts append-only log row.
8. Session lifecycle:
   - `transcript.stop` marks session ended and disallows more canonical writes.
9. Error handling:
   - malformed payload rejected with structured error.

## Operational checks

1. Verify OpenAI API key present only on server runtime config.
2. Verify browser receives only short-lived ephemeral key.
3. Confirm telemetry for recording ingest + transcription lifecycle correlation.
4. Confirm rate limits and payload size caps on channel events.

## Rollout plan

1. Deploy behind feature flag (per user or environment).
2. Enable for internal users first on `/record`.
3. Monitor:
   - clip ingest failures
   - transcription session creation failures
   - channel reject rates
   - duplicate completion events
   - DB insert latency
4. Expand to all users after 24-48 hours of stable telemetry.

## Definition of done

1. `mix precommit` passes.
2. End-to-end happy path works on `/record`.
3. Recording with audio produces clip + canonical completed transcript.
4. Recording without audio produces clip only (no transcription session).
5. Audit table contains raw event history for each transcription session.
