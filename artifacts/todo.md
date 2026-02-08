# HgsVideoStories ToDo List

## Now (Build Next)

- [x] Split app surfaces into dedicated pages.
  - `/record` is now capture-focused.
  - `/media` is now a dedicated library management surface.

- [x] Implement a single state-driven `Capture + Recording Control` flow.
  - Define explicit UI/logic states: `idle`, `previewing`, `recording`, `paused`, `reviewing`, `error`.
  - Only show record/pause/resume/stop controls after a capture source is selected.
  - Keep source switching in the same control area, with clear "current source" vs "switch source" indicators.

- [x] Keep `/record` focused on live capture preview only.
  - The recording page now avoids library/review complexity.
  - Clip management concerns moved to `/media`.

- [x] Wire `/record` output into `/media` library data.
  - `/record` now writes each completed clip (metadata + blob) into browser `IndexedDB`.
  - `/media` reads persisted records, shows true clip preview playback, and supports download/delete for selected clips.
  - Current implementation note: this is browser-local persistence only; records are available across page navigation/reload on the same browser profile.
  - Current implementation note: `/media` now also provides a manual "Save to Server" option per clip, while keeping browser-local copies.

## Next (After UI State Wiring)

- [x] Implement capture from both camera/mic and desktop/app.
  - Camera/mic via `getUserMedia`.
  - Screen/app via `getDisplayMedia` with optional microphone merge.
  - Provide clear fallback messaging for permission denial, missing devices, and unsupported browser features.
  - Current implementation note: done as a client-side prototype in `assets/js/record_studio_stub.js` using `getUserMedia`, `getDisplayMedia`, and `MediaRecorder`.
  - Current implementation note: includes explicit `Turn Off Capture` control and automatic preview stream shutdown when switching into playback mode.

- [ ] Confirm and implement server-ingest-first architecture for recordings.
  - Stream/chunk recordings directly to backend ingest rather than relying on local disk save.
  - Replace any "upload/save" UX with ingest/processing status (for example: chunk ingest, transcode, transcript readiness).
  - Keep "download clip" as an explicit user action only.
  - Current implementation note: today this is a single-shot clip upload endpoint (`POST /api/media_clips`) used by the manual save action.

## Later (Auth Integration / Polish)

- [ ] Keep the current logged-in shell stub and wire it to real account data.
  - Header includes logo, avatar, desktop profile menu, and mobile hamburger profile menu.
  - Replace hardcoded user values (`Jordan Lee`) with authenticated user assigns once auth is implemented.

- [ ] Add production-level resiliency and UX polish.
  - Handle device hot-swap/disconnect while previewing or recording.
  - Add browser compatibility messaging and guided recovery actions.
  - Add storage quota awareness via `navigator.storage.estimate()` and warn users before long recordings when local IndexedDB capacity is low.
  - Add lightweight analytics around source selection, record success/failure, and drop-off points.
