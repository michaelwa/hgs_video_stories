defmodule HgsVideoStoriesWeb.MediaClipController do
  use HgsVideoStoriesWeb, :controller

  def create(conn, params) do
    with %Plug.Upload{} = upload <- params["clip"],
         true <- valid_video_upload?(upload),
         :ok <- File.mkdir_p(storage_dir()),
         {:ok, metadata} <- copy_to_storage(upload, params) do
      conn
      |> put_status(:created)
      |> json(metadata)
    else
      false ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Only video uploads are supported."})

      nil ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "Missing clip upload."})

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Could not save clip.", reason: inspect(reason)})
    end
  end

  defp valid_video_upload?(%Plug.Upload{content_type: "video/" <> _rest}), do: true
  defp valid_video_upload?(_upload), do: false

  defp copy_to_storage(upload, params) do
    clip_id = System.system_time(:millisecond)
    extension = upload.filename |> Path.extname() |> normalize_extension(upload.content_type)
    safe_title = sanitize_title(params["title"])
    stored_filename = "#{clip_id}-#{safe_title}#{extension}"
    absolute_path = Path.join(storage_dir(), stored_filename)

    with :ok <- File.cp(upload.path, absolute_path),
         {:ok, %File.Stat{size: size_bytes}} <- File.stat(absolute_path) do
      {:ok,
       %{
         id: clip_id,
         title: params["title"] || "Captured Clip",
         source: params["source"] || "camera",
         duration_seconds: parse_duration(params["duration_seconds"]),
         created_at: params["created_at"] || DateTime.utc_now() |> DateTime.to_iso8601(),
         size_bytes: size_bytes,
         saved_at: DateTime.utc_now() |> DateTime.to_iso8601(),
         url: "/uploads/media_clips/#{stored_filename}"
       }}
    end
  end

  defp storage_dir do
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

  defp sanitize_title(nil), do: "captured-clip"

  defp sanitize_title(title) do
    title
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "-")
    |> String.trim("-")
    |> case do
      "" -> "captured-clip"
      value -> value
    end
  end

  defp normalize_extension("", "video/mp4"), do: ".mp4"
  defp normalize_extension("", _), do: ".webm"
  defp normalize_extension(extension, _content_type), do: extension

  defp parse_duration(value) when is_integer(value), do: value

  defp parse_duration(value) when is_binary(value) do
    case Integer.parse(value) do
      {parsed, _rest} -> parsed
      :error -> 0
    end
  end

  defp parse_duration(_value), do: 0
end
