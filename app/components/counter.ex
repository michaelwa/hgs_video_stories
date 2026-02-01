defmodule HgsVideoStories.Hologram.Components.Counter do
  use Hologram.Component

  @impl Component
  def init(_props, component, server) do
    {put_state(component, count: 0), server}
  end

  @impl Component
  def template do
    ~HOLO"""
    <div class="flex items-center gap-6 rounded-2xl bg-black/30 p-6">
      <button
        class="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
        $click={:decrement}
      >
        Down
      </button>

      <div class="text-center">
        <div class="text-4xl font-semibold tabular-nums">{@count}</div>
        <div class="text-xs uppercase tracking-[0.3em] text-white/60">Count</div>
      </div>

      <button
        class="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
        $click={:increment}
      >
        Up
      </button>
    </div>
    """
  end

  def action(:increment, _params, component) do
    put_state(component, :count, component.state.count + 1)
  end

  def action(:decrement, _params, component) do
    put_state(component, :count, component.state.count - 1)
  end
end
