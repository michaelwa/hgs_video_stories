defmodule HgsVideoStories.Hologram.Layouts.AppLayout do
  use Hologram.Component

  alias Hologram.UI.Runtime

  prop :csrf_token, :string, from_context: {Hologram.Runtime, :csrf_token}

  @impl Component
  def template do
    ~HOLO"""
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="csrf-token" content={@csrf_token} />
        <title>Hologram Counter</title>
        <link rel="stylesheet" href={"#{asset_path("assets/css/app.css")}?v=2"} />
        <script defer src={"#{asset_path("assets/js/app.js")}?v=2"}></script>
      </head>
      <body class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 antialiased">
        <main class="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center p-6 sm:p-10">
          <slot />
        </main>
        <Runtime />
      </body>
    </html>
    """
  end
end
