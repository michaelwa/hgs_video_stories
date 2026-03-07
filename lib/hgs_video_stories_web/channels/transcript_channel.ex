defmodule HgsVideoStoriesWeb.TranscriptChannel do
  use HgsVideoStoriesWeb, :channel

  alias HgsVideoStories.MediaTranscription

  @impl true
  def join("transcripts:" <> media_id_raw, %{"transcription_session_id" => session_id}, socket) do
    with {:ok, media_id} <- parse_media_id(media_id_raw),
         {:ok, session} <- fetch_session(session_id),
         true <- session.media_id == media_id,
         true <- session.status == :active do
      {:ok,
       assign(socket,
         media_id: media_id,
         transcription_session_id: session.id
       )}
    else
      false ->
        {:error, %{reason: "session does not match topic media_id or is not active"}}

      {:error, reason} ->
        {:error, %{reason: reason}}
    end
  end

  @impl true
  def handle_in("transcript.completed", payload, socket) do
    with :ok <- ensure_payload_media_matches(payload, socket.assigns.media_id),
         {:ok, item_id} <- require_non_empty_string(payload["item_id"], "item_id is required"),
         {:ok, seq} <- parse_positive_integer(payload["seq"], "seq must be a positive integer"),
         {:ok, text} <- require_non_empty_string(payload["text"], "text is required"),
         {:ok, source_ts} <- parse_optional_datetime(payload["source_ts"]),
         {:ok, _session} <- ensure_active_session(socket.assigns.transcription_session_id),
         {:ok, _segment} <-
           MediaTranscription.upsert_completed_segment(%{
             transcription_session_id: socket.assigns.transcription_session_id,
             media_id: socket.assigns.media_id,
             item_id: item_id,
             seq: seq,
             text: text,
             source_ts: source_ts
           }) do
      :telemetry.execute(
        [:hgs_video_stories, :transcription, :segment, :upserted],
        %{count: 1},
        %{
          media_id: socket.assigns.media_id,
          transcription_session_id: socket.assigns.transcription_session_id
        }
      )

      {:reply, {:ok, %{status: "ok"}}, socket}
    else
      {:error, reason} ->
        :telemetry.execute(
          [:hgs_video_stories, :transcription, :segment, :upsert_failed],
          %{count: 1},
          %{media_id: socket.assigns.media_id, error: reason}
        )

        {:reply, {:error, %{error: reason}}, socket}
    end
  end

  @impl true
  def handle_in("transcript.audit", payload, socket) do
    with :ok <- ensure_payload_media_matches(payload, socket.assigns.media_id),
         {:ok, event_type} <-
           require_non_empty_string(payload["event_type"], "event_type is required"),
         {:ok, item_id} <- parse_optional_string(payload["item_id"]),
         {:ok, source_ts} <- parse_optional_datetime(payload["source_ts"]),
         {:ok, event_payload} <-
           parse_required_map(payload["payload"], "payload must be an object"),
         {:ok, _session} <- ensure_active_session(socket.assigns.transcription_session_id),
         {:ok, _event_log} <-
           MediaTranscription.insert_event_log(%{
             transcription_session_id: socket.assigns.transcription_session_id,
             media_id: socket.assigns.media_id,
             event_type: event_type,
             item_id: item_id,
             source_ts: source_ts,
             payload: event_payload
           }) do
      :telemetry.execute(
        [:hgs_video_stories, :transcription, :event_log, :inserted],
        %{count: 1},
        %{
          media_id: socket.assigns.media_id,
          transcription_session_id: socket.assigns.transcription_session_id
        }
      )

      {:reply, {:ok, %{status: "ok"}}, socket}
    else
      {:error, reason} ->
        :telemetry.execute(
          [:hgs_video_stories, :transcription, :event_log, :insert_failed],
          %{count: 1},
          %{media_id: socket.assigns.media_id, error: reason}
        )

        {:reply, {:error, %{error: reason}}, socket}
    end
  end

  @impl true
  def handle_in("transcript.stop", payload, socket) do
    with {:ok, session} <- fetch_session(socket.assigns.transcription_session_id),
         true <- session.status == :active,
         {:ok, status} <- parse_stop_status(payload["reason"]),
         {:ok, _updated_session} <- MediaTranscription.stop_session(session, status) do
      :telemetry.execute(
        [:hgs_video_stories, :transcription, :session, :stopped],
        %{count: 1},
        %{
          media_id: socket.assigns.media_id,
          transcription_session_id: socket.assigns.transcription_session_id
        }
      )

      {:reply, {:ok, %{status: "ok"}}, socket}
    else
      false ->
        :telemetry.execute(
          [:hgs_video_stories, :transcription, :session, :stop_failed],
          %{count: 1},
          %{media_id: socket.assigns.media_id, error: "session is not active"}
        )

        {:reply, {:error, %{error: "session is not active"}}, socket}

      {:error, reason} ->
        :telemetry.execute(
          [:hgs_video_stories, :transcription, :session, :stop_failed],
          %{count: 1},
          %{media_id: socket.assigns.media_id, error: reason}
        )

        {:reply, {:error, %{error: reason}}, socket}
    end
  end

  defp fetch_session(session_id) when is_binary(session_id) and session_id != "" do
    case MediaTranscription.get_session(session_id) do
      nil -> {:error, "transcription session not found"}
      session -> {:ok, session}
    end
  end

  defp fetch_session(_session_id), do: {:error, "transcription_session_id is required"}

  defp ensure_active_session(session_id) do
    case fetch_session(session_id) do
      {:ok, %{status: :active} = session} -> {:ok, session}
      {:ok, _session} -> {:error, "session is not active"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp parse_media_id(media_id_raw) when is_binary(media_id_raw) do
    case Integer.parse(media_id_raw) do
      {media_id, ""} when media_id > 0 -> {:ok, media_id}
      _ -> {:error, "invalid media_id in topic"}
    end
  end

  defp ensure_payload_media_matches(payload, media_id) do
    case parse_positive_integer(payload["media_id"], "media_id must be a positive integer") do
      {:ok, ^media_id} -> :ok
      {:ok, _other} -> {:error, "payload media_id does not match topic"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp parse_positive_integer(value, _message) when is_integer(value) and value > 0,
    do: {:ok, value}

  defp parse_positive_integer(value, message) when is_binary(value) do
    case Integer.parse(value) do
      {parsed, ""} when parsed > 0 -> {:ok, parsed}
      _ -> {:error, message}
    end
  end

  defp parse_positive_integer(_value, message), do: {:error, message}

  defp require_non_empty_string(value, _message) when is_binary(value) and value != "",
    do: {:ok, value}

  defp require_non_empty_string(_value, message), do: {:error, message}

  defp parse_optional_string(nil), do: {:ok, nil}
  defp parse_optional_string(""), do: {:ok, nil}
  defp parse_optional_string(value) when is_binary(value), do: {:ok, value}
  defp parse_optional_string(_value), do: {:error, "item_id must be a string"}

  defp parse_optional_datetime(nil), do: {:ok, nil}
  defp parse_optional_datetime(""), do: {:ok, nil}

  defp parse_optional_datetime(value) when is_binary(value) do
    case DateTime.from_iso8601(value) do
      {:ok, parsed, _offset} -> {:ok, parsed}
      {:error, _reason} -> {:error, "source_ts must be an ISO8601 timestamp"}
    end
  end

  defp parse_optional_datetime(_value), do: {:error, "source_ts must be an ISO8601 timestamp"}

  defp parse_required_map(value, _message) when is_map(value), do: {:ok, value}
  defp parse_required_map(_value, message), do: {:error, message}

  defp parse_stop_status(reason) when reason in [nil, "", "user_stopped"], do: {:ok, :stopped}
  defp parse_stop_status("completed"), do: {:ok, :completed}
  defp parse_stop_status("failed"), do: {:ok, :failed}
  defp parse_stop_status(_reason), do: {:error, "invalid stop reason"}
end
