defmodule HgsVideoStories.Hologram.Pages.CounterPage do
  use Hologram.Page

  alias HgsVideoStories.Hologram.Components.Counter
  alias HgsVideoStories.Hologram.Layouts.AppLayout

  layout AppLayout
  route "/counter"

  @impl Page
  def template do
    ~HOLO"""
    <div class="w-full rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl">
      <div class="flex flex-col gap-6">
        <div>
          <p class="text-sm uppercase tracking-[0.3em] text-white/60">Hologram Proof of Concept</p>
          <h1 class="mt-3 text-3xl font-semibold">Counter</h1>
          <p class="mt-2 text-white/70">Tap the buttons to update state in the component.</p>
        </div>

        <Counter cid="counter" />
      </div>
    </div>
    """
  end
end
