defmodule HgsVideoStoriesWeb.RealtimeSessionControllerTest do
  use HgsVideoStoriesWeb.ConnCase, async: false

  alias HgsVideoStories.MediaTranscription

  defmodule RealtimeClientMock do
    @behaviour HgsVideoStories.OpenAI.RealtimeSessionClient

    @impl true
    def create_session(%{media_id: media_id}) when is_integer(media_id) do
      case media_id do
        999_999 ->
          {:error, :upstream_error, "OpenAI unavailable"}

        _ ->
          {:ok,
           %{
             ephemeral_key: "ephemeral-test-key",
             expires_at: 1_762_385_600,
             model: "gpt-4o-transcribe",
             turn_detection: "server_vad"
           }}
      end
    end
  end

  setup do
    Application.put_env(:hgs_video_stories, :openai_realtime_client, RealtimeClientMock)

    on_exit(fn ->
      Application.delete_env(:hgs_video_stories, :openai_realtime_client)
    end)

    :ok
  end

  test "POST /api/realtime/sessions returns app and openai session metadata", %{conn: conn} do
    media_id = System.unique_integer([:positive])

    response =
      conn
      |> put_req_header("accept", "application/json")
      |> post(~p"/api/realtime/sessions", %{"media_id" => media_id})
      |> json_response(200)

    assert response["media_id"] == media_id
    assert is_binary(response["transcription_session_id"])
    assert response["openai"]["ephemeral_key"] == "ephemeral-test-key"
    assert response["openai"]["model"] == "gpt-4o-transcribe"
    assert response["openai"]["turn_detection"] == "server_vad"

    assert %{} = MediaTranscription.get_active_session(media_id)
  end

  test "POST /api/realtime/sessions returns 400 when media_id is missing", %{conn: conn} do
    response =
      conn
      |> put_req_header("accept", "application/json")
      |> post(~p"/api/realtime/sessions", %{})
      |> json_response(400)

    assert response["error"] == "media_id is required."
  end

  test "POST /api/realtime/sessions returns 422 when media_id is invalid", %{conn: conn} do
    response =
      conn
      |> put_req_header("accept", "application/json")
      |> post(~p"/api/realtime/sessions", %{"media_id" => "not-an-int"})
      |> json_response(422)

    assert response["error"] == "media_id must be a positive integer."
  end

  test "POST /api/realtime/sessions returns 502 when upstream fails", %{conn: conn} do
    response =
      conn
      |> put_req_header("accept", "application/json")
      |> post(~p"/api/realtime/sessions", %{"media_id" => 999_999})
      |> json_response(502)

    assert response["error"] == "OpenAI unavailable"
  end
end
