defmodule HgsVideoStories.Hologram.Components.Counter do
  use Hologram.Component

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
    |> put_command(:save_count, count: next_count)
  end

  def action(:decrement, _params, component) do
    next_count = component.state.count - 1

    component
    |> put_state(:count, next_count)
    |> put_command(:save_count, count: next_count)
  end

  def action(:sync_server_count, %{count: count}, component) do
    put_state(component, :server_count, count)
  end

  def command(:save_count, params, server) do
    count = params[:count] || params["count"] || 0
    updated_count = ServerCounter.set(count)

    IO.puts("save_count::#{count}")
    put_action(server, :sync_server_count, count: updated_count)
  end
end
