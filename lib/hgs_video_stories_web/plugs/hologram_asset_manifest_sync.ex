defmodule HgsVideoStoriesWeb.Plugs.HologramAssetManifestSync do
  @moduledoc false

  alias Hologram.Assets.ManifestCache
  alias Hologram.Assets.PathRegistry

  @runtime_static_path "hologram/runtime.js"

  def init(opts), do: opts

  def call(conn, _opts) do
    maybe_reload_hologram_assets()
    conn
  end

  defp maybe_reload_hologram_assets do
    if runtime_asset_stale?() do
      PathRegistry.reload()
      ManifestCache.reload()
    end
  end

  defp runtime_asset_stale? do
    case PathRegistry.lookup(@runtime_static_path) do
      {:ok, runtime_asset_path} ->
        runtime_file_path =
          Path.join(PathRegistry.static_dir(), String.trim_leading(runtime_asset_path, "/"))

        not File.exists?(runtime_file_path)

      :error ->
        true
    end
  end
end
