defmodule HgsVideoStoriesWeb.GroupCounterChannel do
  use Phoenix.Channel

  alias HgsVideoStories.GroupCounter

  @impl true
  def join("group_counter:lobby", _params, socket) do
    Phoenix.PubSub.subscribe(HgsVideoStories.PubSub, GroupCounter.topic())
    {:ok, %{snapshot: GroupCounter.snapshot()}, socket}
  end

  @impl true
  def handle_info({:group_counter_updated, _snapshot}, socket) do
    push(socket, "group_counter_updated", %{})
    {:noreply, socket}
  end
end
