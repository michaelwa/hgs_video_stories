defmodule HgsVideoStories.MediaTranscription.TimelineTranscriptionQueue do
  @moduledoc false

  alias HgsVideoStories.MediaClips
  alias HgsVideoStories.MediaTranscription
  alias HgsVideoStories.OpenAI.TimelineTranscriptionClient

  @callback queue(integer()) ::
              {:ok, HgsVideoStories.MediaTranscription.TimelineTranscription.t()}
              | {:error, atom(), String.t()}

  def queue(media_id) when is_integer(media_id) and media_id > 0 do
    with {:ok, _path} <- locate_clip(media_id),
         {:ok, timeline_transcription} <-
           MediaTranscription.queue_timeline_transcription(media_id),
         {:ok, _pid} <-
           Task.Supervisor.start_child(HgsVideoStories.TaskSupervisor, fn ->
             run(media_id)
           end) do
      {:ok, timeline_transcription}
    else
      {:error, :not_found} ->
        {:error, :not_found, "Clip must be uploaded before timeline transcription can run."}

      {:error, reason, message} ->
        {:error, reason, message}

      {:error, reason} when is_atom(reason) ->
        {:error, reason, "Could not queue timeline transcription."}
    end
  end

  def queue(_media_id), do: {:error, :invalid_media_id, "media_id must be a positive integer."}

  def run(media_id) when is_integer(media_id) and media_id > 0 do
    with {:ok, clip_path} <- locate_clip(media_id),
         {:ok, _timeline_transcription} <-
           MediaTranscription.mark_timeline_transcription_processing(media_id),
         {:ok, transcription_session} <- MediaTranscription.create_session(%{media_id: media_id}),
         {:ok, response} <- timeline_client().transcribe_file(clip_path),
         :ok <-
           MediaTranscription.replace_timeline_segments(
             transcription_session.id,
             media_id,
             response.segments
           ),
         {:ok, _event_log} <-
           MediaTranscription.insert_event_log(%{
             transcription_session_id: transcription_session.id,
             media_id: media_id,
             event_type: "timeline_transcription.completed",
             payload: response.raw_response
           }),
         {:ok, _updated_session} <-
           MediaTranscription.stop_session(transcription_session, :completed),
         {:ok, _timeline_transcription} <-
           MediaTranscription.mark_timeline_transcription_completed(media_id, response.model) do
      :telemetry.execute(
        [:hgs_video_stories, :timeline_transcription, :completed],
        %{count: 1},
        %{media_id: media_id}
      )

      :ok
    else
      {:error, reason, message} ->
        fail_timeline_transcription(media_id, message)

        :telemetry.execute(
          [:hgs_video_stories, :timeline_transcription, :failed],
          %{count: 1},
          %{media_id: media_id, error: message, reason: reason}
        )

        {:error, reason, message}

      {:error, %Ecto.Changeset{} = changeset} ->
        message = "Could not save timeline transcription results."
        fail_timeline_transcription(media_id, message)

        :telemetry.execute(
          [:hgs_video_stories, :timeline_transcription, :failed],
          %{count: 1},
          %{media_id: media_id, error: inspect(changeset.errors)}
        )

        {:error, :persistence_error, message}
    end
  end

  defp fail_timeline_transcription(media_id, message) do
    case MediaTranscription.get_active_session(media_id) do
      nil -> :ok
      session -> MediaTranscription.stop_session(session, :failed)
    end

    MediaTranscription.mark_timeline_transcription_failed(media_id, message)
  end

  defp locate_clip(media_id) do
    case MediaClips.locate_clip_path(media_id) do
      {:ok, path} -> {:ok, path}
      {:error, :not_found} -> {:error, :not_found}
    end
  end

  defp timeline_client do
    Application.get_env(
      :hgs_video_stories,
      :openai_timeline_client,
      TimelineTranscriptionClient
    )
  end
end
