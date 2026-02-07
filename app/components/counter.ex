defmodule HgsVideoStories.Hologram.Components.Counter do
  use Hologram.Component

  alias Hologram.Server
  alias HgsVideoStories.GroupCounter, as: GroupCounterStore
  alias HgsVideoStories.ServerCounter
  alias HgsVideoStories.Hologram.Components.ServerCounterDisplay

  @impl Component
  def init(_props, component, server) do
    initial_count = ServerCounter.get()

    {put_state(component, count: initial_count, server_count: initial_count), server}
  end

  @impl Component
  def template do
    ~HOLO"""
    <div class="flex flex-col gap-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/0 p-6 shadow-xl shadow-black/30 backdrop-blur">
      <div class="flex items-center gap-6">
        <button
          id="counter-down"
          class="group relative overflow-hidden rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:-translate-y-0.5 hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          $click={:decrement}
        >
          <span class="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
          <span class="relative">Down</span>
        </button>

        <div class="text-center">
          <div id="client-count-value" class="text-5xl font-semibold tabular-nums tracking-tight text-white drop-shadow-sm">
            {@count}
          </div>
          <div class="mt-2 text-[11px] uppercase tracking-[0.35em] text-white/60">Count</div>
        </div>

        <button
          id="counter-up"
          class="group relative overflow-hidden rounded-xl border border-indigo-400/30 bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          $click={:increment}
        >
          <span class="absolute inset-0 opacity-0 transition group-hover:opacity-100">
            <span class="absolute inset-0 bg-white/10" />
          </span>
          <span class="relative">Up</span>
        </button>
      </div>

      <div class="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/80">
        <div class="flex items-center gap-3">
          <div class="h-px w-8 bg-white/20" />
          <div class="space-y-1">
            <p class="text-[11px] uppercase tracking-[0.35em] text-white/60">Client</p>
            <p class="text-sm font-semibold text-white">Client count: {@count}</p>
            <p class="text-[11px] text-white/60">Updated instantly in the component.</p>
          </div>
        </div>
      </div>

      <ServerCounterDisplay cid="server-counter-display" count={@server_count} />
    </div>
    """
  end

  def action(:increment, _params, component) do
    next_count = component.state.count + 1

    component
    |> put_state(:count, next_count)
    |> put_command(:save_count, count: next_count, action: "up")
  end

  def action(:decrement, _params, component) do
    next_count = component.state.count - 1

    component
    |> put_state(:count, next_count)
    |> put_command(:save_count, count: next_count, action: "down")
  end

  def action(:sync_after_save, params, component) do
    count = params[:count] || params["count"] || component.state.server_count
    snapshot = params[:group_snapshot] || params["group_snapshot"]

    component = put_state(component, :server_count, count)

    if is_nil(snapshot) do
      component
    else
      put_action(component, name: :sync_group_snapshot, params: [snapshot: snapshot], target: "group-counter")
    end
  end

  def action(:sync_server_count, %{count: count}, component) do
    component
    |> put_state(:server_count, count)
  end

  def command(:save_count, params, server) do
    count = params[:count] || params["count"] || 0
    action = params[:action] || params["action"] || "unknown"
    updated_count = ServerCounter.set(count)
    group_snapshot = maybe_update_group_counter(server, count, action)

    IO.puts("save_count::#{count}")

    server
    |> Server.put_session(:last_count, count)
    |> put_action(:sync_after_save, count: updated_count, group_snapshot: group_snapshot)
  end

  defp maybe_update_group_counter(server, count, action) do
    case Server.get_session(server, :group_counter_user_id) do
      nil -> nil
      user_id -> GroupCounterStore.save_count(user_id, count, action)
    end
  end
end
