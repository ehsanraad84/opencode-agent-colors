/**
 * Pure logic shared by the GUI plugin and the unit tests.
 *
 * OpenCode V2 stores an agent color as a six-digit hex string. Named theme
 * colors are rejected by OpenCode core itself, so they never reach the client.
 */

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** @param {unknown} value */
export function normalizeColor(value) {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : undefined
}

/** @param {string} value */
export function capitalize(value) {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

/**
 * The Desktop timeline labels an agent by its id: capitalized for user-message
 * metadata, and either raw or capitalized for subagent rows.
 *
 * @param {{ id?: unknown, name?: unknown }} agent
 * @returns {string[]}
 */
export function labelCandidates(agent) {
  if (typeof agent.id !== "string" || agent.id.length === 0) return []
  const labels = new Set([agent.id, capitalize(agent.id)])
  if (typeof agent.name === "string" && agent.name.length > 0) {
    labels.add(agent.name)
    labels.add(capitalize(agent.name))
  }
  return [...labels]
}

/**
 * Map a visible label to the agent that owns it. Agents with no color, an
 * invalid color, or a label shared with another agent are left unmapped so
 * they keep the default appearance.
 *
 * @param {Iterable<{ id?: unknown, name?: unknown, color?: unknown }>} agents
 * @returns {Map<string, { id: string, color: string } | null>}
 */
export function buildColorMap(agents) {
  /** @type {Map<string, { id: string, color: string } | null>} */
  const map = new Map()
  for (const agent of agents) {
    if (typeof agent.id !== "string" || agent.id.length === 0) continue
    const color = normalizeColor(agent.color)
    if (!color) continue
    for (const label of labelCandidates(agent)) {
      const existing = map.get(label)
      if (existing === undefined) map.set(label, { id: agent.id, color })
      else if (existing && existing.id !== agent.id) map.set(label, null)
    }
  }
  return map
}

/** @param {string} value */
export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Whether an agent id has a usable color in the map.
 *
 * @param {Map<string, { id: string, color: string } | null>} map
 * @param {string | undefined} id
 */
export function hasColor(map, id) {
  if (!id) return false
  for (const entry of map.values()) if (entry?.id === id) return true
  return false
}

/** @param {string} value */
export function cssString(value) {
  return `"${value.replace(/["\\\n\r]/g, (char) => "\\" + char)}"`
}

/**
 * CSS is keyed by a private attribute the annotator adds to existing identity
 * elements. The doubled attribute keeps our rules ahead of the app's own
 * single-attribute rules without `!important`.
 *
 * @param {Iterable<{ id: string, color: string }>} entries
 */
export function buildCss(entries) {
  const rules = []
  const seen = new Set()
  for (const entry of entries) {
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    const attr = cssString(entry.id)
    rules.push(`[data-oc-agent-color=${attr}][data-oc-agent-color=${attr}] { color: ${entry.color}; }`)
    // The composer's agent button sets its own color; keep the agent color on
    // top of it so it is visible without hovering the message meta line.
    rules.push(
      `[data-slot="composer-controls"] [data-oc-agent-color=${attr}] { color: ${entry.color} !important; }`,
    )
    // Outline the user's own bubble when its meta line carries this agent.
    // An inset shadow draws like a border without changing the bubble's size.
    rules.push(
      `[data-component="user-message"]:has([data-oc-agent-color=${attr}]) [data-slot="user-message-text"] { box-shadow: inset 0 0 0 1px ${entry.color}; }`,
    )
  }
  return rules.join("\n")
}

/**
 * @param {string} text
 * @param {Map<string, { id: string, color: string } | null>} map
 * @param {"exact" | "contains"} mode
 */
export function matchAgent(text, map, mode) {
  const value = typeof text === "string" ? text.trim() : ""
  if (!value) return undefined
  if (mode === "exact") return map.get(value)?.id
  let best
  for (const [label, hit] of map) {
    if (!hit) continue
    // Require a word boundary so "reviewer" never matches "reviewer-old".
    const boundary = new RegExp(`(^|[^A-Za-z0-9_/-])${escapeRegExp(label)}($|[^A-Za-z0-9_/-])`)
    if (boundary.test(value) && (!best || label.length > best.length)) best = label
  }
  return best ? map.get(best)?.id : undefined
}

export const LABEL_TARGETS = [
  {
    selector: '[data-slot="user-message-meta-item"], [data-slot="text-part-meta-item"]',
    mode: "exact",
  },
  {
    selector:
      '[data-slot="timeline-event-item"][data-kind="subagent"] [data-slot="timeline-event-item-name"]',
    mode: "contains",
  },
]
