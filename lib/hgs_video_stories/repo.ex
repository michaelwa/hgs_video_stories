defmodule HgsVideoStories.Repo do
  use Ecto.Repo,
    otp_app: :hgs_video_stories,
    adapter: Ecto.Adapters.SQLite3
end
