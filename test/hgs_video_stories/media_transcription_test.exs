defmodule HgsVideoStories.MediaTranscriptionTest do
  use HgsVideoStories.DataCase

  alias HgsVideoStories.MediaTranscription

  test "get_or_start_active_session returns existing active session for media" do
    media_id = System.unique_integer([:positive])

    assert {:ok, first_session} = MediaTranscription.get_or_start_active_session(media_id)
    assert {:ok, second_session} = MediaTranscription.get_or_start_active_session(media_id)

    assert first_session.id == second_session.id
    assert first_session.status == :active
  end

  test "stop_session allows a new active session to be created for media" do
    media_id = System.unique_integer([:positive])

    assert {:ok, first_session} = MediaTranscription.get_or_start_active_session(media_id)
    assert {:ok, stopped_session} = MediaTranscription.stop_session(first_session, :completed)
    assert stopped_session.status == :completed
    assert stopped_session.ended_at != nil

    assert {:ok, second_session} = MediaTranscription.get_or_start_active_session(media_id)

    assert second_session.id != first_session.id
    assert second_session.status == :active
  end

  test "upsert_completed_segment is idempotent for session, item, and seq" do
    media_id = System.unique_integer([:positive])

    assert {:ok, session} = MediaTranscription.get_or_start_active_session(media_id)

    base_attrs = %{
      transcription_session_id: session.id,
      media_id: media_id,
      item_id: "item-1",
      seq: 1,
      text: "hello",
      source_ts: DateTime.utc_now() |> DateTime.truncate(:microsecond)
    }

    assert {:ok, _segment} = MediaTranscription.upsert_completed_segment(base_attrs)

    updated_attrs = Map.put(base_attrs, :text, "hello world")
    assert {:ok, _segment} = MediaTranscription.upsert_completed_segment(updated_attrs)

    segments = MediaTranscription.list_segments_for_media(media_id)

    assert length(segments) == 1
    assert hd(segments).text == "hello world"
  end

  test "insert_event_log stores audit payload" do
    media_id = System.unique_integer([:positive])

    assert {:ok, session} = MediaTranscription.get_or_start_active_session(media_id)

    assert {:ok, event_log} =
             MediaTranscription.insert_event_log(%{
               transcription_session_id: session.id,
               media_id: media_id,
               event_type: "conversation.item.input_audio_transcription.completed",
               item_id: "item-1",
               payload: %{"text" => "hello world"},
               source_ts: DateTime.utc_now() |> DateTime.truncate(:microsecond)
             })

    assert event_log.transcription_session_id == session.id

    logs = MediaTranscription.list_event_logs_for_session(session.id)

    assert length(logs) == 1
    assert hd(logs).payload == %{"text" => "hello world"}
  end
end
