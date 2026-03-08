defmodule HgsVideoStories.MediaTranscription.TimelineStatusNotifier do
  @moduledoc false

  alias HgsVideoStories.MediaTranscription
  alias HgsVideoStoriesWeb.Endpoint

  @topic "media_timeline"
  @event "timeline.status_updated"

  def broadcast_status(media_id) when is_integer(media_id) and media_id > 0 do
    media_id
    |> MediaTranscription.timeline_transcription_summary()
    |> serialize_summary()
    |> then(fn payload ->
      Endpoint.broadcast(@topic, @event, payload)
    end)
  end

  def topic, do: @topic
  def event, do: @event

  defp serialize_summary(summary) do
    %{
      media_id: summary.media_id,
      status: summary.status,
      timeline_available: summary.timeline_available,
      segment_count: summary.segment_count,
      requested_at: serialize_datetime(summary.requested_at),
      started_at: serialize_datetime(summary.started_at),
      completed_at: serialize_datetime(summary.completed_at),
      error_message: summary.error_message,
      model: summary.model
    }
  end

  defp serialize_datetime(%DateTime{} = datetime), do: DateTime.to_iso8601(datetime)
  defp serialize_datetime(_value), do: nil
end
