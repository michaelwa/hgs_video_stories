defmodule HgsVideoStoriesWeb.Router do
  use HgsVideoStoriesWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {HgsVideoStoriesWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", HgsVideoStoriesWeb do
    pipe_through :browser

    get "/", PageController, :home
    live "/record", RecordStudioLive
    live "/media", MediaLibraryLive
    live "/counter_live_group", GroupCounterLive
  end

  scope "/api", HgsVideoStoriesWeb do
    pipe_through :api

    get "/server_count", ServerCountController, :show
    post "/server_count/increment", ServerCountController, :increment
    post "/server_count/decrement", ServerCountController, :decrement
    get "/media_clips/timeline_transcriptions", TimelineTranscriptionController, :index

    get "/media_clips/:media_id/timeline_transcription/export",
        TimelineTranscriptionController,
        :export

    get "/media_clips/:media_id/timeline_transcription", TimelineTranscriptionController, :show
    post "/media_clips/:media_id/timeline_transcription", TimelineTranscriptionController, :create
    post "/media_clips", MediaClipController, :create
    post "/realtime/sessions", RealtimeSessionController, :create
  end

  # Enable LiveDashboard and Swoosh mailbox preview in development
  if Application.compile_env(:hgs_video_stories, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: HgsVideoStoriesWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
