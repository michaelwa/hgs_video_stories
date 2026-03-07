defmodule HgsVideoStoriesWeb.ChannelCase do
  use ExUnit.CaseTemplate

  using do
    quote do
      import Phoenix.ChannelTest
      import HgsVideoStoriesWeb.ChannelCase

      @endpoint HgsVideoStoriesWeb.Endpoint
    end
  end

  setup tags do
    HgsVideoStories.DataCase.setup_sandbox(tags)
    :ok
  end
end
