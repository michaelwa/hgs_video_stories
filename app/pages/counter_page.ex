defmodule HgsVideoStories.Hologram.Pages.CounterPage do
  use Hologram.Page

  alias HgsVideoStories.Hologram.Components.Counter
  alias HgsVideoStories.Hologram.Layouts.AppLayout

  layout AppLayout
  route "/counter"

  @impl Page
  def template do
    ~HOLO"""
    <section class="w-full overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 shadow-[0_25px_70px_-35px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      <div class="flex flex-col gap-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-[0.35em] text-white/60">Hologram Proof of Concept</p>
            <h1 class="mt-3 text-4xl font-semibold leading-tight text-white">Counter</h1>
            <p class="mt-3 max-w-xl text-base text-white/70">
              A minimal stateful component with client-side interactions powered by Hologram.
            </p>
          </div>

          <div class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 shadow-inner shadow-white/5">
            <span class="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.2)]" />
            Live state sync
          </div>
        </div>

        <Counter cid="counter" />
      </div>
    </section>
    """
  end
end
