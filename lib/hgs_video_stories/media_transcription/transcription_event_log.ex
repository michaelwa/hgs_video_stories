defmodule HgsVideoStories.MediaTranscription.TranscriptionEventLog do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "transcription_event_logs" do
    field :media_id, :integer
    field :event_type, :string
    field :item_id, :string
    field :source_ts, :utc_datetime_usec
    field :payload, :map

    belongs_to :transcription_session, HgsVideoStories.MediaTranscription.TranscriptionSession

    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(event_log, attrs) do
    event_log
    |> cast(attrs, [
      :transcription_session_id,
      :media_id,
      :event_type,
      :item_id,
      :source_ts,
      :payload
    ])
    |> validate_required([:transcription_session_id, :media_id, :event_type, :payload])
  end
end
