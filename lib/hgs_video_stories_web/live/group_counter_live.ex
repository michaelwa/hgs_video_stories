defmodule HgsVideoStoriesWeb.GroupCounterLive do
  use HgsVideoStoriesWeb, :live_view

  alias HgsVideoStories.LiveGroupCounter

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(HgsVideoStories.PubSub, LiveGroupCounter.topic())
    end

    snapshot = LiveGroupCounter.snapshot()
    user_id = "lv-" <> Integer.to_string(System.unique_integer([:positive]))

    socket =
      socket
      |> assign(
        current_scope: nil,
        user_id: user_id,
        joined: false,
        name: "",
        user_count: snapshot.user_count,
        collective_count: snapshot.collective_count,
        users: snapshot.users,
        activity_log: snapshot.activity_log,
        local_count: 0
      )
      |> assign_form(%{"name" => ""})

    {:ok, socket}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash} current_scope={@current_scope}>
      <section class="w-full overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 shadow-[0_25px_70px_-35px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        <div class="flex flex-col gap-8">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs uppercase tracking-[0.35em] text-white/60">
                Phoenix LiveView Proof of Concept
              </p>
              <h1 class="mt-3 text-4xl font-semibold leading-tight text-white">
                LiveView Group Counter
              </h1>
              <p class="mt-3 max-w-xl text-base text-white/70">
                Same behavior as the Hologram group counter, implemented as pure LiveView + PubSub.
              </p>
            </div>
          </div>

          <div class="grid gap-4 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/80">
            <div class="flex items-center gap-3">
              <div class="h-px w-8 bg-white/20" />
              <div class="space-y-1">
                <p class="text-[11px] uppercase tracking-[0.35em] text-white/60">Group</p>
                <p class="text-sm font-semibold text-white">Real-time group counter</p>
                <p class="text-[11px] text-white/60">
                  Join with your name to sync clicks over Phoenix Channels.
                </p>
              </div>
            </div>

            <%= if not @joined do %>
              <.form
                for={@form}
                id="lv-group-counter-join-form"
                phx-submit="join"
                class="flex flex-wrap gap-3"
              >
                <.input
                  id="lv-group-counter-name"
                  field={@form[:name]}
                  type="text"
                  placeholder="Your name"
                  class="min-w-52 flex-1 rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-cyan-400/80 focus:outline-none"
                  required
                />
                <button
                  id="lv-group-counter-join-button"
                  type="submit"
                  class="rounded-lg border border-indigo-400/30 bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5"
                >
                  Join Group
                </button>
              </.form>
            <% end %>

            <%= if @joined do %>
              <div class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2">
                <p class="text-sm text-white/80">
                  Joined as <span class="font-semibold text-white">{@name}</span>
                </p>
                <button
                  id="lv-group-counter-leave-button"
                  phx-click="leave"
                  class="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/35 hover:text-white"
                >
                  Leave Group
                </button>
              </div>

              <div class="flex items-center gap-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/0 p-6 shadow-xl shadow-black/30 backdrop-blur">
                <button
                  id="lv-counter-down"
                  phx-click="decrement"
                  class="group relative overflow-hidden rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:-translate-y-0.5 hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  Down
                </button>
                <div class="text-center">
                  <div
                    id="lv-client-count-value"
                    class="text-5xl font-semibold tabular-nums tracking-tight text-white drop-shadow-sm"
                  >
                    {@local_count}
                  </div>
                  <div class="mt-2 text-[11px] uppercase tracking-[0.35em] text-white/60">Count</div>
                </div>
                <button
                  id="lv-counter-up"
                  phx-click="increment"
                  class="group relative overflow-hidden rounded-xl border border-indigo-400/30 bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  Up
                </button>
              </div>
            <% end %>

            <div id="lv-group-counter-panel" class="space-y-4">
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                  <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">Users Joined</p>
                  <p
                    id="lv-group-user-count"
                    class="mt-2 text-2xl font-semibold text-white tabular-nums"
                  >
                    {@user_count}
                  </p>
                </div>
                <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                  <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">
                    Collective Click Count
                  </p>
                  <p
                    id="lv-group-collective-count"
                    class="mt-2 text-2xl font-semibold text-white tabular-nums"
                  >
                    {@collective_count}
                  </p>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                  <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">Users</p>
                  <ul id="lv-group-users-list" class="mt-2 space-y-1 text-sm text-white/90">
                    <%= if @user_count == 0 do %>
                      <li class="text-white/50">No users yet</li>
                    <% else %>
                      <%= for user <- @users do %>
                        <li>{user.name}: <span class="tabular-nums">{user.count}</span></li>
                      <% end %>
                    <% end %>
                  </ul>
                </div>

                <div class="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                  <p class="text-[11px] uppercase tracking-[0.3em] text-white/60">Activity Log</p>
                  <ul
                    id="lv-group-activity-log"
                    class="mt-2 max-h-36 space-y-1 overflow-auto text-sm text-white/90"
                  >
                    <%= if Enum.empty?(@activity_log) do %>
                      <li class="text-white/50">No actions yet</li>
                    <% else %>
                      <%= for entry <- @activity_log do %>
                        <li>{entry}</li>
                      <% end %>
                    <% end %>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layouts.app>
    """
  end

  @impl true
  def handle_event("join", %{"group" => %{"name" => raw_name}}, socket) do
    name = String.trim(raw_name)

    if name == "" do
      {:noreply, socket}
    else
      snapshot = LiveGroupCounter.join(socket.assigns.user_id, name, socket.assigns.local_count)

      {:noreply,
       socket
       |> assign(joined: true, name: name)
       |> assign_form(%{"name" => name})
       |> apply_snapshot(snapshot)}
    end
  end

  def handle_event("increment", _params, %{assigns: %{joined: true}} = socket) do
    next_count = socket.assigns.local_count + 1
    snapshot = LiveGroupCounter.save_count(socket.assigns.user_id, next_count, "up")

    {:noreply,
     socket
     |> assign(:local_count, next_count)
     |> apply_snapshot(snapshot)}
  end

  def handle_event("decrement", _params, %{assigns: %{joined: true}} = socket) do
    next_count = socket.assigns.local_count - 1
    snapshot = LiveGroupCounter.save_count(socket.assigns.user_id, next_count, "down")

    {:noreply,
     socket
     |> assign(:local_count, next_count)
     |> apply_snapshot(snapshot)}
  end

  def handle_event("leave", _params, socket) do
    snapshot =
      if socket.assigns.joined do
        LiveGroupCounter.leave(socket.assigns.user_id)
      else
        LiveGroupCounter.snapshot()
      end

    {:noreply,
     socket
     |> assign(joined: false, name: "", local_count: 0)
     |> assign_form(%{"name" => ""})
     |> apply_snapshot(snapshot)}
  end

  @impl true
  def handle_info({:live_group_counter_updated, snapshot}, socket) do
    local_count =
      user_count_for_snapshot(snapshot, socket.assigns.user_id, socket.assigns.local_count)

    {:noreply, socket |> assign(:local_count, local_count) |> apply_snapshot(snapshot)}
  end

  @impl true
  def terminate(_reason, socket) do
    if socket.assigns[:joined] do
      LiveGroupCounter.leave(socket.assigns.user_id)
    end

    :ok
  end

  defp assign_form(socket, params) do
    assign(socket, :form, to_form(params, as: :group))
  end

  defp apply_snapshot(socket, snapshot) do
    assign(socket,
      user_count: snapshot.user_count,
      collective_count: snapshot.collective_count,
      users: snapshot.users,
      activity_log: snapshot.activity_log
    )
  end

  defp user_count_for_snapshot(snapshot, user_id, default_count) do
    case Enum.find(snapshot.users, fn user -> user.id == user_id end) do
      nil -> default_count
      user -> user.count
    end
  end
end
