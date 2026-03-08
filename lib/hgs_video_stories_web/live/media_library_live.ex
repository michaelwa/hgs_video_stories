defmodule HgsVideoStoriesWeb.MediaLibraryLive do
  use HgsVideoStoriesWeb, :live_view

  alias HgsVideoStories.MediaTranscription
  alias HgsVideoStories.MediaTranscription.TimelineTranscriptionQueue
  alias HgsVideoStories.MediaTranscription.TimelineStatusNotifier
  alias HgsVideoStoriesWeb.PageHTML

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      HgsVideoStoriesWeb.Endpoint.subscribe(TimelineStatusNotifier.topic())
    end

    {:ok,
     socket
     |> assign(
       current_scope: nil,
       clips_loaded?: false,
       clips_by_id: %{},
       selected_id: nil,
       selected_clip: nil,
       timeline_panel_open: false,
       timeline_panel_mode: :raw,
       preview_segments: [],
       timeline_segments: [],
       helper_message: "Choose a clip to preview, download, or delete.",
       timeline_helper_message:
         "Timeline transcription is optional and can be generated per clip.",
       store_supported?: true
     )
     |> stream(:clips, [], reset: true)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash} current_scope={@current_scope} bare>
      <div
        id="media-library-page"
        phx-hook="MediaLibrary"
        data-selected-id={@selected_id || ""}
        class="min-h-screen bg-gradient-to-b from-base-200 via-base-100 to-base-200 text-base-content"
      >
        <PageHTML.studio_header active_tab="media" />

        <main class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <section class="mb-6 rounded-2xl border border-base-300 bg-base-100/80 p-4 shadow-sm">
            <h1 class="text-xl font-semibold">Media Management</h1>
            <p class="mt-1 text-sm text-base-content/70">
              Manage previously recorded clips, review metadata, and prepare assets for publishing.
            </p>
          </section>

          <%= if not @clips_loaded? do %>
            <section class="rounded-3xl border border-base-300 bg-base-100/70 p-10 shadow-sm sm:p-14">
              <div class="mx-auto flex max-w-xl flex-col items-center text-center">
                <div class="loading loading-spinner loading-lg text-primary"></div>
                <h2 class="mt-5 text-2xl font-semibold">Loading your media library</h2>
                <p class="mt-2 text-sm text-base-content/70">
                  Reading clips from this browser so the library can hydrate into LiveView.
                </p>
              </div>
            </section>
          <% else %>
            <%= if @selected_clip do %>
              <section id="media-populated-state">
                <div class="grid gap-6 lg:grid-cols-12">
                  <div class="space-y-4 lg:col-span-4">
                    <article class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6">
                      <h2 class="text-lg font-semibold">Captured Clips</h2>
                      <p class="mt-1 text-sm text-base-content/70">
                        Recent captures from the recording page.
                      </p>
                      <p id="media-timeline-helper" class="mt-2 text-xs text-base-content/65">
                        {@timeline_helper_message}
                      </p>
                      <ul id="media-clip-list" class="mt-4 space-y-3" phx-update="stream">
                        <%= for {dom_id, clip} <- @streams.clips do %>
                          <li id={dom_id}>
                            <button
                              type="button"
                              phx-click="select_clip"
                              phx-value-id={clip.id}
                              class={clip_button_class(clip, @selected_id == clip.id)}
                            >
                              <div class="flex items-start justify-between gap-3">
                                <div>
                                  <p class="text-sm font-semibold">{clip.title}</p>
                                  <p class="text-xs text-base-content/65">
                                    {format_duration(clip.duration_seconds)} · {format_created_at(
                                      clip.created_at
                                    )}
                                  </p>
                                </div>
                                <span class="rounded-full border border-base-300 bg-base-100 px-2 py-1 text-[11px] font-medium text-base-content/70">
                                  {timeline_status_label(clip)}
                                </span>
                              </div>
                            </button>
                          </li>
                        <% end %>
                      </ul>
                    </article>
                  </div>

                  <section id="media-selected-panel" class="space-y-6 lg:col-span-8">
                    <article class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6">
                      <h2 id="media-selected-title" class="text-lg font-semibold">
                        {@selected_clip.title}
                      </h2>
                      <div class="mt-4 rounded-2xl border border-base-300 bg-base-200 p-4">
                        <video
                          id="media-preview-video"
                          class="hidden w-full rounded-xl bg-slate-950 object-cover"
                          controls
                          playsinline
                        >
                        </video>
                        <img
                          id="media-preview-image"
                          src={~p"/images/studio-playback.svg"}
                          alt="Clip preview placeholder"
                          class="w-full rounded-xl object-cover"
                        />
                      </div>
                      <div class="mt-4 flex flex-wrap gap-2">
                        <button
                          id="media-save-server"
                          type="button"
                          phx-click="request_save_server"
                          class="btn btn-sm btn-primary"
                          disabled={save_server_disabled?(@selected_clip)}
                        >
                          {save_server_label(@selected_clip)}
                        </button>
                        <button
                          id="media-generate-timeline"
                          type="button"
                          phx-click="request_generate_timeline"
                          class="btn btn-sm btn-outline"
                          disabled={timeline_button_disabled?(@selected_clip)}
                        >
                          {timeline_button_label(@selected_clip)}
                        </button>
                        <button
                          id="media-view-timeline"
                          type="button"
                          phx-click="toggle_timeline_panel"
                          class="btn btn-sm btn-outline"
                          disabled={transcript_toggle_disabled?(@selected_clip)}
                        >
                          {if @timeline_panel_open, do: "Hide Transcript", else: "Show Transcript"}
                        </button>
                        <button
                          id="media-download"
                          type="button"
                          phx-click="request_download"
                          class="btn btn-sm btn-outline"
                          disabled={client_blob_action_disabled?(@selected_clip)}
                        >
                          Download
                        </button>
                        <button
                          id="media-delete"
                          type="button"
                          phx-click="request_delete"
                          class="btn btn-sm btn-error btn-outline"
                          disabled={client_blob_action_disabled?(@selected_clip)}
                        >
                          Delete
                        </button>
                      </div>
                      <p id="media-library-helper" class="mt-3 text-sm text-base-content/65">
                        {@helper_message}
                      </p>
                      <div
                        id="media-timeline-error-detail"
                        class={[
                          "mt-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3",
                          @selected_clip.timeline_status != "failed" && "hidden"
                        ]}
                      >
                        <div class="flex items-start gap-3">
                          <div class="mt-0.5 flex size-8 items-center justify-center rounded-full bg-rose-100">
                            <.icon name="hero-exclamation-triangle" class="size-4 text-rose-700" />
                          </div>
                          <div class="min-w-0">
                            <p class="text-sm font-semibold text-rose-900">
                              Timeline transcription failed
                            </p>
                            <p
                              id="media-timeline-error-message"
                              class="mt-1 text-sm leading-6 text-rose-800"
                            >
                              {timeline_error_message(@selected_clip)}
                            </p>
                            <div class="mt-3 flex flex-wrap gap-2 text-xs text-rose-900/80">
                              <%= if @selected_clip.timeline_model do %>
                                <span class="rounded-full border border-rose-200 bg-rose-100 px-2 py-1">
                                  Model: {@selected_clip.timeline_model}
                                </span>
                              <% end %>
                              <%= if last_attempted_at = timeline_last_attempted_at(@selected_clip) do %>
                                <span class="rounded-full border border-rose-200 bg-rose-100 px-2 py-1">
                                  Last attempted: {format_created_at(last_attempted_at)}
                                </span>
                              <% end %>
                            </div>
                            <p class="mt-2 text-xs font-medium uppercase tracking-wide text-rose-700/80">
                              Use Retry Timeline to queue a new run for this clip.
                            </p>
                          </div>
                        </div>
                      </div>
                      <a
                        id="media-server-link"
                        href={@selected_clip.server_url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        class={[
                          "mt-2 text-sm font-medium text-base-content underline visited:text-base-content hover:text-base-content",
                          is_nil(@selected_clip.server_url) && "hidden"
                        ]}
                      >
                        Open server copy
                      </a>
                    </article>

                    <article class="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6">
                      <h2 class="text-lg font-semibold">Metadata</h2>
                      <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div class="rounded-xl border border-base-300 bg-base-200/60 p-3">
                          <dt class="text-base-content/65">Source</dt>
                          <dd id="media-meta-source" class="font-medium">
                            {source_label(@selected_clip.source)}
                          </dd>
                        </div>
                        <div class="rounded-xl border border-base-300 bg-base-200/60 p-3">
                          <dt class="text-base-content/65">Duration</dt>
                          <dd id="media-meta-duration" class="font-medium">
                            {format_duration(@selected_clip.duration_seconds)}
                          </dd>
                        </div>
                        <div class="rounded-xl border border-base-300 bg-base-200/60 p-3">
                          <dt class="text-base-content/65">Created</dt>
                          <dd id="media-meta-created" class="font-medium">
                            {format_created_at(@selected_clip.created_at)}
                          </dd>
                        </div>
                        <div class="rounded-xl border border-base-300 bg-base-200/60 p-3">
                          <dt class="text-base-content/65">Size</dt>
                          <dd id="media-meta-size" class="font-medium">
                            {format_size(@selected_clip.size_bytes)}
                          </dd>
                        </div>
                        <div class="rounded-xl border border-base-300 bg-base-200/60 p-3">
                          <dt class="text-base-content/65">Timeline</dt>
                          <dd id="media-meta-timeline" class="font-medium">
                            {timeline_status_label(@selected_clip)}
                          </dd>
                        </div>
                      </dl>
                    </article>

                    <article
                      id="media-timeline-panel"
                      class={[
                        "rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6",
                        not @timeline_panel_open && "hidden"
                      ]}
                    >
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 class="text-lg font-semibold">Transcripts</h2>
                          <p id="media-timeline-summary" class="mt-1 text-sm text-base-content/65">
                            {timeline_summary(
                              @selected_clip,
                              @timeline_panel_mode,
                              @preview_segments,
                              @timeline_segments
                            )}
                          </p>
                        </div>
                        <div
                          id="media-timeline-mode-toggle"
                          class={[
                            "rounded-full border border-base-300 bg-base-100 p-1",
                            transcript_toggle_disabled?(@selected_clip) && "hidden"
                          ]}
                        >
                          <div class="grid grid-cols-2 gap-1">
                            <button
                              id="media-timeline-mode-raw"
                              type="button"
                              phx-click="set_timeline_mode"
                              phx-value-mode="raw"
                              class={[
                                "btn btn-xs rounded-full",
                                @timeline_panel_mode == :raw && "btn-primary",
                                @timeline_panel_mode != :raw && "btn-ghost"
                              ]}
                            >
                              Raw Transcript
                            </button>
                            <button
                              id="media-timeline-mode-accurate"
                              type="button"
                              phx-click="set_timeline_mode"
                              phx-value-mode="accurate"
                              disabled={@selected_clip.timeline_status != "completed"}
                              class={[
                                "btn btn-xs rounded-full",
                                @timeline_panel_mode == :accurate && "btn-primary",
                                @timeline_panel_mode != :accurate && "btn-ghost"
                              ]}
                            >
                              Timeline Transcript
                            </button>
                          </div>
                        </div>
                      </div>
                      <ul id="media-timeline-segments" class="mt-4 space-y-3">
                        <%= for segment <- transcript_segments(@timeline_panel_mode, @preview_segments, @timeline_segments, @selected_clip) do %>
                          <li class={
                            transcript_segment_class(segment, @timeline_panel_mode, @selected_clip)
                          }>
                            <%= if Map.get(segment, :error, false) do %>
                              <p class="text-sm font-semibold text-rose-900">
                                Timeline transcription failed
                              </p>
                              <p class="mt-2 text-sm leading-6 text-rose-800">{segment.text}</p>
                              <p class="mt-3 text-xs font-medium uppercase tracking-wide text-rose-700/80">
                                Use Retry Timeline above to queue another attempt.
                              </p>
                            <% else %>
                              <%= if @timeline_panel_mode == :accurate and not is_nil(segment.start_ms) and not is_nil(segment.end_ms) do %>
                                <div class="flex items-center justify-between gap-3">
                                  <p class="text-[11px] font-medium uppercase tracking-wide text-base-content/55">
                                    Segment {segment.seq}
                                  </p>
                                  <p class="rounded-full border border-base-300 bg-base-100 px-2 py-1 text-[11px] font-medium text-base-content/70">
                                    {format_timeline_ms(segment.start_ms)} - {format_timeline_ms(
                                      segment.end_ms
                                    )}
                                  </p>
                                </div>
                              <% else %>
                                <p class="text-[11px] font-medium uppercase tracking-wide text-base-content/55">
                                  Raw Segment {segment.seq}
                                </p>
                              <% end %>
                              <p class="mt-2 text-sm text-base-content/80">{segment.text}</p>
                            <% end %>
                          </li>
                        <% end %>
                      </ul>
                    </article>
                  </section>
                </div>
              </section>
            <% else %>
              <section
                id="media-empty-state"
                class="rounded-3xl border border-dashed border-base-300 bg-base-100/70 p-10 shadow-sm sm:p-14"
              >
                <div class="mx-auto flex max-w-xl flex-col items-center text-center">
                  <div class="flex size-14 items-center justify-center rounded-2xl border border-base-300 bg-base-100">
                    <.icon name="hero-plus" class="size-7 text-base-content/70" />
                  </div>
                  <h2 class="mt-5 text-2xl font-semibold">Add your first video or screen capture</h2>
                  <p class="mt-2 text-sm text-base-content/70">
                    Your media library is empty. Record from camera or desktop to create your first clip.
                  </p>
                  <.link navigate={~p"/record"} class="btn btn-primary mt-6">Go to Recording</.link>
                </div>
              </section>
            <% end %>
          <% end %>
        </main>
      </div>
    </Layouts.app>
    """
  end

  @impl true
  def handle_event("sync_clips", %{"clips" => clips}, socket) do
    normalized_clips =
      clips
      |> Enum.map(&normalize_clip/1)
      |> enrich_timeline_statuses()

    {:noreply,
     socket
     |> assign(:clips_loaded?, true)
     |> assign(:store_supported?, true)
     |> assign(
       :timeline_helper_message,
       "Timeline transcription is optional and can be generated per clip."
     )
     |> assign_clips(normalized_clips)}
  end

  def handle_event("sync_error", %{"message" => message}, socket) do
    {:noreply,
     socket
     |> assign(:clips_loaded?, true)
     |> assign(:store_supported?, false)
     |> assign(:helper_message, message)
     |> assign(
       :timeline_helper_message,
       "Timeline transcription status is unavailable right now."
     )
     |> assign_clips([])}
  end

  def handle_event("select_clip", %{"id" => id_raw}, socket) do
    selected_id = parse_integer(id_raw)

    {:noreply,
     socket
     |> assign(:selected_id, selected_id)
     |> assign(:timeline_panel_open, false)
     |> assign(:timeline_panel_mode, :raw)
     |> refresh_selected_clip()}
  end

  def handle_event("toggle_timeline_panel", _params, socket) do
    {:noreply,
     socket
     |> assign(:timeline_panel_open, !socket.assigns.timeline_panel_open)
     |> refresh_selected_clip()}
  end

  def handle_event("set_timeline_mode", %{"mode" => mode}, socket)
      when mode in ["raw", "accurate"] do
    {:noreply,
     socket
     |> assign(:timeline_panel_mode, String.to_existing_atom(mode))
     |> refresh_selected_clip()}
  rescue
    ArgumentError ->
      {:noreply, socket}
  end

  def handle_event("request_save_server", _params, %{assigns: %{selected_clip: nil}} = socket),
    do: {:noreply, socket}

  def handle_event("request_save_server", _params, socket) do
    clip = socket.assigns.selected_clip

    {:noreply,
     socket
     |> assign(:helper_message, "Uploading clip to server...")
     |> push_event("media-upload-request", %{clipId: clip.id})}
  end

  def handle_event("media_upload_complete", %{"clips" => clips, "message" => message}, socket) do
    normalized_clips =
      clips
      |> Enum.map(&normalize_clip/1)
      |> enrich_timeline_statuses()

    {:noreply,
     socket
     |> assign(:helper_message, message)
     |> assign_clips(normalized_clips)}
  end

  def handle_event("request_download", _params, %{assigns: %{selected_clip: nil}} = socket),
    do: {:noreply, socket}

  def handle_event("request_download", _params, socket) do
    {:noreply,
     socket
     |> assign(:helper_message, "Preparing download...")
     |> push_event("media-download-request", %{clipId: socket.assigns.selected_clip.id})}
  end

  def handle_event("request_delete", _params, %{assigns: %{selected_clip: nil}} = socket),
    do: {:noreply, socket}

  def handle_event("request_delete", _params, socket) do
    {:noreply,
     socket
     |> assign(:helper_message, "Deleting clip...")
     |> push_event("media-delete-request", %{clipId: socket.assigns.selected_clip.id})}
  end

  def handle_event("media_delete_complete", %{"clips" => clips, "message" => message}, socket) do
    normalized_clips =
      clips
      |> Enum.map(&normalize_clip/1)
      |> enrich_timeline_statuses()

    {:noreply,
     socket
     |> assign(:helper_message, message)
     |> assign_clips(normalized_clips)}
  end

  def handle_event("media_action_complete", %{"message" => message}, socket) do
    {:noreply, assign(socket, :helper_message, message)}
  end

  def handle_event("media_action_error", %{"message" => message}, socket) do
    {:noreply, assign(socket, :helper_message, message)}
  end

  def handle_event(
        "request_generate_timeline",
        _params,
        %{assigns: %{selected_clip: nil}} = socket
      ),
      do: {:noreply, socket}

  def handle_event("request_generate_timeline", _params, socket) do
    clip = socket.assigns.selected_clip

    cond do
      is_nil(clip.server_url) ->
        {:noreply,
         assign(
           socket,
           :helper_message,
           "Save the clip to the server before requesting a timeline."
         )}

      not clip.had_audio ->
        {:noreply, assign(socket, :helper_message, "This clip has no audio track.")}

      true ->
        case TimelineTranscriptionQueue.queue(clip.id) do
          {:ok, _timeline_transcription} ->
            clips =
              socket.assigns.clips_by_id
              |> Map.values()
              |> update_clip_timeline_status(%{
                media_id: clip.id,
                status: :pending,
                segment_count: 0,
                error_message: nil,
                model: "whisper-1"
              })

            {:noreply,
             socket
             |> assign(:helper_message, "Timeline transcription queued.")
             |> assign_clips(clips, clip.id)}

          {:error, _reason, message} ->
            {:noreply, assign(socket, :helper_message, message)}
        end
    end
  end

  @impl true
  def handle_info(%Phoenix.Socket.Broadcast{} = broadcast, socket) do
    if broadcast.topic == TimelineStatusNotifier.topic() and
         broadcast.event == TimelineStatusNotifier.event() do
      clips =
        socket.assigns.clips_by_id
        |> Map.values()
        |> update_clip_timeline_status(broadcast.payload)

      {:noreply, assign_clips(socket, clips, socket.assigns.selected_id)}
    else
      {:noreply, socket}
    end
  end

  defp assign_clips(socket, clips, selected_id \\ nil) do
    ordered_clips = Enum.sort_by(clips, & &1.id, :desc)
    selected_id = resolve_selected_id(ordered_clips, selected_id || socket.assigns.selected_id)
    selected_clip = Enum.find(ordered_clips, &(&1.id == selected_id))

    socket
    |> assign(:clips_by_id, Map.new(ordered_clips, &{&1.id, &1}))
    |> assign(:selected_id, selected_id)
    |> assign(:selected_clip, selected_clip)
    |> stream(:clips, ordered_clips, reset: true)
    |> refresh_selected_clip()
  end

  defp refresh_selected_clip(socket) do
    selected_clip = Map.get(socket.assigns.clips_by_id, socket.assigns.selected_id)

    socket
    |> assign(:selected_clip, selected_clip)
    |> assign(:helper_message, helper_message(selected_clip))
    |> assign_transcript_segments(selected_clip)
  end

  defp assign_transcript_segments(socket, nil) do
    assign(socket, preview_segments: [], timeline_segments: [])
  end

  defp assign_transcript_segments(socket, clip) do
    if (socket.assigns.timeline_panel_open and clip.server_url) && clip.had_audio do
      assign(socket,
        preview_segments:
          MediaTranscription.list_segments_for_media(clip.id, display_mode: :preview),
        timeline_segments:
          MediaTranscription.list_segments_for_media(clip.id, display_mode: :timeline)
      )
    else
      assign(socket, preview_segments: [], timeline_segments: [])
    end
  end

  defp enrich_timeline_statuses(clips) do
    ids = Enum.map(clips, & &1.id)

    statuses =
      ids
      |> MediaTranscription.list_timeline_transcriptions()
      |> Map.new(&{&1.media_id, &1})

    Enum.map(clips, fn clip ->
      merge_timeline_status(clip, Map.get(statuses, clip.id))
    end)
  end

  defp update_clip_timeline_status(clips, payload) do
    media_id = parse_integer(Map.get(payload, :media_id) || Map.get(payload, "media_id"))

    Enum.map(clips, fn clip ->
      if clip.id == media_id do
        merge_timeline_status(clip, payload)
      else
        clip
      end
    end)
  end

  defp merge_timeline_status(clip, nil) do
    Map.merge(clip, %{
      timeline_status: nil,
      timeline_segment_count: 0,
      timeline_error_message: nil,
      timeline_model: nil,
      timeline_requested_at: nil,
      timeline_started_at: nil,
      timeline_completed_at: nil
    })
  end

  defp merge_timeline_status(clip, summary) do
    Map.merge(clip, %{
      timeline_status: normalize_status(Map.get(summary, :status) || Map.get(summary, "status")),
      timeline_segment_count:
        Map.get(summary, :segment_count) || Map.get(summary, "segment_count") || 0,
      timeline_error_message:
        Map.get(summary, :error_message) || Map.get(summary, "error_message"),
      timeline_model: Map.get(summary, :model) || Map.get(summary, "model"),
      timeline_requested_at: Map.get(summary, :requested_at) || Map.get(summary, "requested_at"),
      timeline_started_at: Map.get(summary, :started_at) || Map.get(summary, "started_at"),
      timeline_completed_at: Map.get(summary, :completed_at) || Map.get(summary, "completed_at")
    })
  end

  defp normalize_clip(clip) do
    %{
      id: parse_integer(clip["id"]),
      title: clip["title"] || "Untitled clip",
      source: clip["source"] || "camera",
      duration_seconds: parse_integer(clip["duration_seconds"]),
      created_at: clip["created_at"],
      size_bytes: parse_integer(clip["size_bytes"]),
      had_audio: truthy?(clip["had_audio"]),
      has_blob: Map.get(clip, "has_blob", true),
      server_url: clip["server_url"],
      server_saved_at: clip["server_saved_at"],
      server_id: parse_integer(clip["server_id"]),
      timeline_status: nil,
      timeline_segment_count: 0,
      timeline_error_message: nil,
      timeline_model: nil,
      timeline_requested_at: nil,
      timeline_started_at: nil,
      timeline_completed_at: nil
    }
  end

  defp parse_integer(nil), do: nil
  defp parse_integer(value) when is_integer(value), do: value

  defp parse_integer(value) when is_binary(value) do
    case Integer.parse(value) do
      {integer, _rest} -> integer
      :error -> nil
    end
  end

  defp parse_integer(_value), do: nil

  defp truthy?(value) when value in [true, "true", 1, "1"], do: true
  defp truthy?(_value), do: false

  defp resolve_selected_id([], _candidate), do: nil

  defp resolve_selected_id(clips, candidate) do
    if Enum.any?(clips, &(&1.id == candidate)), do: candidate, else: hd(clips).id
  end

  defp normalize_status(nil), do: nil
  defp normalize_status(status) when is_atom(status), do: Atom.to_string(status)
  defp normalize_status(status) when is_binary(status), do: status

  defp source_label("camera"), do: "Camera + Microphone"
  defp source_label("camera_only"), do: "Camera only"
  defp source_label("mic_only"), do: "Microphone only"
  defp source_label("screen"), do: "Screen / Application + Audio"
  defp source_label("screen_only"), do: "Screen / Application only"
  defp source_label(_source), do: "Unknown"

  defp format_duration(seconds) do
    total_seconds = max(seconds || 0, 0)
    minutes = div(total_seconds, 60)
    remaining_seconds = rem(total_seconds, 60)

    [minutes, remaining_seconds]
    |> Enum.map_join(":", &String.pad_leading(Integer.to_string(&1), 2, "0"))
  end

  defp format_created_at(nil), do: "-"

  defp format_created_at(%DateTime{} = datetime) do
    Calendar.strftime(datetime, "%b %-d, %Y, %-I:%M %p")
  end

  defp format_created_at(iso8601) do
    case DateTime.from_iso8601(iso8601) do
      {:ok, datetime, _offset} -> Calendar.strftime(datetime, "%b %-d, %Y, %-I:%M %p")
      _ -> iso8601
    end
  end

  defp format_size(nil), do: "0.00 MB"

  defp format_size(size_bytes) do
    mb = size_bytes / (1024 * 1024)
    :erlang.float_to_binary(mb, decimals: 2) <> " MB"
  end

  defp format_timeline_ms(nil), do: "00:00.000"

  defp format_timeline_ms(total_ms) do
    safe_ms = max(total_ms, 0)
    minutes = div(safe_ms, 60_000)
    seconds = div(rem(safe_ms, 60_000), 1000)
    milliseconds = rem(safe_ms, 1000)

    String.pad_leading(Integer.to_string(minutes), 2, "0") <>
      ":" <>
      String.pad_leading(Integer.to_string(seconds), 2, "0") <>
      "." <>
      String.pad_leading(Integer.to_string(milliseconds), 3, "0")
  end

  defp timeline_status_label(nil), do: "Upload required"

  defp timeline_status_label(clip) do
    cond do
      is_nil(clip.server_url) -> "Upload required"
      not clip.had_audio -> "No audio"
      clip.timeline_status == "completed" -> "Timeline ready"
      clip.timeline_status == "pending" -> "Queued"
      clip.timeline_status == "processing" -> "Processing"
      clip.timeline_status == "failed" -> "Failed"
      true -> "Not generated"
    end
  end

  defp timeline_button_label(clip) do
    cond do
      is_nil(clip.server_url) -> "Upload First"
      not clip.had_audio -> "No Audio"
      clip.timeline_status == "completed" -> "Timeline Ready"
      clip.timeline_status in ["pending", "processing"] -> "Timeline Queued"
      clip.timeline_status == "failed" -> "Retry Timeline"
      true -> "Generate Timeline"
    end
  end

  defp timeline_button_disabled?(clip) do
    is_nil(clip.server_url) or not clip.had_audio or
      clip.timeline_status in ["pending", "processing", "completed"]
  end

  defp save_server_disabled?(clip), do: not clip.has_blob or not is_nil(clip.server_url)

  defp save_server_label(clip),
    do: if(is_nil(clip.server_url), do: "Save to Server", else: "Saved to Server")

  defp transcript_toggle_disabled?(clip), do: is_nil(clip.server_url) or not clip.had_audio
  defp client_blob_action_disabled?(clip), do: not clip.has_blob

  defp helper_message(nil), do: "Choose a clip to preview, download, or delete."

  defp helper_message(clip) do
    cond do
      not clip.has_blob ->
        "This clip has metadata only and cannot be previewed or downloaded."

      is_nil(clip.server_url) ->
        "Save this clip to the server before requesting a timeline transcription."

      not clip.had_audio ->
        "This clip has no audio track, so timeline transcription is unavailable."

      clip.timeline_status == "completed" ->
        "Timeline transcription is ready (#{clip.timeline_segment_count} segments)."

      clip.timeline_status == "failed" and not is_nil(clip.timeline_error_message) ->
        "Timeline transcription failed: #{clip.timeline_error_message}"

      clip.timeline_status in ["pending", "processing"] ->
        "Timeline transcription is queued on the server."

      true ->
        "Choose whether this clip is worth the extra timeline transcription cost."
    end
  end

  defp timeline_error_message(clip) do
    clip.timeline_error_message || "The server could not finish the timeline transcription."
  end

  defp timeline_last_attempted_at(clip) do
    clip.timeline_completed_at || clip.timeline_started_at || clip.timeline_requested_at
  end

  defp clip_button_class(clip, selected?) do
    tone =
      cond do
        clip.timeline_status == "completed" -> "border-emerald-300/70 bg-emerald-50"
        clip.timeline_status == "failed" -> "border-rose-300/70 bg-rose-50"
        clip.timeline_status in ["pending", "processing"] -> "border-amber-300/70 bg-amber-50"
        true -> "border-base-300 bg-base-200/70"
      end

    if selected? do
      "w-full rounded-2xl border p-3 text-left #{tone} ring-2 ring-primary/40 shadow-sm"
    else
      "w-full rounded-2xl border p-3 text-left #{tone}"
    end
  end

  defp timeline_summary(_clip, :raw, preview_segments, _timeline_segments) do
    if preview_segments == [] do
      "No raw transcript segments are available."
    else
      count = length(preview_segments)

      "#{count} raw transcript segment#{if count == 1, do: "", else: "s"} from the live preview pass."
    end
  end

  defp timeline_summary(clip, :accurate, _preview_segments, timeline_segments) do
    cond do
      clip.timeline_status == "failed" ->
        "The accurate timeline pass failed. Review the failure details and retry when ready."

      clip.timeline_status != "completed" ->
        "Timeline segments will be available after processing completes."

      timeline_segments == [] ->
        "Timeline completed, but no segments were returned."

      true ->
        count = length(timeline_segments)

        "#{count} timestamped segment#{if count == 1, do: "", else: "s"} from the accurate timeline pass."
    end
  end

  defp transcript_segments(:raw, [], _timeline_segments, _clip) do
    [%{seq: 1, text: "No raw transcript segments are available."}]
  end

  defp transcript_segments(:raw, preview_segments, _timeline_segments, _clip),
    do: preview_segments

  defp transcript_segments(:accurate, _preview_segments, _timeline_segments = [], clip) do
    text =
      if clip.timeline_status == "failed" do
        timeline_error_message(clip)
      else
        "No timeline is available for this clip yet."
      end

    [%{seq: 1, error: true, text: text}]
  end

  defp transcript_segments(:accurate, _preview_segments, timeline_segments, _clip),
    do: timeline_segments

  defp transcript_segment_class(segment, :accurate, clip) do
    cond do
      Map.get(segment, :error, false) and clip.timeline_status == "failed" ->
        "rounded-2xl border border-rose-300 bg-rose-50 px-4 py-4"

      Map.get(segment, :error, false) ->
        "rounded-xl border border-dashed border-base-300 bg-base-200/40 px-4 py-3 text-sm text-base-content/65"

      true ->
        "rounded-2xl border border-base-300 bg-base-200/50 px-4 py-3"
    end
  end

  defp transcript_segment_class(_segment, :raw, _clip),
    do: "rounded-2xl border border-base-300 bg-base-200/50 px-4 py-3"
end
