# HgsVideoStories ToDo List

## Recording Studio UX (Current `/record` stub)

- [ ] Implement a single state-driven `Capture + Recording Control` flow.
  - Define explicit UI/logic states: `idle`, `previewing`, `recording`, `paused`, `reviewing`, `error`.
  - Only show record/pause/resume/stop controls after a capture source is selected.
  - Keep source switching in the same control area, with clear "current source" vs "switch source" indicators.

- [ ] Build one shared `Preview / Playback Stage` for both live capture and clip review.
  - Use one media surface for live camera/screen preview and selected clip playback.
  - Add a clear mode switch (preview vs playback) so users always know what they are seeing.
  - Keep clip actions (rename/download/re-record/delete) adjacent to this stage.

- [ ] Keep `Clip Library` as the selection surface, and tie it directly to stage playback.
  - Selecting a clip should activate playback mode in the shared stage.
  - Selecting "re-record" should switch back to preview mode and preserve source/device settings when possible.

## Capture/Recording Technical Direction

- [ ] Implement capture from both camera/mic and desktop/app.
  - Camera/mic via `getUserMedia`.
  - Screen/app via `getDisplayMedia` with optional microphone merge.
  - Provide clear fallback messaging for permission denial, missing devices, and unsupported browser features.

- [ ] Confirm server-ingest-first architecture for recordings.
  - Recordings should stream/chunk directly to backend ingest rather than relying on local disk save.
  - Replace any "upload/save" UX with ingest/processing status (for example: chunk ingest, transcode, transcript readiness).
  - Keep "download clip" as an explicit user action only.

## Header / Auth Shell Follow-up

- [ ] Keep the current logged-in shell stub and wire it to real account data later.
  - Header includes logo, avatar, desktop profile menu, and mobile hamburger profile menu.
  - Replace hardcoded user values (`Jordan Lee`) with authenticated user assigns when auth is implemented.
