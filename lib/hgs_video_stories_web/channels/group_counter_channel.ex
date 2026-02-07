defmodule HgsVideoStoriesWeb.GroupCounterChannel do
  use Phoenix.Channel

  alias HgsVideoStories.GroupCounter
  alias HgsVideoStoriesWeb.Endpoint

  @impl true
  def join("group_counter:lobby", params, socket) do
    with {:ok, user_id} <- fetch_user_id(params),
         {:ok, name} <- fetch_name(params),
         {:ok, initial_count} <- fetch_count(params["initial_count"]) do
      snapshot = GroupCounter.join(user_id, name, initial_count)

      Endpoint.broadcast(GroupCounter.topic(), "group_snapshot", %{snapshot: snapshot})

      socket =
        socket
        |> assign(:user_id, user_id)
        |> assign(:name, name)

      {:ok, %{snapshot: snapshot, user_id: user_id}, socket}
    else
      _error -> {:error, %{reason: "invalid_join_params"}}
    end
  end

  @impl true
  def handle_in("save_count", %{"count" => count, "action" => action}, socket) do
    with {:ok, parsed_count} <- fetch_count(count),
         {:ok, parsed_action} <- fetch_action(action) do
      snapshot = GroupCounter.save_count(socket.assigns.user_id, parsed_count, parsed_action)

      Endpoint.broadcast(GroupCounter.topic(), "group_snapshot", %{snapshot: snapshot})

      {:reply, :ok, socket}
    else
      _error -> {:reply, {:error, %{reason: "invalid_count_payload"}}, socket}
    end
  end

  @impl true
  def terminate(_reason, socket) do
    if user_id = socket.assigns[:user_id] do
      snapshot = GroupCounter.leave(user_id)
      Endpoint.broadcast(GroupCounter.topic(), "group_snapshot", %{snapshot: snapshot})
    end

    :ok
  end

  defp fetch_user_id(%{"user_id" => user_id}) when is_binary(user_id) do
    if String.trim(user_id) == "", do: :error, else: {:ok, user_id}
  end

  defp fetch_user_id(_params), do: :error

  defp fetch_name(%{"name" => name}) when is_binary(name) do
    trimmed_name = String.trim(name)
    if trimmed_name == "", do: :error, else: {:ok, trimmed_name}
  end

  defp fetch_name(_params), do: :error

  defp fetch_count(count) when is_integer(count), do: {:ok, count}

  defp fetch_count(count) when is_binary(count) do
    case Integer.parse(count) do
      {parsed_count, ""} -> {:ok, parsed_count}
      _error -> :error
    end
  end

  defp fetch_count(_count), do: :error

  defp fetch_action(action) when action in ["up", "down"], do: {:ok, action}
  defp fetch_action(_action), do: :error
end
