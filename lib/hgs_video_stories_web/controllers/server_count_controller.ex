defmodule HgsVideoStoriesWeb.ServerCountController do
  use HgsVideoStoriesWeb, :controller

  alias HgsVideoStories.ServerCounter

  def show(conn, _params) do
    json(conn, %{count: ServerCounter.get()})
  end

  def increment(conn, _params) do
    count = ServerCounter.get() + 1
    json(conn, %{count: ServerCounter.set(count)})
  end

  def decrement(conn, _params) do
    count = ServerCounter.get() - 1
    json(conn, %{count: ServerCounter.set(count)})
  end
end
