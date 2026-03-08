# Latency Options

## Option A: Low-latency UX (recommended)

- Browser renders delta text immediately.
- DB writes only on `completed` events.
- Channel traffic for canonical and audit events only.

Pros:

- Fastest perceived responsiveness.
- Minimal database load.
- Simple persistence semantics.

Cons:

- Partial text is transient and not server-synchronized.

## Option B: Balanced collaboration

- Browser renders deltas locally.
- Browser also sends throttled progress events to Phoenix (not persisted canonically).
- DB still writes only completed.

Pros:

- Better multi-client visibility during live capture.

Cons:

- Higher channel traffic and complexity.

## Option C: Turn-only conservative

- No local delta rendering.
- UI updates only on completed events.

Pros:

- Simplest client code.
- Lowest event volume.

Cons:

- Noticeably slower user feedback.

## Recommendation

Use Option A for v1. It gives the best perceived latency while keeping persistence and idempotency simple.
