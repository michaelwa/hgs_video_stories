# Media Timeline Push Updates

## Goal

Replace the current `/media` timeline status polling with Phoenix-native push updates.

The current implementation works, but it uses repeated HTTP fetches from `media_library_stub.js` while a clip is in `pending` or `processing`. That is acceptable as a stopgap, but the better architecture for this app is server-pushed updates over Phoenix websockets.

## Current State

`/media` is currently a controller-rendered page with client-side JavaScript.

Timeline flow today:
1. User clicks `Generate Timeline` on `/media`.
2. Client posts to `POST /api/media_clips/:media_id/timeline_transcription`.
3. Background task runs server-side.
4. Client polls `GET /api/media_clips/timeline_transcriptions?...` until state changes.

This should be replaced with push-based updates.

## Recommendation

Use a Phoenix Channel for `/media` timeline status updates.

Why this path:
1. It is a smaller refactor than converting `/media` to LiveView.
2. The app already uses Channels for transcript ingestion.
3. Background timeline jobs can broadcast status transitions over PubSub cleanly.

## Proposed Design

### Channel topic

Use a per-media or library-level topic:

1. `media_timeline`
2. Or `media_timeline:<media_id>`

Recommendation:
- Use `media_timeline` first.
- Payload includes `media_id`, `status`, `timeline_available`, `segment_count`, `error_message`.

That keeps the browser connection count small and fits the current library page.

### Broadcast points

Emit broadcasts from timeline job lifecycle transitions:

1. queued
2. processing
3. completed
4. failed

Best place:
- inside `TimelineTranscriptionQueue.run/1`
- and inside the queue entry path when status first becomes `pending`

### Client behavior

On `/media` load:
1. Join the `media_timeline` channel.
2. Load initial statuses once via HTTP.
3. Stop periodic polling entirely.
4. Apply incoming status events to the local clip state.
5. Re-render the selected clip panel and list badges immediately.

## Ticket Scope

### Ticket A

Add server-side broadcasts.

Tasks:
1. Create `MediaTimelineChannel`.
2. Add socket route and join contract.
3. Add broadcast helper for timeline status payloads.
4. Broadcast on `pending`, `processing`, `completed`, `failed`.
5. Add channel tests.

### Ticket B

Replace `/media` polling with channel subscription.

Tasks:
1. Remove interval polling logic from `media_library_stub.js`.
2. Connect to the new channel on page load.
3. Apply broadcast payloads into `timelineStatuses`.
4. Re-render list and selected panel on update.
5. Keep one initial HTTP fetch for first render.

### Ticket C

Optional refinement.

Tasks:
1. Add timeline segment count to completion broadcast.
2. Add richer UI state transitions for in-flight jobs.
3. Add reconnect handling for dropped sockets.

## Payload Shape

Suggested broadcast event:

`timeline.status_updated`

Payload:

```json
{
  "media_id": 1772988744376,
  "status": "completed",
  "timeline_available": true,
  "segment_count": 9,
  "error_message": null,
  "model": "whisper-1"
}
```

## Acceptance Criteria

1. `/media` no longer uses periodic fetches for timeline status updates.
2. Timeline state changes appear automatically after queueing.
3. Completed timeline jobs update the selected clip action/button without manual refresh.
4. Failed jobs surface their error state without manual refresh.
5. `mix precommit` passes.

## Non-Goal

This ticket does not convert `/media` to LiveView.

That can remain a separate future refactor if the page grows more interactive.
