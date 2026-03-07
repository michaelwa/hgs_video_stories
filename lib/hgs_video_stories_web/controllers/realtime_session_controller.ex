defmodule HgsVideoStoriesWeb.RealtimeSessionController do
  use HgsVideoStoriesWeb, :controller

  alias HgsVideoStories.MediaTranscription
  alias HgsVideoStories.OpenAI.RealtimeSessionClient

  def create(conn, params) do
    with {:ok, media_id} <- parse_media_id(params),
         {:ok, transcription_session} <- MediaTranscription.get_or_start_active_session(media_id),
         {:ok, openai_session} <- realtime_client().create_session(%{media_id: media_id}) do
      :telemetry.execute(
        [:hgs_video_stories, :transcription, :session, :created],
        %{count: 1},
        %{media_id: media_id, transcription_session_id: transcription_session.id}
      )

      json(conn, %{
        transcription_session_id: transcription_session.id,
        media_id: media_id,
        openai: %{
          ephemeral_key: openai_session.ephemeral_key,
          expires_at: openai_session.expires_at,
          model: openai_session.model,
          turn_detection: openai_session.turn_detection
        }
      })
    else
      {:error, :missing_media_id, message} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: message})

      {:error, :invalid_media_id, message} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: message})

      {:error, _reason, message} ->
        :telemetry.execute(
          [:hgs_video_stories, :transcription, :session, :create_failed],
          %{count: 1},
          %{error: message}
        )

        conn
        |> put_status(:bad_gateway)
        |> json(%{error: message})
    end
  end

  defp realtime_client do
    Application.get_env(
      :hgs_video_stories,
      :openai_realtime_client,
      RealtimeSessionClient
    )
  end

  defp parse_media_id(%{"media_id" => media_id}) when is_integer(media_id) and media_id > 0,
    do: {:ok, media_id}

  defp parse_media_id(%{"media_id" => media_id}) when is_binary(media_id) do
    case Integer.parse(media_id) do
      {value, ""} when value > 0 -> {:ok, value}
      _ -> {:error, :invalid_media_id, "media_id must be a positive integer."}
    end
  end

  defp parse_media_id(%{"media_id" => _media_id}),
    do: {:error, :invalid_media_id, "media_id must be a positive integer."}

  defp parse_media_id(_params), do: {:error, :missing_media_id, "media_id is required."}
end
