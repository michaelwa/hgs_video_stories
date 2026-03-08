defmodule HgsVideoStoriesWeb.RecordStudioLiveTest do
  use HgsVideoStoriesWeb.ConnCase

  import Phoenix.LiveViewTest

  test "GET /record renders the recording studio live view", %{conn: conn} do
    {:ok, _view, html} = live(conn, ~p"/record")

    assert html =~ "State: idle"
    assert html =~ "Capture Off"
    assert html =~ "Record"
  end
end
