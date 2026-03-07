defmodule HgsVideoStories.Repo.Migrations.CreateTranscriptionTables do
  use Ecto.Migration

  def change do
    create table(:transcription_sessions, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :media_id, :integer, null: false
      add :status, :string, null: false
      add :started_at, :utc_datetime_usec, null: false
      add :ended_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create index(:transcription_sessions, [:media_id])

    create unique_index(
             :transcription_sessions,
             [:media_id],
             where: "status = 'active'",
             name: :transcription_sessions_active_media_id_index
           )

    create table(:transcription_segments, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :transcription_session_id,
          references(:transcription_sessions, type: :binary_id, on_delete: :delete_all),
          null: false

      add :media_id, :integer, null: false
      add :item_id, :string, null: false
      add :seq, :integer, null: false
      add :text, :text, null: false
      add :source_ts, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create index(:transcription_segments, [:media_id, :inserted_at])

    create unique_index(
             :transcription_segments,
             [:transcription_session_id, :item_id, :seq]
           )

    create table(:transcription_event_logs, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :transcription_session_id,
          references(:transcription_sessions, type: :binary_id, on_delete: :delete_all),
          null: false

      add :media_id, :integer, null: false
      add :event_type, :string, null: false
      add :item_id, :string
      add :source_ts, :utc_datetime_usec
      add :payload, :map, null: false

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:transcription_event_logs, [:transcription_session_id, :inserted_at])
    create index(:transcription_event_logs, [:event_type])
  end
end
