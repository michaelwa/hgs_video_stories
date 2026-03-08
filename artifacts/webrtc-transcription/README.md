# WebRTC Realtime Transcription Plan

This folder contains the implementation plan and design docs for adding OpenAI Realtime WebRTC transcription to this Phoenix app, integrated with the existing `/record` capture flow.

## Scope decisions captured

- Reuse the current `/record` capture mechanism (`MediaRecorder` flow).
- Save video/audio clip and transcription for the same recorded media item.
- Persist only `completed` transcript content as canonical text.
- One transcription session per media item.
- Full audit logging of incoming transcript-related events.
- No diarization in v1 (speaker attribution deferred).

## Documents

- `architecture.md`: system design, boundaries, and data flow.
- `implementation-plan.md`: build tickets in execution order.
- `contracts.md`: client/server payload contracts and event semantics.
- `data-model.md`: schema, constraints, and write rules.
- `latency-options.md`: practical latency modes and recommendation.
- `testing-rollout.md`: validation matrix and rollout checklist.
