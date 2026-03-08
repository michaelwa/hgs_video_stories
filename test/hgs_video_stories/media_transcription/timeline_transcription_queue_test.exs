defmodule HgsVideoStories.MediaTranscription.TimelineTranscriptionQueueTest do
  use HgsVideoStories.DataCase

  alias HgsVideoStories.MediaClips
  alias HgsVideoStories.MediaTranscription
  alias HgsVideoStories.MediaTranscription.TimelineStatusNotifier
  alias HgsVideoStories.MediaTranscription.TimelineTranscriptionQueue

  defmodule TimelineClientMock do
    @behaviour HgsVideoStories.OpenAI.TimelineTranscriptionClient

    @impl true
    def transcribe_file(_path) do
      {:ok,
       %{
         model: "whisper-1",
         raw_response: %{"segments" => [%{"text" => "Four score"}]},
         segments: [
           %{text: "Four score", start_ms: 0, end_ms: 1400},
           %{text: "and seven years ago", start_ms: 1400, end_ms: 3600}
         ]
       }}
    end
  end

  setup do
    storage_dir =
      Path.join(System.tmp_dir!(), "hgs-media-clips-#{System.unique_integer([:positive])}")

    Application.put_env(:hgs_video_stories, :media_clip_storage_dir, storage_dir)
    Application.put_env(:hgs_video_stories, :openai_timeline_client, TimelineClientMock)

    Application.put_env(:hgs_video_stories, :timeline_transcription_runner, fn _media_id ->
      {:ok, self()}
    end)

    File.mkdir_p!(storage_dir)
    File.write!(Path.join(storage_dir, "123-demo.webm"), "fake-webm-data")

    on_exit(fn ->
      Application.delete_env(:hgs_video_stories, :media_clip_storage_dir)
      Application.delete_env(:hgs_video_stories, :openai_timeline_client)
      Application.delete_env(:hgs_video_stories, :timeline_transcription_runner)
      File.rm_rf(storage_dir)
    end)

    :ok
  end

  test "run/1 stores completed timeline segments and status" do
    media_id = 123
    assert {:ok, _timeline} = MediaTranscription.queue_timeline_transcription(media_id)
    assert {:ok, _path} = MediaClips.locate_clip_path(media_id)

    assert :ok = TimelineTranscriptionQueue.run(media_id)

    summary = MediaTranscription.timeline_transcription_summary(media_id)
    segments = MediaTranscription.list_segments_for_media(media_id, display_mode: :timeline)

    assert summary.status == :completed
    assert summary.timeline_available == true
    assert length(segments) == 2
    assert Enum.at(segments, 0).start_ms == 0
    assert Enum.at(segments, 1).end_ms == 3600
  end

  test "queue/1 broadcasts pending status update" do
    media_id = 123
    Phoenix.PubSub.subscribe(HgsVideoStories.PubSub, TimelineStatusNotifier.topic())

    assert {:ok, _timeline} = TimelineTranscriptionQueue.queue(media_id)

    assert_receive %Phoenix.Socket.Broadcast{
      topic: "media_timeline",
      event: "timeline.status_updated",
      payload: %{media_id: 123, status: :pending}
    }
  end
end
