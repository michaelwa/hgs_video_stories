defmodule HgsVideoStoriesWeb.UserSocket do
  use Phoenix.Socket

  channel "media_timeline", HgsVideoStoriesWeb.MediaTimelineChannel
  channel "transcripts:*", HgsVideoStoriesWeb.TranscriptChannel

  @impl true
  def connect(_params, socket, _connect_info), do: {:ok, socket}

  @impl true
  def id(_socket), do: nil
end
