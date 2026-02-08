defmodule HgsVideoStoriesWeb.PageController do
  use HgsVideoStoriesWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end

  def record(conn, _params) do
    render(conn, :record)
  end

  def media(conn, _params) do
    render(conn, :media)
  end
end
