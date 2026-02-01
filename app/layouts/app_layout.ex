defmodule HgsVideoStories.Hologram.Layouts.AppLayout do
  use Hologram.Component

  alias Hologram.UI.Runtime

  @impl Component
  def template do
    ~HOLO"""
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Hologram Counter</title>
        <link rel="stylesheet" href={asset_path("app.css")} />
      </head>
      <body class="min-h-screen bg-slate-950 text-slate-50">
        <main class="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-8">
          <slot />
        </main>
        <Runtime />
      </body>
    </html>
    """
  end
end
