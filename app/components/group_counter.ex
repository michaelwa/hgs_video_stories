defmodule HgsVideoStories.Hologram.Components.GroupCounter do
  use Hologram.Component

  alias HgsVideoStories.GroupCounter, as: GroupCounterStore
  alias Hologram.Server

  @impl Component
  def init(_props, component, server) do
    saved_name = Server.get_session(server, :group_counter_name, "")
    saved_user_id = Server.get_session(server, :group_counter_user_id)

    snapshot = GroupCounterStore.snapshot()
    joined? = saved_user_id && Enum.any?(snapshot.users, fn user -> user.id == saved_user_id end)

    server =
      if saved_user_id && !joined? do
        server
        |> Server.delete_session(:group_counter_user_id)
        |> Server.delete_session(:group_counter_name)
      else
        server
      end

    component =
      component
      |> put_state(
        joined: !!joined?,
        name: if(joined?, do: saved_name, else: ""),
        join_error: nil,
        user_count: snapshot.user_count,
        collective_count: snapshot.collective_count,
        users: snapshot.users,
        activity_log: snapshot.activity_log
      )

    {component, server}
  end

  @impl Component
  def template do
    ~HOLO"""
    <div
      id="group-counter-root"
      class="grid gap-4 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/80"
    >
      <div class="flex items-center gap-3">
        <div class="h-px w-8 bg-white/20" />
        <div class="space-y-1">
          <p class="text-[11px] uppercase tracking-[0.35em] text-white/60">Group</p>
          <p class="text-sm font-semibold text-white">Real-time group counter</p>
          <p class="text-[11px] text-white/60">Join with your name to sync clicks over Phoenix Channels.</p>
        </div>
      </div>

      <button id="group-counter-refresh-trigger" class="hidden" $click={:refresh_group_from_server}>
        Refresh
      </button>

      {%if !@joined}
        <form id="group-counter-join-form" class="flex flex-wrap gap-3" $submit={:submit_join}>
          <input
            id="group-counter-name"
            name="name"
            type="text"
            value={@name}
            placeholder="Your name"
            class="min-w-52 flex-1 rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-cyan-400/80 focus:outline-none"
            $change={:set_name}
            required
          />
          <button
            id="group-counter-join-button"
            type="submit"
            class="rounded-lg border border-indigo-400/30 bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          >
            Join Group
          </button>
        </form>
      {/if}

      {%if @join_error}
        <div id="group-counter-error" class="rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-[11px] text-rose-100">
          {@join_error}
        </div>
      {/if}

      {%if @joined}
        <div class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2">
          <p class="text-sm text-white/80">
            Joined as <span class="font-semibold text-white">{@name}</span>
          </p>
          <button
            id="group-counter-leave-button"
            class="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/35 hover:text-white"
            $click={:leave_group}
          >
            Leave Group
          </button>
        </div>

        <div id="group-counter-panel" class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">Users Joined</p>
            <p id="group-user-count" class="mt-2 text-2xl font-semibold text-white tabular-nums">{@user_count}</p>
          </div>
          <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">Collective Click Count</p>
            <p id="group-collective-count" class="mt-2 text-2xl font-semibold text-white tabular-nums">{@collective_count}</p>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">Users</p>
            <ul id="group-users-list" class="mt-2 space-y-1 text-sm text-white/90">
              {%if @user_count == 0}
                <li class="text-white/50">No users yet</li>
              {%else}
                {%for user <- @users}
                  <li>
                    {user.name}: <span class="tabular-nums">{user.count}</span>
                  </li>
                {/for}
              {/if}
            </ul>
          </div>

          <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">Activity Log</p>
            <ul id="group-activity-log" class="mt-2 max-h-36 space-y-1 overflow-auto text-sm text-white/90">
              {%if Enum.empty?(@activity_log)}
                <li class="text-white/50">No actions yet</li>
              {%else}
                {%for entry <- @activity_log}
                  <li>{entry}</li>
                {/for}
              {/if}
            </ul>
          </div>
        </div>
      </div>
      {/if}
    </div>
    """
  end

  def action(:set_name, %{event: %{value: value}}, component) do
    put_state(component, :name, value)
  end

  def action(:submit_join, _params, component) do
    name = component.state.name |> to_string() |> String.trim()

    if name == "" do
      put_state(component, :join_error, "Please enter your name to join.")
    else
      component
      |> put_state(name: name, join_error: nil)
      |> put_command(:join_group, name: name)
    end
  end

  def action(:sync_group_snapshot, %{snapshot: snapshot}, component) do
    apply_snapshot(component, snapshot)
  end

  def action(:join_group_success, %{snapshot: snapshot, name: name}, component) do
    component
    |> put_state(joined: true, name: name, join_error: nil)
    |> apply_snapshot(snapshot)
  end

  def action(:leave_group, _params, component) do
    put_command(component, :leave_group)
  end

  def action(:leave_group_success, %{snapshot: snapshot}, component) do
    component
    |> put_state(joined: false, join_error: nil)
    |> apply_snapshot(snapshot)
  end

  def action(:refresh_group_from_server, _params, component) do
    put_command(component, :fetch_group_snapshot)
  end

  def command(:join_group, %{name: name}, server) do
    user_id = Server.get_session(server, :group_counter_user_id) || "user-" <> Integer.to_string(System.unique_integer([:positive]))
    initial_count = Server.get_session(server, :last_count, 0)

    snapshot = GroupCounterStore.join(user_id, name, initial_count)

    server
    |> Server.put_session(:group_counter_user_id, user_id)
    |> Server.put_session(:group_counter_name, name)
    |> put_action(:join_group_success, snapshot: snapshot, name: name)
  end

  def command(:leave_group, _params, server) do
    snapshot =
      case Server.get_session(server, :group_counter_user_id) do
        nil -> GroupCounterStore.snapshot()
        user_id -> GroupCounterStore.leave(user_id)
      end

    server
    |> Server.delete_session(:group_counter_user_id)
    |> Server.delete_session(:group_counter_name)
    |> put_action(:leave_group_success, snapshot: snapshot)
  end

  def command(:fetch_group_snapshot, _params, server) do
    snapshot = GroupCounterStore.snapshot()
    put_action(server, :sync_group_snapshot, snapshot: snapshot)
  end

  defp apply_snapshot(component, snapshot) do
    put_state(
      component,
      user_count: snapshot.user_count,
      collective_count: snapshot.collective_count,
      users: snapshot.users,
      activity_log: snapshot.activity_log
    )
  end
end
