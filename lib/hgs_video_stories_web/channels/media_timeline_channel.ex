defmodule HgsVideoStoriesWeb.MediaTimelineChannel do
  use HgsVideoStoriesWeb, :channel

  alias HgsVideoStories.MediaTranscription.TimelineStatusNotifier

  @impl true
  def join("media_timeline", _payload, socket) do
    {:ok, %{topic: TimelineStatusNotifier.topic()}, socket}
  end
end
