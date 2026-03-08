defmodule HgsVideoStories.MediaTranscription do
  import Ecto.Query

  alias HgsVideoStories.MediaTranscription.TranscriptionEventLog
  alias HgsVideoStories.MediaTranscription.TranscriptionSegment
  alias HgsVideoStories.MediaTranscription.TranscriptionSession
  alias HgsVideoStories.MediaTranscription.TimelineTranscription
  alias HgsVideoStories.Repo

  def get_or_start_active_session(media_id) when is_integer(media_id) do
    case get_active_session(media_id) do
      nil ->
        case create_session(%{media_id: media_id}) do
          {:ok, session} -> {:ok, session}
          {:error, _changeset} -> {:ok, get_active_session(media_id)}
        end

      session ->
        {:ok, session}
    end
  end

  def create_session(attrs) do
    started_at = DateTime.utc_now() |> DateTime.truncate(:microsecond)

    attrs =
      attrs
      |> Map.new()
      |> Map.put_new(:status, :active)
      |> Map.put_new(:started_at, started_at)

    %TranscriptionSession{}
    |> TranscriptionSession.changeset(attrs)
    |> Repo.insert()
  end

  def stop_session(%TranscriptionSession{} = session, status \\ :stopped)
      when status in [:stopped, :failed, :completed] do
    ended_at = DateTime.utc_now() |> DateTime.truncate(:microsecond)

    session
    |> TranscriptionSession.changeset(%{status: status, ended_at: ended_at})
    |> Repo.update()
  end

  def get_active_session(media_id) when is_integer(media_id) do
    from(session in TranscriptionSession,
      where: session.media_id == ^media_id and session.status == :active,
      limit: 1
    )
    |> Repo.one()
  end

  def get_session(session_id) when is_binary(session_id) do
    Repo.get(TranscriptionSession, session_id)
  end

  def upsert_completed_segment(attrs) do
    now = DateTime.utc_now() |> DateTime.truncate(:microsecond)
    display_mode = Map.get(attrs, :display_mode) || Map.get(attrs, "display_mode") || :preview
    attrs = attrs |> Map.new() |> Map.put(:display_mode, display_mode)

    %TranscriptionSegment{}
    |> TranscriptionSegment.changeset(attrs)
    |> Repo.insert(
      on_conflict: [
        set: [
          text: Map.get(attrs, :text) || Map.get(attrs, "text"),
          start_ms: Map.get(attrs, :start_ms) || Map.get(attrs, "start_ms"),
          end_ms: Map.get(attrs, :end_ms) || Map.get(attrs, "end_ms"),
          source_ts: Map.get(attrs, :source_ts) || Map.get(attrs, "source_ts"),
          updated_at: now
        ]
      ],
      conflict_target: [:transcription_session_id, :item_id, :seq, :display_mode]
    )
  end

  def insert_event_log(attrs) do
    %TranscriptionEventLog{}
    |> TranscriptionEventLog.changeset(attrs)
    |> Repo.insert()
  end

  def list_segments_for_media(media_id, opts \\ []) when is_integer(media_id) do
    display_mode = Keyword.get(opts, :display_mode)

    query =
      from(segment in TranscriptionSegment,
        where: segment.media_id == ^media_id,
        order_by: [asc: segment.inserted_at, asc: segment.seq]
      )

    query =
      if is_nil(display_mode) do
        query
      else
        from(segment in query, where: segment.display_mode == ^display_mode)
      end

    Repo.all(query)
  end

  def list_event_logs_for_session(transcription_session_id)
      when is_binary(transcription_session_id) do
    from(event_log in TranscriptionEventLog,
      where: event_log.transcription_session_id == ^transcription_session_id,
      order_by: [asc: event_log.inserted_at]
    )
    |> Repo.all()
  end

  def queue_timeline_transcription(media_id) when is_integer(media_id) do
    now = DateTime.utc_now() |> DateTime.truncate(:microsecond)
    model = timeline_model()

    %TimelineTranscription{}
    |> TimelineTranscription.changeset(%{
      media_id: media_id,
      status: :pending,
      model: model,
      requested_at: now,
      started_at: nil,
      completed_at: nil,
      error_message: nil
    })
    |> Repo.insert(
      on_conflict: [
        set: [
          status: :pending,
          model: model,
          requested_at: now,
          started_at: nil,
          completed_at: nil,
          error_message: nil,
          updated_at: now
        ]
      ],
      conflict_target: [:media_id]
    )
  end

  def mark_timeline_transcription_processing(media_id) when is_integer(media_id) do
    now = DateTime.utc_now() |> DateTime.truncate(:microsecond)

    update_timeline_transcription(media_id, %{
      status: :processing,
      started_at: now,
      completed_at: nil,
      error_message: nil
    })
  end

  def mark_timeline_transcription_completed(media_id, model \\ nil) when is_integer(media_id) do
    now = DateTime.utc_now() |> DateTime.truncate(:microsecond)

    attrs =
      %{status: :completed, completed_at: now, error_message: nil}
      |> maybe_put_model(model)

    update_timeline_transcription(media_id, attrs)
  end

  def mark_timeline_transcription_failed(media_id, message) when is_integer(media_id) do
    now = DateTime.utc_now() |> DateTime.truncate(:microsecond)

    update_timeline_transcription(media_id, %{
      status: :failed,
      completed_at: now,
      error_message: message
    })
  end

  def get_timeline_transcription(media_id) when is_integer(media_id) do
    Repo.get_by(TimelineTranscription, media_id: media_id)
  end

  def list_timeline_transcriptions(media_ids) when is_list(media_ids) do
    from(timeline in TimelineTranscription,
      where: timeline.media_id in ^media_ids,
      order_by: [asc: timeline.media_id]
    )
    |> Repo.all()
  end

  def replace_timeline_segments(transcription_session_id, media_id, segments)
      when is_binary(transcription_session_id) and is_integer(media_id) and is_list(segments) do
    Repo.transaction(fn ->
      from(segment in TranscriptionSegment,
        where: segment.media_id == ^media_id and segment.display_mode == :timeline
      )
      |> Repo.delete_all()

      Enum.with_index(segments, 1)
      |> Enum.each(fn {segment, seq} ->
        attrs =
          segment
          |> Map.new()
          |> Map.put(:transcription_session_id, transcription_session_id)
          |> Map.put(:media_id, media_id)
          |> Map.put(:item_id, "timeline-#{seq}")
          |> Map.put(:seq, seq)
          |> Map.put(:display_mode, :timeline)

        case upsert_completed_segment(attrs) do
          {:ok, _segment} -> :ok
          {:error, changeset} -> Repo.rollback(changeset)
        end
      end)
    end)
    |> case do
      {:ok, _result} -> :ok
      {:error, changeset} -> {:error, changeset}
    end
  end

  def timeline_transcription_summary(media_id) when is_integer(media_id) do
    timeline_transcription = get_timeline_transcription(media_id)
    timeline_segments = list_segments_for_media(media_id, display_mode: :timeline)

    %{
      media_id: media_id,
      status: timeline_transcription_status(timeline_transcription, timeline_segments),
      timeline_available: timeline_segments != [],
      segment_count: length(timeline_segments),
      requested_at: timeline_transcription && timeline_transcription.requested_at,
      started_at: timeline_transcription && timeline_transcription.started_at,
      completed_at: timeline_transcription && timeline_transcription.completed_at,
      error_message: timeline_transcription && timeline_transcription.error_message,
      model: timeline_transcription && timeline_transcription.model
    }
  end

  defp update_timeline_transcription(media_id, attrs) do
    media_id
    |> get_timeline_transcription()
    |> case do
      nil ->
        queue_timeline_transcription(media_id)
        update_timeline_transcription(media_id, attrs)

      timeline_transcription ->
        timeline_transcription
        |> TimelineTranscription.changeset(attrs)
        |> Repo.update()
    end
  end

  defp timeline_transcription_status(nil, []), do: :missing
  defp timeline_transcription_status(nil, _segments), do: :completed

  defp timeline_transcription_status(%TimelineTranscription{status: status}, _segments),
    do: status

  defp maybe_put_model(attrs, nil), do: attrs
  defp maybe_put_model(attrs, model), do: Map.put(attrs, :model, model)

  defp timeline_model do
    :hgs_video_stories
    |> Application.get_env(:openai_timeline, [])
    |> Keyword.get(:model, "whisper-1")
  end
end
