import { LABEL_TARGETS, matchAgent } from "./core.js"

const ATTRIBUTE = "data-oc-agent-color"

/** @param {ParentNode} root @param {Map<string, { id: string, color: string } | null>} map */
export function annotate(root, map) {
  for (const target of LABEL_TARGETS) {
    for (const element of root.querySelectorAll(target.selector)) {
      const id = matchAgent(element.textContent, map, target.mode)
      if (id) element.setAttribute(ATTRIBUTE, id)
      else element.removeAttribute(ATTRIBUTE)
    }
  }
}

/** @param {ParentNode} root */
export function clear(root) {
  for (const element of root.querySelectorAll(`[${ATTRIBUTE}]`)) element.removeAttribute(ATTRIBUTE)
}

/**
 * Tags existing identity elements with the agent id so `Style` rules can color
 * them. This uses the Desktop app's internal `data-slot` attributes; they are
 * not part of the public GUI SDK and may change in a future release.
 *
 * @param {() => Map<string, { id: string, color: string } | null>} getMap
 */
export function createAnnotator(getMap) {
  const root = () => document.body ?? document.documentElement
  let scheduled = false
  let pending

  const run = () => {
    scheduled = false
    try {
      annotate(root(), pending ?? getMap())
    } catch {
      // A partially rendered timeline must never break the window.
    } finally {
      pending = undefined
    }
  }

  const schedule = (map) => {
    if (map) pending = map
    if (scheduled) return
    scheduled = true
    queueMicrotask(run)
  }

  const observer = new MutationObserver(() => schedule())
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  schedule()

  return {
    refresh(map) {
      schedule(map)
    },
    dispose() {
      observer.disconnect()
      clear(root())
    },
  }
}
