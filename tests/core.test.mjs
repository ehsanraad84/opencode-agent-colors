import test from "node:test"
import assert from "node:assert/strict"
import {
  buildColorMap,
  buildCss,
  capitalize,
  cssString,
  labelCandidates,
  matchAgent,
  normalizeColor,
} from "../src/core.js"

const entries = (map) => {
  const seen = new Set()
  return [...map.values()].filter((entry) => {
    if (!entry || seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}

test("two agents with different HEX colors get distinct rules", () => {
  const map = buildColorMap([
    { id: "planner", color: "#E67E22" },
    { id: "reviewer", color: "#2E86C1" },
  ])
  const css = buildCss(entries(map))
  assert.match(css, /\[data-oc-agent-color="planner"\]/)
  assert.match(css, /color: #e67e22;/)
  assert.match(css, /\[data-oc-agent-color="reviewer"\]/)
  assert.match(css, /color: #2e86c1;/)
  assert.match(css, /\[data-slot="composer-controls"\] \[data-oc-agent-color="planner"\]/)
  assert.match(css, /\[data-component="user-message"\]:has\(\[data-oc-agent-color="planner"\]\)/)
  assert.match(css, /box-shadow: inset 0 0 0 1px #e67e22;/)
})

test("named theme colors are not agent colors and keep the default appearance", () => {
  const map = buildColorMap([
    { id: "planner", color: "primary" },
    { id: "reviewer", color: "warning" },
    { id: "tester", color: "#22c55e" },
  ])
  assert.deepEqual(entries(map), [{ id: "tester", color: "#22c55e" }])
  assert.equal(buildCss(entries(map)).includes("planner"), false)
})

test("agents without a color are skipped", () => {
  const map = buildColorMap([{ id: "build" }, { id: "plan", color: null }])
  assert.equal(map.size, 0)
  assert.equal(buildCss(entries(map)), "")
})

test("invalid colors never break or leak into CSS", () => {
  for (const color of ["#abc", "#12345", "#1234567", "red", "#gggggg", "", 123, {}]) {
    assert.equal(normalizeColor(color), undefined, `expected ${String(color)} to be invalid`)
  }
  const map = buildColorMap([
    { id: "a", color: "#12345" },
    { id: "b", color: "#ABCDEF" },
  ])
  assert.deepEqual(entries(map), [{ id: "b", color: "#abcdef" }])
})

test("primary labels match exactly and subagent labels match by inclusion", () => {
  const map = buildColorMap([{ id: "team/reviewer", color: "#ff6b6b" }])
  assert.equal(matchAgent("Team/reviewer", map, "exact"), "team/reviewer")
  assert.equal(matchAgent("team/reviewer", map, "exact"), "team/reviewer")
  assert.equal(matchAgent("Runner: team/reviewer", map, "contains"), "team/reviewer")
  assert.equal(matchAgent("Someone else", map, "exact"), undefined)
  assert.equal(matchAgent("", map, "contains"), undefined)
})

test("subagent matching respects word boundaries", () => {
  const map = buildColorMap([{ id: "reviewer", color: "#ff6b6b" }])
  assert.equal(matchAgent("Subagent: reviewer", map, "contains"), "reviewer")
  assert.equal(matchAgent("Subagent: reviewer-old", map, "contains"), undefined)
  assert.equal(matchAgent("Subagent: senior reviewer", map, "contains"), "reviewer")
})

test("label candidates cover both the capitalized id and the raw id", () => {
  assert.deepEqual(labelCandidates({ id: "reviewer" }), ["reviewer", "Reviewer"])
  assert.equal(capitalize("team/reviewer"), "Team/reviewer")
  assert.deepEqual(labelCandidates({ id: "x", name: "custom" }), ["x", "X", "custom", "Custom"])
})

test("changing an agent color rebuilds the rule without touching other agents", () => {
  const before = buildColorMap([{ id: "planner", color: "#e67e22" }, { id: "tester", color: "#22c55e" }])
  const after = buildColorMap([{ id: "planner", color: "#d35400" }, { id: "tester", color: "#22c55e" }])
  assert.match(buildCss(entries(before)), /color: #e67e22;/)
  assert.doesNotMatch(buildCss(entries(after)), /#e67e22/)
  assert.match(buildCss(entries(after)), /color: #d35400;/)
  assert.match(buildCss(entries(after)), /color: #22c55e;/)
})

test("ambiguous labels fall back to the default appearance", () => {
  const map = buildColorMap([
    { id: "reviewer", color: "#111111" },
    { id: "Reviewer", color: "#222222" },
  ])
  assert.equal(map.get("Reviewer"), null)
  assert.equal(matchAgent("Reviewer", map, "exact"), undefined)
})

test("attribute values are escaped for unusual agent ids", () => {
  assert.equal(cssString('a"b\\c'), '"a\\"b\\\\c"')
  assert.equal(buildCss([{ id: 'a"b', color: "#abcdef" }]).includes('data-oc-agent-color="a\\"b"'), true)
})
