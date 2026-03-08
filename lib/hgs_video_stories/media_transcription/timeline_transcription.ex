defmodule HgsVideoStories.MediaTranscription.TimelineTranscription do
  use Ecto.Schema
  import Ecto.Changeset

  schema "timeline_transcriptions" do
    field :media_id, :integer
    field :status, Ecto.Enum, values: [:pending, :processing, :completed, :failed]
    field :model, :string
    field :requested_at, :utc_datetime_usec
    field :started_at, :utc_datetime_usec
    field :completed_at, :utc_datetime_usec
    field :error_message, :string

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(timeline_transcription, attrs) do
    timeline_transcription
    |> cast(attrs, [
      :media_id,
      :status,
      :model,
      :requested_at,
      :started_at,
      :completed_at,
      :error_message
    ])
    |> validate_required([:media_id, :status, :model, :requested_at])
    |> validate_number(:media_id, greater_than: 0)
    |> unique_constraint(:media_id)
  end
end
