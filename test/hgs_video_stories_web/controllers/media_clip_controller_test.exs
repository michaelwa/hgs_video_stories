defmodule HgsVideoStoriesWeb.MediaClipControllerTest do
  use HgsVideoStoriesWeb.ConnCase, async: true

  test "POST /api/media_clips stores uploaded clip and returns metadata", %{conn: conn} do
    storage_dir =
      Path.join(System.tmp_dir!(), "hgs-media-clips-#{System.unique_integer([:positive])}")

    Application.put_env(:hgs_video_stories, :media_clip_storage_dir, storage_dir)

    on_exit(fn ->
      Application.delete_env(:hgs_video_stories, :media_clip_storage_dir)
      File.rm_rf(storage_dir)
    end)

    upload_path =
      Path.join(System.tmp_dir!(), "hgs-upload-#{System.unique_integer([:positive])}.webm")

    File.write!(upload_path, "fake-webm-data")
    on_exit(fn -> File.rm(upload_path) end)

    upload = %Plug.Upload{
      path: upload_path,
      filename: "camera-test.webm",
      content_type: "video/webm"
    }

    params = %{
      "clip" => upload,
      "title" => "My Test Capture",
      "source" => "camera",
      "duration_seconds" => "12",
      "created_at" => "2026-02-08T13:30:00Z"
    }

    response =
      conn
      |> post(~p"/api/media_clips", params)
      |> json_response(201)

    assert response["title"] == "My Test Capture"
    assert response["source"] == "camera"
    assert response["duration_seconds"] == 12
    assert response["size_bytes"] > 0
    assert is_integer(response["id"])
    assert is_binary(response["saved_at"])

    stored_file =
      storage_dir
      |> Path.join(String.replace_prefix(response["url"], "/uploads/media_clips/", ""))

    assert File.exists?(stored_file)
  end
end
