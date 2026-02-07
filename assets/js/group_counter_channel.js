import {Socket} from "phoenix"

const TOPIC = "group_counter:lobby"
const TAB_STORAGE_KEY = "group_counter_user_id"
const NAME_STORAGE_KEY = "group_counter_name"

let socket = null
let channel = null
let state = {
  joined: false,
  joining: false,
  snapshot: null,
}

function findRoot() {
  return document.querySelector("#group-counter-root")
}

function findInteger(selector) {
  const raw = document.querySelector(selector)?.textContent?.trim() || "0"
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function renderPanel(root) {
  if (!root) return

  const joinForm = root.querySelector("#group-counter-join-form")
  const panel = root.querySelector("#group-counter-panel")
  const usersList = root.querySelector("#group-users-list")
  const activityLog = root.querySelector("#group-activity-log")
  const userCount = root.querySelector("#group-user-count")
  const collectiveCount = root.querySelector("#group-collective-count")

  if (!joinForm || !panel || !usersList || !activityLog || !userCount || !collectiveCount) {
    return
  }

  if (!state.joined || !state.snapshot) {
    joinForm.classList.remove("hidden")
    panel.classList.add("hidden")
    return
  }

  joinForm.classList.add("hidden")
  panel.classList.remove("hidden")

  userCount.textContent = String(state.snapshot.user_count ?? 0)
  collectiveCount.textContent = String(state.snapshot.collective_count ?? 0)

  const users = state.snapshot.users || []
  usersList.innerHTML = users.length === 0
    ? "<li class=\"text-white/50\">No users yet</li>"
    : users.map((user) => `<li>${user.name}: <span class="tabular-nums">${user.count}</span></li>`).join("")

  const logs = state.snapshot.activity_log || []
  activityLog.innerHTML = logs.length === 0
    ? "<li class=\"text-white/50\">No actions yet</li>"
    : logs.map((entry) => `<li>${entry}</li>`).join("")
}

function setError(message) {
  const errorNode = document.querySelector("#group-counter-error")
  if (!errorNode) return

  if (!message) {
    errorNode.classList.add("hidden")
    errorNode.textContent = ""
    return
  }

  errorNode.classList.remove("hidden")
  errorNode.textContent = message
}

function ensureSocket() {
  if (socket) return socket

  socket = new Socket("/socket", {})
  socket.connect()
  return socket
}

function getUserId() {
  let userId = sessionStorage.getItem(TAB_STORAGE_KEY)

  if (!userId) {
    userId = crypto.randomUUID()
    sessionStorage.setItem(TAB_STORAGE_KEY, userId)
  }

  return userId
}

function joinGroup(name) {
  const root = findRoot()
  if (!root || state.joining) return

  const currentServerCount = findInteger("#server-count-value")

  if (channel) {
    channel.leave()
    channel = null
  }

  state = {...state, joining: true}

  const groupSocket = ensureSocket()
  const nextChannel = groupSocket.channel(TOPIC, {
    user_id: getUserId(),
    name,
    initial_count: currentServerCount,
  })

  nextChannel.on("group_snapshot", ({snapshot}) => {
    state = {...state, snapshot}
    renderPanel(findRoot())
  })

  nextChannel.join()
    .receive("ok", ({snapshot}) => {
      channel = nextChannel
      state = {joined: true, joining: false, snapshot}
      sessionStorage.setItem(NAME_STORAGE_KEY, name)
      setError("")
      renderPanel(findRoot())
    })
    .receive("error", () => {
      state = {...state, joining: false}
      setError("Unable to join the group right now.")
    })
}

function sendCountUpdate(action) {
  if (!state.joined || !channel) return

  window.requestAnimationFrame(() => {
    const count = findInteger("#client-count-value")
    channel.push("save_count", {count, action})
  })
}

export function initGroupCounterChannel() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("#group-counter-join-form")
    if (!form) return

    event.preventDefault()

    const nameInput = document.querySelector("#group-counter-name")
    const name = nameInput?.value?.trim()

    if (!name) {
      setError("Please enter your name to join.")
      return
    }

    joinGroup(name)
  })

  document.addEventListener("click", (event) => {
    const upButton = event.target.closest("#counter-up")
    if (upButton) {
      sendCountUpdate("up")
      return
    }

    const downButton = event.target.closest("#counter-down")
    if (downButton) {
      sendCountUpdate("down")
    }
  })

  renderPanel(findRoot())

  const savedName = sessionStorage.getItem(NAME_STORAGE_KEY)?.trim()
  if (savedName) {
    const nameInput = document.querySelector("#group-counter-name")
    if (nameInput) {
      nameInput.value = savedName
    }

    joinGroup(savedName)
  }
}
