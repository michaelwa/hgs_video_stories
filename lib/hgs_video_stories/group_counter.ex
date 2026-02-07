defmodule HgsVideoStories.GroupCounter do
  @moduledoc false

  use GenServer

  @topic "group_counter:lobby"
  @max_log_entries 40

  @type snapshot :: %{
          user_count: non_neg_integer(),
          collective_count: integer(),
          users: list(%{id: String.t(), name: String.t(), count: integer()}),
          activity_log: list(String.t())
        }

  @spec start_link(any()) :: GenServer.on_start()
  def start_link(_opts) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  @spec join(String.t(), String.t(), integer()) :: snapshot()
  def join(user_id, name, initial_count) do
    GenServer.call(__MODULE__, {:join, user_id, name, initial_count})
  end

  @spec save_count(String.t(), integer(), String.t()) :: snapshot()
  def save_count(user_id, count, action) do
    GenServer.call(__MODULE__, {:save_count, user_id, count, action})
  end

  @spec leave(String.t()) :: snapshot()
  def leave(user_id) do
    GenServer.call(__MODULE__, {:leave, user_id})
  end

  @spec snapshot() :: snapshot()
  def snapshot do
    GenServer.call(__MODULE__, :snapshot)
  end

  @spec topic() :: String.t()
  def topic, do: @topic

  @impl GenServer
  def init(_init_arg) do
    {:ok, %{users: %{}, collective_count: 0, activity_log: []}}
  end

  @impl GenServer
  def handle_call({:join, user_id, name, initial_count}, _from, state) do
    existing_user = Map.get(state.users, user_id)
    previous_count = if existing_user, do: existing_user.count, else: 0
    count_delta = initial_count - previous_count

    users = Map.put(state.users, user_id, %{id: user_id, name: name, count: initial_count})
    collective_count = state.collective_count + count_delta
    activity_log = prepend_log(state.activity_log, "#{name} joined with count #{initial_count}")

    new_state = %{
      state
      | users: users,
        collective_count: collective_count,
        activity_log: activity_log
    }

    {:reply, snapshot(new_state), new_state}
  end

  def handle_call({:save_count, user_id, new_count, action}, _from, state) do
    case Map.get(state.users, user_id) do
      nil ->
        {:reply, snapshot(state), state}

      user ->
        delta = new_count - user.count
        users = Map.put(state.users, user_id, %{user | count: new_count})
        collective_count = state.collective_count + delta

        activity_log =
          prepend_log(
            state.activity_log,
            "#{user.name} clicked #{action} (#{user.count} -> #{new_count})"
          )

        new_state = %{
          state
          | users: users,
            collective_count: collective_count,
            activity_log: activity_log
        }

        {:reply, snapshot(new_state), new_state}
    end
  end

  def handle_call({:leave, user_id}, _from, state) do
    case Map.pop(state.users, user_id) do
      {nil, _users} ->
        {:reply, snapshot(state), state}

      {user, users} ->
        collective_count = state.collective_count - user.count
        activity_log = prepend_log(state.activity_log, "#{user.name} left the group")

        new_state = %{
          state
          | users: users,
            collective_count: collective_count,
            activity_log: activity_log
        }

        {:reply, snapshot(new_state), new_state}
    end
  end

  def handle_call(:snapshot, _from, state) do
    {:reply, snapshot(state), state}
  end

  defp prepend_log(logs, message) do
    timestamp = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
    ["[#{timestamp}] #{message}" | logs] |> Enum.take(@max_log_entries)
  end

  defp snapshot(state) do
    users =
      state.users
      |> Map.values()
      |> Enum.sort_by(&String.downcase(&1.name))

    %{
      user_count: map_size(state.users),
      collective_count: state.collective_count,
      users: users,
      activity_log: state.activity_log
    }
  end
end
