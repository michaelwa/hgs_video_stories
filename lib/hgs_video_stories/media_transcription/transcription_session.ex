defmodule HgsVideoStories.MediaTranscription.TranscriptionSession do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "transcription_sessions" do
    field :media_id, :integer
    field :status, Ecto.Enum, values: [:active, :stopped, :failed, :completed]
    field :started_at, :utc_datetime_usec
    field :ended_at, :utc_datetime_usec

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(session, attrs) do
    session
    |> cast(attrs, [:media_id, :status, :started_at, :ended_at])
    |> validate_required([:media_id, :status, :started_at])
  end
end
