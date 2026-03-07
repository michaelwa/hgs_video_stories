defmodule HgsVideoStoriesWeb.TranscriptChannelTest do
  use HgsVideoStoriesWeb.ChannelCase

  alias HgsVideoStories.MediaTranscription
  alias HgsVideoStoriesWeb.TranscriptChannel
  alias HgsVideoStoriesWeb.UserSocket

  test "join succeeds for active session that matches topic media_id" do
    media_id = System.unique_integer([:positive])
    assert {:ok, session} = MediaTranscription.get_or_start_active_session(media_id)

    assert {:ok, _reply, _socket} =
             subscribe_and_join(
               socket(UserSocket, "socket-id", %{}),
               TranscriptChannel,
               "transcripts:#{media_id}",
               %{"transcription_session_id" => session.id}
             )
  end

  test "join fails when topic media_id does not match session media_id" do
    media_id = System.unique_integer([:positive])
    assert {:ok, session} = MediaTranscription.get_or_start_active_session(media_id)

    assert {:error, %{reason: reason}} =
             subscribe_and_join(
               socket(UserSocket, "socket-id", %{}),
               TranscriptChannel,
               "transcripts:#{media_id + 1}",
               %{"transcription_session_id" => session.id}
             )

    assert reason == "session does not match topic media_id or is not active"
  end

  test "transcript.completed upserts canonical segment" do
    media_id = System.unique_integer([:positive])
    assert {:ok, session} = MediaTranscription.get_or_start_active_session(media_id)

    assert {:ok, _reply, socket} =
             subscribe_and_join(
               socket(UserSocket, "socket-id", %{}),
               TranscriptChannel,
               "transcripts:#{media_id}",
               %{"transcription_session_id" => session.id}
             )

    payload = %{
      "media_id" => media_id,
      "item_id" => "item-1",
      "seq" => 1,
      "text" => "hello",
      "source_ts" =>
        DateTime.utc_now() |> DateTime.truncate(:microsecond) |> DateTime.to_iso8601()
    }

    ref = push(socket, "transcript.completed", payload)
    assert_reply ref, :ok, %{status: "ok"}

    updated_ref = push(socket, "transcript.completed", Map.put(payload, "text", "hello world"))
    assert_reply updated_ref, :ok, %{status: "ok"}

    segments = MediaTranscription.list_segments_for_media(media_id)
    assert length(segments) == 1
    assert hd(segments).text == "hello world"
  end

  test "transcript.audit stores audit payload" do
    media_id = System.unique_integer([:positive])
    assert {:ok, session} = MediaTranscription.get_or_start_active_session(media_id)

    assert {:ok, _reply, socket} =
             subscribe_and_join(
               socket(UserSocket, "socket-id", %{}),
               TranscriptChannel,
               "transcripts:#{media_id}",
               %{"transcription_session_id" => session.id}
             )

    audit_ref =
      push(socket, "transcript.audit", %{
        "media_id" => media_id,
        "event_type" => "conversation.item.input_audio_transcription.completed",
        "item_id" => "item-1",
        "source_ts" =>
          DateTime.utc_now() |> DateTime.truncate(:microsecond) |> DateTime.to_iso8601(),
        "payload" => %{"text" => "hello world"}
      })

    assert_reply audit_ref, :ok, %{status: "ok"}

    logs = MediaTranscription.list_event_logs_for_session(session.id)
    assert length(logs) == 1
    assert hd(logs).event_type == "conversation.item.input_audio_transcription.completed"
  end

  test "transcript.stop marks session complete and rejects additional completed events" do
    media_id = System.unique_integer([:positive])
    assert {:ok, session} = MediaTranscription.get_or_start_active_session(media_id)

    assert {:ok, _reply, socket} =
             subscribe_and_join(
               socket(UserSocket, "socket-id", %{}),
               TranscriptChannel,
               "transcripts:#{media_id}",
               %{"transcription_session_id" => session.id}
             )

    stop_ref = push(socket, "transcript.stop", %{"reason" => "completed"})
    assert_reply stop_ref, :ok, %{status: "ok"}

    completed_ref =
      push(socket, "transcript.completed", %{
        "media_id" => media_id,
        "item_id" => "item-1",
        "seq" => 1,
        "text" => "hello"
      })

    assert_reply completed_ref, :error, %{error: "session is not active"}
  end
end
