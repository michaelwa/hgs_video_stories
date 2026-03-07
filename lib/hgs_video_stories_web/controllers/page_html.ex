defmodule HgsVideoStoriesWeb.PageHTML do
  @moduledoc """
  This module contains pages rendered by PageController.

  See the `page_html` directory for all templates available.
  """
  use HgsVideoStoriesWeb, :html

  attr :active_tab, :string, required: true

  def studio_header(assigns) do
    ~H"""
    <header class="relative z-50 border-b border-base-300/90 bg-base-100/90 backdrop-blur">
      <div class="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href={~p"/"} id="app-logo" class="inline-flex items-center gap-3">
          <img src={~p"/images/logo.svg"} width="32" alt="HGS Video Stories logo" />
          <span class="text-sm font-semibold tracking-[0.2em]">HGS VIDEO STORIES</span>
        </a>

        <div class="hidden items-center gap-3 md:flex">
          <div class="tabs tabs-box w-fit bg-base-100 p-1 text-sm shadow-sm">
            <a
              href={~p"/media"}
              class={["tab text-base-content", @active_tab == "media" && "tab-active"]}
            >
              Media Library
            </a>
            <a
              href={~p"/record"}
              class={["tab text-base-content", @active_tab == "record" && "tab-active"]}
            >
              Recording
            </a>
          </div>
          <details id="desktop-profile-menu" class="dropdown dropdown-end">
            <summary class="btn btn-ghost gap-3 rounded-full px-2 normal-case">
              <img
                src={~p"/images/avatar-placeholder.svg"}
                alt="Profile photo"
                class="size-9 rounded-full object-cover"
              />
              <span class="text-sm font-medium">Jordan Lee</span>
              <.icon name="hero-chevron-down-mini" class="size-4 opacity-70" />
            </summary>
            <ul class="menu dropdown-content z-50 mt-3 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl">
              <li><a href="#">Account settings</a></li>
              <li><a href="#">Billing</a></li>
              <li><a href="#">Sign out</a></li>
            </ul>
          </details>
        </div>

        <div class="md:hidden">
          <details id="mobile-profile-menu" class="dropdown dropdown-end">
            <summary class="btn btn-ghost btn-circle" aria-label="Open account menu">
              <.icon name="hero-bars-3" class="size-6" />
            </summary>
            <ul class="menu dropdown-content z-50 mt-3 w-64 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl">
              <li class="menu-title px-2 py-1">
                <span class="flex items-center gap-2">
                  <img
                    src={~p"/images/avatar-placeholder.svg"}
                    alt="Profile photo"
                    class="size-7 rounded-full object-cover"
                  />
                  <span>Jordan Lee</span>
                </span>
              </li>
              <li><a href="#">Account settings</a></li>
              <li><a href="#">Billing</a></li>
              <li><a href="#">Sign out</a></li>
            </ul>
          </details>
        </div>
      </div>
      <div class="border-t border-base-300/80 px-4 py-1 md:hidden">
        <div class="tabs tabs-box w-full bg-base-100 p-0.5 text-sm shadow-sm [&_.tab]:min-h-7 [&_.tab]:text-xs">
          <a
            href={~p"/media"}
            class={["tab flex-1 text-base-content", @active_tab == "media" && "tab-active"]}
          >
            Media
          </a>
          <a
            href={~p"/record"}
            class={["tab flex-1 text-base-content", @active_tab == "record" && "tab-active"]}
          >
            Record
          </a>
        </div>
      </div>
    </header>
    """
  end

  embed_templates "page_html/*"
end
