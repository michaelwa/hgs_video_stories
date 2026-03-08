defmodule HgsVideoStoriesWeb.MediaTimelineChannelTest do
  use HgsVideoStoriesWeb.ChannelCase

  alias HgsVideoStories.MediaTranscription
  alias HgsVideoStories.MediaTranscription.TimelineStatusNotifier
  alias HgsVideoStoriesWeb.MediaTimelineChannel
  alias HgsVideoStoriesWeb.UserSocket

  test "join succeeds for media timeline topic" do
    assert {:ok, reply, _socket} =
             subscribe_and_join(
               socket(UserSocket, "socket-id", %{}),
               MediaTimelineChannel,
               "media_timeline",
               %{}
             )

    assert reply.topic == "media_timeline"
  end

  test "broadcast_status publishes timeline status update payload" do
    media_id = System.unique_integer([:positive])
    assert {:ok, _timeline} = MediaTranscription.queue_timeline_transcription(media_id)

    HgsVideoStoriesWeb.Endpoint.subscribe("media_timeline")
    TimelineStatusNotifier.broadcast_status(media_id)

    assert_broadcast "timeline.status_updated", payload
    assert payload.media_id == media_id
    assert payload.status == :pending
    assert payload.timeline_available == false
  end
end
