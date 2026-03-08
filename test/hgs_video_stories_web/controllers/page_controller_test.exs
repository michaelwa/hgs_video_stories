defmodule HgsVideoStoriesWeb.PageControllerTest do
  use HgsVideoStoriesWeb.ConnCase

  test "GET /", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert html_response(conn, 200) =~ "Record short video stories directly from your browser."
  end

  test "GET /record", %{conn: conn} do
    conn = get(conn, ~p"/record")
    assert html_response(conn, 200)
  end
end
