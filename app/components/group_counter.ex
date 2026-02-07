defmodule HgsVideoStories.Hologram.Components.GroupCounter do
  use Hologram.Component

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

      <form id="group-counter-join-form" class="flex flex-wrap gap-3">
        <input
          id="group-counter-name"
          name="name"
          type="text"
          placeholder="Your name"
          class="min-w-52 flex-1 rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-cyan-400/80 focus:outline-none"
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

      <div id="group-counter-error" class="hidden rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-[11px] text-rose-100"></div>

      <div id="group-counter-panel" class="hidden space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">Users Joined</p>
            <p id="group-user-count" class="mt-2 text-2xl font-semibold text-white tabular-nums">0</p>
          </div>
          <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">Collective Click Count</p>
            <p id="group-collective-count" class="mt-2 text-2xl font-semibold text-white tabular-nums">0</p>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">Users</p>
            <ul id="group-users-list" class="mt-2 space-y-1 text-sm text-white/90">
              <li class="text-white/50">No users yet</li>
            </ul>
          </div>

          <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">Activity Log</p>
            <ul id="group-activity-log" class="mt-2 max-h-36 space-y-1 overflow-auto text-sm text-white/90">
              <li class="text-white/50">No actions yet</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
    """
  end
end
