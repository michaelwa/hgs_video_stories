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
      <section class="w-full overflow-hidden rounded-3xl border border-base-300 bg-base-200/50 p-10 shadow-xl backdrop-blur-xl">
        <div class="flex flex-col gap-8">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs uppercase tracking-[0.35em] text-base-content/60">
                Phoenix LiveView Proof of Concept
              </p>
              <h1 class="mt-3 text-4xl font-semibold leading-tight text-base-content">
                LiveView Group Counter
              </h1>
              <p class="mt-3 max-w-xl text-base text-base-content/70">
                Group counter implemented as pure LiveView + PubSub.
              </p>
            </div>
          </div>

          <div class="grid gap-4 rounded-xl border border-base-300 bg-base-100/70 p-4 text-xs text-base-content/80">
            <div class="flex items-center gap-3">
              <div class="h-px w-8 bg-base-content/20" />
              <div class="space-y-1">
                <p class="text-[11px] uppercase tracking-[0.35em] text-base-content/60">Group</p>
                <p class="text-sm font-semibold text-base-content">Real-time group counter</p>
                <p class="text-[11px] text-base-content/60">
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
                  class="min-w-52 flex-1 rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm text-base-content placeholder:text-base-content/45 focus:border-primary/60 focus:outline-none"
                  required
                />
                <button
                  id="lv-group-counter-join-button"
                  type="submit"
                  class="rounded-lg border border-primary/30 bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:-translate-y-0.5 hover:brightness-105"
                >
                  Join Group
                </button>
              </.form>
            <% end %>

            <%= if @joined do %>
              <div class="flex items-center justify-between gap-3 rounded-lg border border-base-300 bg-base-100/80 px-3 py-2">
                <p class="text-sm text-base-content/80">
                  Joined as <span class="font-semibold text-base-content">{@name}</span>
                </p>
                <button
                  id="lv-group-counter-leave-button"
                  phx-click="leave"
                  class="rounded-lg border border-base-300 bg-base-200 px-3 py-1.5 text-xs font-semibold text-base-content/80 transition hover:border-base-content/30 hover:text-base-content"
                >
                  Leave Group
                </button>
              </div>

              <div class="flex items-center gap-6 rounded-2xl border border-base-300 bg-gradient-to-br from-base-200 via-base-100/90 to-base-100/60 p-6 shadow-lg">
                <button
                  id="lv-counter-down"
                  phx-click="decrement"
                  class="group relative overflow-hidden rounded-xl border border-base-300 bg-base-200 px-5 py-3 text-sm font-semibold text-base-content/85 transition hover:-translate-y-0.5 hover:border-base-content/30 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100"
                >
                  Down
                </button>
                <div class="text-center">
                  <div
                    id="lv-client-count-value"
                    class="text-5xl font-semibold tabular-nums tracking-tight text-base-content"
                  >
                    {@local_count}
                  </div>
                  <div class="mt-2 text-[11px] uppercase tracking-[0.35em] text-base-content/60">
                    Count
                  </div>
                </div>
                <button
                  id="lv-counter-up"
                  phx-click="increment"
                  class="group relative overflow-hidden rounded-xl border border-primary/40 bg-primary px-5 py-3 text-sm font-semibold text-primary-content shadow transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100"
                >
                  Up
                </button>
              </div>
            <% end %>

            <div id="lv-group-counter-panel" class="space-y-4">
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-lg border border-base-300 bg-base-100/90 p-3">
                  <p class="text-[11px] uppercase tracking-[0.3em] text-base-content/60">
                    Users Joined
                  </p>
                  <p
                    id="lv-group-user-count"
                    class="mt-2 text-2xl font-semibold text-base-content tabular-nums"
                  >
                    {@user_count}
                  </p>
                </div>
                <div class="rounded-lg border border-base-300 bg-base-100/90 p-3">
                  <p class="text-[11px] uppercase tracking-[0.3em] text-base-content/60">
                    Collective Click Count
                  </p>
                  <p
                    id="lv-group-collective-count"
                    class="mt-2 text-2xl font-semibold text-base-content tabular-nums"
                  >
                    {@collective_count}
                  </p>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-lg border border-base-300 bg-base-100/90 p-3">
                  <p class="text-[11px] uppercase tracking-[0.3em] text-base-content/60">Users</p>
                  <ul id="lv-group-users-list" class="mt-2 space-y-1 text-sm text-base-content/90">
                    <%= if @user_count == 0 do %>
                      <li class="text-base-content/50">No users yet</li>
                    <% else %>
                      <%= for user <- @users do %>
                        <li>{user.name}: <span class="tabular-nums">{user.count}</span></li>
                      <% end %>
                    <% end %>
                  </ul>
                </div>

                <div class="rounded-lg border border-base-300 bg-base-100/90 p-3">
                  <p class="text-[11px] uppercase tracking-[0.3em] text-base-content/60">
                    Activity Log
                  </p>
                  <ul
                    id="lv-group-activity-log"
                    class="mt-2 max-h-36 space-y-1 overflow-auto text-sm text-base-content/90"
                  >
                    <%= if Enum.empty?(@activity_log) do %>
                      <li class="text-base-content/50">No actions yet</li>
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
