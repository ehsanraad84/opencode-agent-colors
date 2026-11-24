import { LABEL_TARGETS, hasColor, matchAgent } from "./core.js"

const ATTRIBUTE = "data-oc-agent-color"
const COMPOSER_SELECTOR = '[data-slot="composer-controls"] button'

/**
 * Tags existing identity elements with the agent id so `Style` rules can color
 * them. This uses the Desktop app's internal `data-slot` attributes; they are
 * not part of the public GUI SDK and may change in a future release.
 *
 * @param {ParentNode} root
 * @param {Map<string, { id: string, color: string } | null>} map
 * @param {string | undefined} currentAgentId
 */
export function annotate(root, map, currentAgentId) {
  for (const target of LABEL_TARGETS) {
    for (const element of root.querySelectorAll(target.selector)) {
      const id = matchAgent(element.textContent, map, target.mode)
      if (id) element.setAttribute(ATTRIBUTE, id)
      else element.removeAttribute(ATTRIBUTE)
    }
  }

  // The first control is the agent selector. The synced session record can lag
  // behind a fresh selection, so prefer its live label and use the session's
  // agent id only as a fallback. Only this button is tagged; model/variant
  // buttons keep their default appearance.
  const [agentButton, ...others] = root.querySelectorAll(COMPOSER_SELECTOR)
  for (const element of others) element.removeAttribute(ATTRIBUTE)
  if (agentButton) {
    const byLabel = matchAgent(agentButton.textContent, map, "exact")
    const id = byLabel ?? (hasColor(map, currentAgentId) ? currentAgentId : undefined)
    if (id) agentButton.setAttribute(ATTRIBUTE, id)
    else agentButton.removeAttribute(ATTRIBUTE)
  }
}

/** @param {ParentNode} root */
export function clear(root) {
  for (const element of root.querySelectorAll(`[${ATTRIBUTE}]`)) element.removeAttribute(ATTRIBUTE)
}

/**
 * @param {() => Map<string, { id: string, color: string } | null>} getMap
 * @param {() => string | undefined} getAgentId
 */
export function createAnnotator(getMap, getAgentId) {
  const root = () => document.body ?? document.documentElement
  let scheduled = false
  let pending
  let pendingAgent

  const run = () => {
    scheduled = false
    try {
      const agent = pendingAgent ? pendingAgent.value : getAgentId()
      annotate(root(), pending ?? getMap(), agent)
    } catch {
      // A partially rendered timeline must never break the window.
    } finally {
      pending = undefined
      pendingAgent = undefined
    }
  }

  const schedule = (map, agent) => {
    if (map) pending = map
    if (agent !== undefined) pendingAgent = { value: agent }
    if (scheduled) return
    scheduled = true
    queueMicrotask(run)
  }

  const observer = new MutationObserver(() => schedule())
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  schedule()

  return {
    refresh(map, agent) {
      schedule(map, agent)
    },
    dispose() {
      observer.disconnect()
      clear(root())
    },
  }
}
