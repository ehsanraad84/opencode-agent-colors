import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import Module from "node:module"

const require = createRequire(import.meta.url)

/** Load the built GUI bundle with the SDK modules and a minimal DOM stubbed. */
function loadBundle() {
  const cleanup = []
  const effects = []
  let currentEffect = null
  const Style = { name: "Style" }
  const Plugin = { define: (definition) => definition }

  // The plugin polls with setInterval; keep the test process from staying alive.
  const realSetInterval = globalThis.setInterval
  const realClearInterval = globalThis.clearInterval
  globalThis.setInterval = () => 0
  globalThis.clearInterval = () => {}

  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === "@opencode/plugin/gui") return { Plugin, Style }
    if (request === "solid-js") {
      return {
        createSignal: (initial) => {
          let value = initial
          const subscribers = new Set()
          return [
            () => {
              if (currentEffect) subscribers.add(currentEffect)
              return value
            },
            (next) => {
              value = typeof next === "function" ? next(value) : next
              for (const fn of [...subscribers]) fn()
            },
          ]
        },
        createEffect: (fn) => {
          effects.push(fn)
          const previous = currentEffect
          currentEffect = fn
          try {
            fn()
          } finally {
            currentEffect = previous
          }
        },
        onCleanup: (fn) => cleanup.push(fn),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  let bundle
  try {
    bundle = require("../dist/gui-experimental.cjs")
  } finally {
    Module._load = originalLoad
  }

  const element = (text) => {
    const attrs = new Map()
    return {
      textContent: text,
      setAttribute: (name, value) => attrs.set(name, value),
      removeAttribute: (name) => attrs.delete(name),
      getAttribute: (name) => attrs.get(name),
    }
  }

  const meta = [element("Planner")]
  const subagent = [element("Subagent: reviewer")]
  const composer = [element("not even the agent name")]
  const root = {
    querySelectorAll(selector) {
      if (selector.includes("[data-oc-agent-color]")) return [...meta, ...subagent, ...composer]
      if (selector.includes("composer-controls")) return composer
      if (selector.includes("timeline-event-item-name")) return subagent
      if (selector.includes("meta-item")) return meta
      return []
    },
  }

  globalThis.document = { body: root, documentElement: root }
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  }

  return {
    definition: bundle.default,
    Style,
    cleanup,
    meta,
    subagent,
    composer,
    rerun: () => effects.forEach((fn) => fn()),
    restoreTimers: () => {
      globalThis.setInterval = realSetInterval
      globalThis.clearInterval = realClearInterval
    },
  }
}

test("built bundle registers Style and tags primary and subagent labels", async () => {
  const { definition, Style, cleanup, meta, subagent, composer, rerun, restoreTimers } = loadBundle()
  const agents = [
    { id: "planner", color: "#E67E22" },
    { id: "reviewer", color: "#2E86C1" },
    { id: "build" },
  ]

  let styleFn
  let location = { directory: "/project" }
  let currentAgent = "planner"
  const otherConversation = [{ id: "tester", color: "#123456" }]
  const ctx = {
    sessions: { current: () => ({ id: "ses_test", server: { id: "sidecar" }, location }) },
    servers: {
      list: () => ["sidecar"],
      get: () => ({
        client: {
          agent: {
            list: async (input) => ({
              data: input?.location?.directory === "/other" ? otherConversation : agents,
            }),
          },
        },
        data: { session: { get: () => ({ agent: currentAgent }) } },
      }),
    },
    add: (registry, item) => {
      if (registry === Style) styleFn = item
    },
  }

  definition.setup(ctx)
  restoreTimers()
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.equal(typeof styleFn, "function")
  assert.match(styleFn(), /data-oc-agent-color="planner"/)
  assert.match(styleFn(), /color: #e67e22;/)
  assert.match(styleFn(), /color: #2e86c1;/)
  assert.equal(meta[0].getAttribute("data-oc-agent-color"), "planner")
  assert.equal(subagent[0].getAttribute("data-oc-agent-color"), "reviewer")
  assert.equal(composer[0].getAttribute("data-oc-agent-color"), "planner")

  // An agent without a configured color is left untagged.
  currentAgent = "build"
  rerun()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(composer[0].getAttribute("data-oc-agent-color"), undefined)
  currentAgent = "planner"
  rerun()
  await new Promise((resolve) => setTimeout(resolve, 20))

  // A config edit changes the injected CSS without a restart.
  agents[0].color = "#D35400"
  assert.match(styleFn(), /color: #d35400;/)

  // Routing to another conversation resolves that location's agent catalog.
  location = { directory: "/other" }
  currentAgent = "tester"
  rerun()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.match(styleFn(), /data-oc-agent-color="tester"/)
  assert.match(styleFn(), /color: #123456;/)
  assert.doesNotMatch(styleFn(), /data-oc-agent-color="planner"/)
  assert.equal(composer[0].getAttribute("data-oc-agent-color"), "tester")

  // Unloading the plugin removes only its own attributes.
  for (const fn of cleanup) fn()
  assert.equal(meta[0].getAttribute("data-oc-agent-color"), undefined)
  assert.equal(subagent[0].getAttribute("data-oc-agent-color"), undefined)
  assert.equal(composer[0].getAttribute("data-oc-agent-color"), undefined)
})
