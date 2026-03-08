defmodule HgsVideoStories.Repo.Migrations.AddTimelineTranscriptions do
  use Ecto.Migration

  def change do
    create table(:timeline_transcriptions) do
      add :media_id, :integer, null: false
      add :status, :string, null: false, default: "pending"
      add :model, :string, null: false
      add :requested_at, :utc_datetime_usec, null: false
      add :started_at, :utc_datetime_usec
      add :completed_at, :utc_datetime_usec
      add :error_message, :text

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:timeline_transcriptions, [:media_id])
    create index(:timeline_transcriptions, [:status])
  end
end
