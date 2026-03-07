defmodule HgsVideoStories.MediaTranscription.TranscriptionSegment do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "transcription_segments" do
    field :media_id, :integer
    field :item_id, :string
    field :seq, :integer
    field :text, :string
    field :source_ts, :utc_datetime_usec

    belongs_to :transcription_session, HgsVideoStories.MediaTranscription.TranscriptionSession

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(segment, attrs) do
    segment
    |> cast(attrs, [:transcription_session_id, :media_id, :item_id, :seq, :text, :source_ts])
    |> validate_required([:transcription_session_id, :media_id, :item_id, :seq, :text])
    |> validate_number(:seq, greater_than_or_equal_to: 1)
  end
end
