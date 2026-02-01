defmodule HgsVideoStoriesWeb.PageController do
  use HgsVideoStoriesWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
