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
    field :display_mode, Ecto.Enum, values: [:preview, :timeline]
    field :start_ms, :integer
    field :end_ms, :integer
    field :source_ts, :utc_datetime_usec

    belongs_to :transcription_session, HgsVideoStories.MediaTranscription.TranscriptionSession

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(segment, attrs) do
    segment
    |> cast(attrs, [
      :transcription_session_id,
      :media_id,
      :item_id,
      :seq,
      :text,
      :display_mode,
      :start_ms,
      :end_ms,
      :source_ts
    ])
    |> validate_required([
      :transcription_session_id,
      :media_id,
      :item_id,
      :seq,
      :text,
      :display_mode
    ])
    |> validate_number(:seq, greater_than_or_equal_to: 1)
    |> validate_number(:start_ms, greater_than_or_equal_to: 0)
    |> validate_number(:end_ms, greater_than_or_equal_to: 0)
    |> validate_timing_window()
  end

  defp validate_timing_window(changeset) do
    start_ms = get_field(changeset, :start_ms)
    end_ms = get_field(changeset, :end_ms)

    if is_integer(start_ms) and is_integer(end_ms) and end_ms < start_ms do
      add_error(changeset, :end_ms, "must be greater than or equal to start_ms")
    else
      changeset
    end
  end
end
