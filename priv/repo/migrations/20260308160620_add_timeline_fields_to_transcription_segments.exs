defmodule HgsVideoStories.Repo.Migrations.AddTimelineFieldsToTranscriptionSegments do
  use Ecto.Migration

  def change do
    alter table(:transcription_segments) do
      add :display_mode, :string, null: false, default: "preview"
      add :start_ms, :integer
      add :end_ms, :integer
    end

    drop index(:transcription_segments, [:transcription_session_id, :item_id, :seq])

    create unique_index(
             :transcription_segments,
             [:transcription_session_id, :item_id, :seq, :display_mode]
           )
  end
end
