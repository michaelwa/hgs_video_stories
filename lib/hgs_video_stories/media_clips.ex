defmodule HgsVideoStories.MediaClips do
  @moduledoc false

  def storage_dir do
    Application.get_env(
      :hgs_video_stories,
      :media_clip_storage_dir,
      Path.join([
        to_string(:code.priv_dir(:hgs_video_stories)),
        "static",
        "uploads",
        "media_clips"
      ])
    )
  end

  def locate_clip_path(media_id) when is_integer(media_id) and media_id > 0 do
    case Path.wildcard(Path.join(storage_dir(), "#{media_id}-*")) |> Enum.sort() do
      [path | _rest] -> {:ok, path}
      [] -> {:error, :not_found}
    end
  end
end
