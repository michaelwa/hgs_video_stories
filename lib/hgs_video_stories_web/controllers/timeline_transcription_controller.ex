defmodule HgsVideoStoriesWeb.TimelineTranscriptionController do
  use HgsVideoStoriesWeb, :controller

  alias HgsVideoStories.MediaTranscription
  alias HgsVideoStories.MediaTranscription.TimelineTranscriptionQueue

  def create(conn, %{"media_id" => media_id_raw}) do
    with {:ok, media_id} <- parse_media_id(media_id_raw),
         {:ok, timeline_transcription} <- timeline_queue().queue(media_id) do
      conn
      |> put_status(:accepted)
      |> json(%{timeline_transcription: serialize_timeline_transcription(timeline_transcription)})
    else
      {:error, :invalid_media_id, message} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: message})

      {:error, :not_found, message} ->
        conn
        |> put_status(:not_found)
        |> json(%{error: message})

      {:error, _reason, message} ->
        conn
        |> put_status(:bad_gateway)
        |> json(%{error: message})
    end
  end

  def index(conn, params) do
    with {:ok, media_ids} <- parse_media_ids(params["media_ids"]) do
      items =
        media_ids
        |> MediaTranscription.list_timeline_transcriptions()
        |> Enum.map(&serialize_timeline_transcription/1)

      json(conn, %{items: items})
    else
      {:error, :invalid_media_ids, message} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: message})
    end
  end

  def show(conn, %{"media_id" => media_id_raw}) do
    with {:ok, media_id} <- parse_media_id(media_id_raw) do
      summary = MediaTranscription.timeline_transcription_summary(media_id)

      json(conn, %{
        timeline_transcription: summary,
        preview_segments: serialize_segments(media_id, :preview),
        timeline_segments: serialize_segments(media_id, :timeline)
      })
    else
      {:error, :invalid_media_id, message} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: message})
    end
  end

  def export(conn, %{"media_id" => media_id_raw}) do
    with {:ok, media_id} <- parse_media_id(media_id_raw),
         %{} = summary <- exportable_timeline_summary(media_id) do
      payload = %{
        format: "hgs_video_stories.timeline_transcription.v1",
        exported_at: DateTime.utc_now() |> DateTime.truncate(:second),
        media_id: media_id,
        timeline_transcription: serialize_timeline_transcription(summary),
        timeline_segments: serialize_segments(media_id, :timeline)
      }

      send_download(
        conn,
        {:binary, Jason.encode!(payload, pretty: true)},
        filename: "media-#{media_id}-timeline.json",
        content_type: "application/json"
      )
    else
      {:error, :invalid_media_id, message} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: message})

      {:error, :timeline_unavailable, message} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: message})
    end
  end

  defp timeline_queue do
    Application.get_env(
      :hgs_video_stories,
      :timeline_transcription_queue,
      TimelineTranscriptionQueue
    )
  end

  defp parse_media_id(media_id_raw) when is_integer(media_id_raw) and media_id_raw > 0,
    do: {:ok, media_id_raw}

  defp parse_media_id(media_id_raw) when is_binary(media_id_raw) do
    case Integer.parse(media_id_raw) do
      {media_id, ""} when media_id > 0 -> {:ok, media_id}
      _ -> {:error, :invalid_media_id, "media_id must be a positive integer."}
    end
  end

  defp parse_media_id(_media_id_raw),
    do: {:error, :invalid_media_id, "media_id must be a positive integer."}

  defp parse_media_ids(nil), do: {:ok, []}

  defp parse_media_ids(media_ids_raw) when is_binary(media_ids_raw) do
    media_ids =
      media_ids_raw
      |> String.split(",", trim: true)
      |> Enum.map(&String.trim/1)
      |> Enum.map(&Integer.parse/1)

    if Enum.all?(media_ids, fn
         {media_id, ""} when media_id > 0 -> true
         _ -> false
       end) do
      {:ok, Enum.map(media_ids, fn {media_id, ""} -> media_id end)}
    else
      {:error, :invalid_media_ids,
       "media_ids must be a comma-separated list of positive integers."}
    end
  end

  defp parse_media_ids(_media_ids_raw),
    do:
      {:error, :invalid_media_ids,
       "media_ids must be a comma-separated list of positive integers."}

  defp serialize_timeline_transcription(%{status: status} = timeline_transcription) do
    %{
      media_id: timeline_transcription.media_id,
      status: status,
      timeline_available:
        Map.get(timeline_transcription, :timeline_available, status == :completed),
      segment_count: Map.get(timeline_transcription, :segment_count, 0),
      requested_at: timeline_transcription.requested_at,
      started_at: timeline_transcription.started_at,
      completed_at: timeline_transcription.completed_at,
      error_message: timeline_transcription.error_message,
      model: timeline_transcription.model
    }
  end

  defp serialize_segments(media_id, display_mode) do
    media_id
    |> MediaTranscription.list_segments_for_media(display_mode: display_mode)
    |> Enum.map(fn segment ->
      %{
        id: segment.id,
        seq: segment.seq,
        text: segment.text,
        start_ms: segment.start_ms,
        end_ms: segment.end_ms
      }
    end)
  end

  defp exportable_timeline_summary(media_id) do
    summary = MediaTranscription.timeline_transcription_summary(media_id)

    if summary.timeline_available and summary.status == :completed do
      summary
    else
      {:error, :timeline_unavailable, "Timeline transcript is not available for export yet."}
    end
  end
end
