defmodule HgsVideoStoriesWeb.RecordStudioLive do
  use HgsVideoStoriesWeb, :live_view

  alias HgsVideoStoriesWeb.PageHTML

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, current_scope: nil)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash} current_scope={@current_scope} bare>
      <div
        id="recording-studio-page"
        phx-hook="RecordStudio"
        class="min-h-screen bg-gradient-to-b from-base-200 via-base-100 to-base-200 text-base-content"
      >
        <PageHTML.studio_header active_tab="record" />

        <main class="relative z-0 mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <section id="studio-stage" class="space-y-6">
            <article
              id="capture-and-recording-control"
              class="rounded-3xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-6"
            >
              <div
                id="stage-frame"
                class="relative h-52 overflow-hidden rounded-2xl border border-base-300 bg-base-200 transition-all duration-300 sm:h-80 lg:h-[26rem]"
              >
                <video
                  id="stage-video"
                  class="hidden h-full w-full rounded-2xl bg-slate-950 object-cover"
                  playsinline
                >
                </video>
                <img
                  id="stage-image"
                  src={~p"/images/studio-idle.svg"}
                  alt="Recording stage placeholder"
                  class="h-full w-full rounded-2xl object-cover"
                />
                <canvas
                  id="stage-audio-wave"
                  class="pointer-events-none absolute inset-0 hidden h-full w-full rounded-2xl"
                >
                </canvas>
                <div class="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
                  <div class="flex flex-wrap items-center gap-1">
                    <span
                      id="studio-state-badge"
                      class="badge badge-outline bg-base-100/80 px-1.5 py-0 text-[9px] font-medium leading-none backdrop-blur"
                    >
                      State: idle
                    </span>
                    <span
                      id="studio-source-badge"
                      class="badge badge-outline bg-base-100/80 px-1.5 py-0 text-[9px] font-medium leading-none backdrop-blur"
                    >
                      Source: not selected
                    </span>
                    <span
                      id="studio-ingest-badge"
                      class="badge badge-outline bg-base-100/80 px-1.5 py-0 text-[9px] font-medium leading-none backdrop-blur"
                    >
                      Ingest: idle
                    </span>
                    <span
                      id="studio-transcription-badge"
                      class="badge badge-outline bg-base-100/80 px-1.5 py-0 text-[9px] font-medium leading-none backdrop-blur"
                    >
                      Transcription: idle
                    </span>
                  </div>

                  <div class="pointer-events-auto flex items-center justify-center">
                    <div
                      id="record-controls-group"
                      class="hidden flex-col items-center gap-2 rounded-3xl border border-base-300 bg-base-100/90 p-2 shadow-lg backdrop-blur sm:p-3"
                    >
                      <div class="flex flex-wrap items-center justify-center gap-2">
                        <button
                          id="record-start"
                          type="button"
                          class="btn btn-sm btn-primary rounded-full px-4"
                          disabled
                        >
                          Record
                        </button>
                        <button
                          id="record-pause"
                          type="button"
                          class="btn btn-sm btn-outline rounded-full"
                          disabled
                        >
                          Pause
                        </button>
                        <button
                          id="record-resume"
                          type="button"
                          class="btn btn-sm btn-outline rounded-full"
                          disabled
                        >
                          Resume
                        </button>
                        <button
                          id="record-stop"
                          type="button"
                          class="btn btn-sm btn-error btn-outline rounded-full"
                          disabled
                        >
                          Stop
                        </button>
                        <span
                          id="studio-timer-badge"
                          class="rounded-full border border-base-300 bg-base-100 px-3 py-1 text-sm font-semibold"
                        >
                          Timer: 00:00
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="mx-auto mt-2 grid w-full max-w-3xl grid-cols-1 gap-1 sm:mt-4 sm:grid-cols-3 sm:gap-3 [&_.fieldset]:mb-0">
                <div class="relative w-full">
                  <.icon
                    name="hero-signal"
                    class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-base-content/65"
                  />
                  <.input
                    type="select"
                    id="capture-mode"
                    name="capture_mode"
                    class="select select-sm w-full rounded-full border-base-300 bg-base-100 pl-9 pr-8"
                    options={[
                      {"Capture Off", "off"},
                      {"Camera + Mic", "camera"},
                      {"Camera only", "camera_only"},
                      {"Mic only", "mic_only"},
                      {"Screen + Audio", "screen"},
                      {"Screen only", "screen_only"}
                    ]}
                    value="off"
                  />
                </div>
                <div class="relative w-full">
                  <.icon
                    name="hero-microphone"
                    class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-base-content/65"
                  />
                  <.input
                    type="select"
                    id="microphone-device"
                    name="microphone_device"
                    class="select select-sm w-full rounded-full border-base-300 bg-base-100 pl-9 pr-8"
                    options={[{"Microphone Off", "__mic_off__"}, {"System default microphone", ""}]}
                    value=""
                  />
                </div>
                <div class="relative w-full">
                  <.icon
                    name="hero-video-camera"
                    class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-base-content/65"
                  />
                  <.input
                    type="select"
                    id="camera-device"
                    name="camera_device"
                    class="select select-sm w-full rounded-full border-base-300 bg-base-100 pl-9 pr-8"
                    options={[{"Camera Off", "__camera_off__"}, {"System default camera", ""}]}
                    value=""
                  />
                </div>
              </div>

              <div
                id="capture-feedback-panel"
                class="mx-auto mt-3 hidden w-full max-w-lg flex-col items-center gap-2"
              >
                <div
                  id="timeline-generation-toggle"
                  class="hidden w-full rounded-lg border border-base-300 bg-base-100 px-3 py-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-[11px] font-medium uppercase tracking-wide text-base-content/60">
                        Timeline Generation
                      </p>
                      <p class="mt-1 text-xs text-base-content/70">
                        Accurate timeline transcription runs after upload and costs an extra pass.
                      </p>
                    </div>
                    <button
                      id="timeline-generation-button"
                      type="button"
                      class="btn btn-xs rounded-full btn-ghost"
                    >
                      Timeline Off
                    </button>
                  </div>
                </div>
                <div
                  id="last-capture-panel"
                  class="hidden w-full items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-200/60 px-3 py-2"
                >
                  <p id="last-capture-note" class="text-center text-xs text-base-content/70">
                    Last capture retained in browser memory.
                  </p>
                  <button
                    id="last-download"
                    type="button"
                    class="btn btn-xs btn-outline shrink-0"
                    disabled
                  >
                    Download
                  </button>
                </div>
                <p id="ingest-status-note" class="hidden text-center text-xs text-base-content/70">
                </p>
                <p
                  id="transcription-status-note"
                  class="hidden text-center text-xs text-base-content/70"
                >
                </p>
                <div
                  id="timeline-status-panel"
                  class="hidden w-full rounded-lg border border-base-300 bg-base-100 px-3 py-3"
                >
                  <p class="text-[11px] font-medium uppercase tracking-wide text-base-content/60">
                    Timeline Status
                  </p>
                  <p id="timeline-status-text" class="mt-1 text-xs text-base-content/80"></p>
                </div>
                <div
                  id="transcription-display-toggle"
                  class="hidden rounded-full border border-base-300 bg-base-100 p-1"
                >
                  <div class="grid grid-cols-2 gap-1">
                    <button
                      id="transcription-mode-preview"
                      type="button"
                      class="btn btn-xs rounded-full btn-primary"
                    >
                      Transcription Preview
                    </button>
                    <button
                      id="transcription-mode-timeline"
                      type="button"
                      class="btn btn-xs rounded-full btn-ghost"
                    >
                      Transcription Timeline
                    </button>
                  </div>
                </div>
                <div
                  id="transcription-preview-panel"
                  class="hidden w-full rounded-lg border border-base-300 bg-base-200/60 px-3 py-2"
                >
                  <p class="text-[11px] font-medium uppercase tracking-wide text-base-content/60">
                    Transcript Preview
                  </p>
                  <p id="transcription-preview-text" class="mt-1 text-xs text-base-content/80"></p>
                </div>
                <div
                  id="transcription-timeline-panel"
                  class="hidden w-full rounded-lg border border-base-300 bg-base-200/60 px-3 py-2"
                >
                  <p class="text-[11px] font-medium uppercase tracking-wide text-base-content/60">
                    Transcript Timeline
                  </p>
                  <ul
                    id="transcription-timeline-list"
                    class="mt-2 space-y-2 text-xs text-base-content/80"
                  >
                  </ul>
                </div>
              </div>
              <span id="record-control-timer" class="hidden">00:00</span>
            </article>
          </section>
        </main>
      </div>
    </Layouts.app>
    """
  end
end
