defmodule HgsVideoStories.Hologram.Components.ServerCounterDisplay do
  use Hologram.Component

  prop :count, :integer

  @impl Component
  def template do
    ~HOLO"""
    <div class="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/80">
      <div class="flex items-center gap-3">
        <div class="h-px w-8 bg-white/20" />
        <div class="space-y-1">
          <p class="text-[11px] uppercase tracking-[0.35em] text-white/60">Server</p>
          <p class="text-sm font-semibold text-white">
            Server count: <span id="server-count-value">{@count}</span>
          </p>
          <p class="text-[11px] text-white/60">Updated after server round-trip.</p>
        </div>
      </div>
    </div>
    """
  end
end
