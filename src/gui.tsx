import { createEffect, createSignal, onCleanup } from "solid-js"
import { Plugin, Style } from "@opencode/plugin/gui"
import { buildColorMap, buildCss } from "./core.js"
import { createAnnotator } from "./observe.js"

export default Plugin.define({
  setup(ctx) {
    // The GUI SDK does not expose agent metadata in its synced store in every
    // Desktop release. The server's agent endpoint is the stable source.
    const [agentList, setAgentList] = createSignal<any[]>([])
    let disposed = false

    const refresh = async () => {
      const session = ctx.sessions.current()
      /** @type {any[]} */
      const all = []
      for (const id of ctx.servers.list()) {
        const server = ctx.servers.get(id)
        if (!server) continue
        try {
          const location = session && session.server.id === id ? session.location : undefined
          const result = await server.client.agent.list(location ? { location } : {})
          if (Array.isArray(result?.data)) all.push(...result.data)
        } catch {
          // An unreachable server simply has no colors until it returns.
        }
      }
      if (!disposed) setAgentList(all)
    }

    // The session record carries the selected agent id, so the composer button
    // can be identified directly instead of guessing from its label.
    const currentAgentId = () => {
      const session = ctx.sessions.current()
      if (!session) return undefined
      const server = ctx.servers.get(session.server.id)
      let info
      try {
        info = (server?.data as any)?.session?.get?.(session.id)
      } catch {
        // A session that has not synced yet has no agent to read.
      }
      return typeof info?.agent === "string" ? info.agent : undefined
    }

    const agents = () => agentList()
    const annotator = createAnnotator(() => buildColorMap(agents()), currentAgentId)

    ctx.add(Style, () => {
      const map = buildColorMap(agents())
      return buildCss([...map.values()].filter((entry) => entry !== null))
    })

    createEffect(() => {
      const map = buildColorMap(agents())
      annotator.refresh(map, currentAgentId())
    })

    // Re-read agents when the routed conversation changes, and poll so config
    // edits are picked up without a restart.
    createEffect(() => {
      const session = ctx.sessions.current()
      void session?.id
      void session?.location?.directory
      void refresh()
    })
    const timer = setInterval(() => void refresh(), 5000)

    void refresh()

    onCleanup(() => {
      disposed = true
      clearInterval(timer)
      annotator.dispose()
    })
  },
})
