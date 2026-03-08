defmodule HgsVideoStoriesWeb.TimelineTranscriptionControllerTest do
  use HgsVideoStoriesWeb.ConnCase, async: false

  alias HgsVideoStories.MediaTranscription

  defmodule TimelineQueueMock do
    @behaviour HgsVideoStories.MediaTranscription.TimelineTranscriptionQueue

    @impl true
    def queue(media_id) when is_integer(media_id) do
      case media_id do
        404_404 ->
          {:error, :not_found, "Clip must be uploaded before timeline transcription can run."}

        502_502 ->
          {:error, :upstream_error, "OpenAI unavailable"}

        _ ->
          MediaTranscription.queue_timeline_transcription(media_id)
      end
    end
  end

  setup do
    Application.put_env(:hgs_video_stories, :timeline_transcription_queue, TimelineQueueMock)

    on_exit(fn ->
      Application.delete_env(:hgs_video_stories, :timeline_transcription_queue)
    end)

    :ok
  end

  test "POST /api/media_clips/:media_id/timeline_transcription queues timeline work", %{
    conn: conn
  } do
    media_id = System.unique_integer([:positive])

    response =
      conn
      |> put_req_header("accept", "application/json")
      |> post(~p"/api/media_clips/#{media_id}/timeline_transcription")
      |> json_response(202)

    assert response["timeline_transcription"]["media_id"] == media_id
    assert response["timeline_transcription"]["status"] == "pending"
    assert response["timeline_transcription"]["model"] == "whisper-1"
  end

  test "POST /api/media_clips/:media_id/timeline_transcription returns 404 when clip is missing",
       %{
         conn: conn
       } do
    response =
      conn
      |> put_req_header("accept", "application/json")
      |> post(~p"/api/media_clips/#{404_404}/timeline_transcription")
      |> json_response(404)

    assert response["error"] == "Clip must be uploaded before timeline transcription can run."
  end

  test "GET /api/media_clips/timeline_transcriptions returns timeline statuses", %{conn: conn} do
    media_id = System.unique_integer([:positive])
    assert {:ok, _timeline} = MediaTranscription.queue_timeline_transcription(media_id)

    response =
      conn
      |> put_req_header("accept", "application/json")
      |> get(~p"/api/media_clips/timeline_transcriptions?media_ids=#{media_id}")
      |> json_response(200)

    assert response["items"] == [
             %{
               "completed_at" => nil,
               "error_message" => nil,
               "media_id" => media_id,
               "model" => "whisper-1",
               "requested_at" => response["items"] |> hd() |> Map.fetch!("requested_at"),
               "segment_count" => 0,
               "started_at" => nil,
               "status" => "pending",
               "timeline_available" => false
             }
           ]
  end

  test "GET /api/media_clips/:media_id/timeline_transcription returns summary and segments", %{
    conn: conn
  } do
    media_id = System.unique_integer([:positive])
    assert {:ok, session} = MediaTranscription.create_session(%{media_id: media_id})

    :ok =
      MediaTranscription.replace_timeline_segments(session.id, media_id, [
        %{text: "Four score", start_ms: 0, end_ms: 1400}
      ])

    assert {:ok, _timeline} = MediaTranscription.queue_timeline_transcription(media_id)
    assert {:ok, _timeline} = MediaTranscription.mark_timeline_transcription_completed(media_id)

    response =
      conn
      |> put_req_header("accept", "application/json")
      |> get(~p"/api/media_clips/#{media_id}/timeline_transcription")
      |> json_response(200)

    assert response["timeline_transcription"]["media_id"] == media_id
    assert response["timeline_transcription"]["status"] == "completed"
    assert response["timeline_transcription"]["timeline_available"] == true

    assert response["segments"] == [
             %{
               "end_ms" => 1400,
               "id" => response["segments"] |> hd() |> Map.fetch!("id"),
               "seq" => 1,
               "start_ms" => 0,
               "text" => "Four score"
             }
           ]
  end
end
