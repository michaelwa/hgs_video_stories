# Approximate Timeline Ticket

## Goal

Add a second transcript display mode, `Transcription Timeline`, without paying for a second transcription pass.

The timeline will be built from locally measured audio chunk windows tied to Realtime transcript completions. It will be approximate, not word-accurate.

## Product behavior

1. `/record` shows a two-state toggle:
   - `Transcription Preview`
   - `Transcription Timeline`
2. Only one mode is visible at a time.
3. During live recording:
   - `Preview` shows the current live transcript behavior.
   - `Timeline` shows completed transcript chunks mapped to approximate start/end times.
4. After recording stops:
   - both modes remain available for the recorded clip
   - timeline segments stay tied to the same `media_id`

## Technical approach

Use manual client-side chunk timing instead of relying on server VAD timing.

1. Disable automatic turn detection for the live Realtime transcription session.
2. Track local recording/transcription clock in the browser.
3. Commit audio to Realtime in fixed windows, for example every `1500ms`.
4. For each committed chunk, store:
   - `chunk_index`
   - `start_ms`
   - `end_ms`
   - `committed_at`
5. When the corresponding `conversation.item.input_audio_transcription.completed` event arrives, associate it to the oldest unresolved chunk.
6. Persist the transcript text plus `start_ms` and `end_ms` as an approximate timeline segment.

This keeps cost to one transcription pass while producing usable segment-level timing.

## Required code changes

### 1. Session config

Change the Realtime transcription session to use manual commit flow:

1. Set turn detection to `null` in the OpenAI session config.
2. Continue using the transcription session type and transcription model.

### 2. Data model

Extend transcript persistence for approximate timeline support.

Recommended minimal change:

1. Add fields to `transcription_segments`:
   - `start_ms`
   - `end_ms`
   - `display_mode` (`preview` or `timeline`)

Alternative:

1. Create a dedicated `transcription_timeline_segments` table.

Recommendation: keep a separate table only if you want a strong boundary between live preview text and canonical timeline segments. For speed, extending `transcription_segments` is acceptable.

### 3. Channel contract

Add a new client event:

1. `transcript.timeline_completed`

Payload:

```json
{
  "transcription_session_id": "<uuid>",
  "media_id": 1772983811069,
  "item_id": "item_123",
  "seq": 12,
  "text": "Government of the people",
  "start_ms": 42100,
  "end_ms": 43700,
  "source_ts": "2026-03-08T15:32:35.399Z"
}
```

Server behavior:

1. Validate `start_ms <= end_ms`
2. Upsert by `(transcription_session_id, item_id, seq)`
3. Persist timing fields

### 4. Browser runtime

Replace the current live transcription flow with timed chunk commits.

Implementation steps:

1. Start live transcription when recording starts.
2. Maintain `recordingStartedAt = performance.now()`.
3. Every `N ms`:
   - capture current elapsed time window
   - push/commit audio chunk to Realtime
   - enqueue a pending chunk record locally
4. On `completed` event:
   - pop the earliest unresolved chunk
   - emit both:
     - preview update
     - timeline segment persistence event
5. On stop:
   - flush the final partial chunk
   - stop the session

Important constraint:

The exact chunk commit API must match the Realtime browser data-channel event contract. Use the current documented `input_audio_buffer.append` and `input_audio_buffer.commit` style client events if available for the browser session path.

### 5. UI

Add a toggle to `/record`:

1. `Preview`
2. `Timeline`

Preview mode:

1. Current transcript preview panel behavior.

Timeline mode:

1. Render transcript rows as:
   - `00:42.100 - 00:43.700`
   - `Government of the people`
2. During recording, rows append as chunks complete.

## Risks

1. Timing is only as accurate as the chosen chunk size.
2. If model completions merge/split semantic content differently from chunk commits, segment boundaries may feel slightly off.
3. Smaller chunks improve timing granularity but increase event volume and may reduce transcript quality.

## Recommended defaults

1. Chunk size: `1500ms`
2. Timeline granularity: segment-level only
3. Do not attempt word-level timing in this mode

## Acceptance criteria

1. User can switch between `Preview` and `Timeline` during live recording.
2. `Preview` remains low-latency.
3. `Timeline` shows approximate timestamped segments during recording.
4. Timeline data persists with the clip under the same `media_id`.
5. `mix precommit` passes.

## Suggested implementation order

1. Add persistence fields and tests.
2. Add channel event for timeline segments.
3. Add UI toggle and timeline rendering.
4. Switch browser transcription flow to manual chunk commit.
5. Tune chunk size after first end-to-end verification.
