defmodule HgsVideoStories.MediaTranscription do
  import Ecto.Query

  alias HgsVideoStories.MediaTranscription.TranscriptionEventLog
  alias HgsVideoStories.MediaTranscription.TranscriptionSegment
  alias HgsVideoStories.MediaTranscription.TranscriptionSession
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

    %TranscriptionSegment{}
    |> TranscriptionSegment.changeset(attrs)
    |> Repo.insert(
      on_conflict: [
        set: [
          text: Map.get(attrs, :text) || Map.get(attrs, "text"),
          source_ts: Map.get(attrs, :source_ts) || Map.get(attrs, "source_ts"),
          updated_at: now
        ]
      ],
      conflict_target: [:transcription_session_id, :item_id, :seq]
    )
  end

  def insert_event_log(attrs) do
    %TranscriptionEventLog{}
    |> TranscriptionEventLog.changeset(attrs)
    |> Repo.insert()
  end

  def list_segments_for_media(media_id) when is_integer(media_id) do
    from(segment in TranscriptionSegment,
      where: segment.media_id == ^media_id,
      order_by: [asc: segment.inserted_at, asc: segment.seq]
    )
    |> Repo.all()
  end

  def list_event_logs_for_session(transcription_session_id)
      when is_binary(transcription_session_id) do
    from(event_log in TranscriptionEventLog,
      where: event_log.transcription_session_id == ^transcription_session_id,
      order_by: [asc: event_log.inserted_at]
    )
    |> Repo.all()
  end
end
