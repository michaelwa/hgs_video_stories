import {Socket} from "phoenix"

let socket = null
let channel = null

function refreshGroupCounter() {
  const trigger = document.querySelector("#group-counter-refresh-trigger")
  if (trigger) {
    trigger.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}))
  }
}

export function initGroupCounterSync() {
  if (channel) {
    return
  }

  socket = new Socket("/socket")
  socket.connect()

  channel = socket.channel("group_counter:lobby", {})

  channel.on("group_counter_updated", () => {
    refreshGroupCounter()
  })

  channel.join()
}
