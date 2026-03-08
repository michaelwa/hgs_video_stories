defmodule HgsVideoStoriesWeb.MediaLibraryLiveTest do
  use HgsVideoStoriesWeb.ConnCase

  import Phoenix.LiveViewTest

  test "GET /media renders the media library live view", %{conn: conn} do
    {:ok, _view, html} = live(conn, ~p"/media")

    assert html =~ "Media Management"
    assert html =~ "Loading your media library"
  end

  test "sync_clips populates the media library from the browser store", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/media")

    clips = [
      %{
        "id" => 1_772_999_999_000,
        "title" => "Microphone Capture 9:54 AM",
        "source" => "mic_only",
        "duration_seconds" => 12,
        "created_at" => "2026-03-08T17:54:00Z",
        "size_bytes" => 1_234_567,
        "had_audio" => true,
        "has_blob" => true,
        "server_url" => "/uploads/media_clips/1772999999000.webm",
        "server_saved_at" => "2026-03-08T17:55:00Z",
        "server_id" => 1_772_999_999_000
      }
    ]

    view
    |> element("#media-library-page")
    |> render_hook("sync_clips", %{"clips" => clips})

    assert has_element?(view, "#media-clip-list")
    assert has_element?(view, "#media-selected-title")
    assert render(view) =~ "Microphone Capture 9:54 AM"
    assert render(view) =~ "Show Transcript"
  end
end
