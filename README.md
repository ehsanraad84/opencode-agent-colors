# OpenCode Agent Colors

A small, GUI-only OpenCode Desktop plugin that shows each agent's configured
`color` on its identity in the chat timeline. It does not modify OpenCode, add a
backend, a database, a settings UI, or any runtime dependency beyond the SDK
that Desktop already provides. The color appears both on message identity labels
and on the agent selector in the composer (bottom-left, beside the model).

## Status

- Built against the Desktop GUI plugin SDK (`@opencode/plugin` 2.4.1). The GUI
  API is officially marked **experimental**.
- All 10 automated tests pass (`npm test`), including a smoke test that loads
  the built bundle with a stubbed SDK and DOM.
- Verified on a real Windows OpenCode Desktop v2.4.1: the GUI plugin loads, the
  server's agent API returns the configured colors, and timeline labels are
  tagged with the matching agent id/color. The remaining visual checklist below
  is still worth a quick pass on your own machine.

## Install from GitHub

Add one entry to your **global** `opencode.json(c)` (Desktop reads GUI plugins
from there, not from `cli.json`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:ehsanraad84/opencode-agent-colors#main"],
}
```

Or install it with the CLI:

```sh
opencode plugin add github:ehsanraad84/opencode-agent-colors#main
```

OpenCode clones the repository, loads the prebuilt `dist/gui-experimental.cjs`,
and checks `main` for updates. To pin a version instead, use a tag or commit
hash. Requires OpenCode v2.4.x Desktop.

## Local install (development)

1. Build the GUI bundle:

   ```sh
   npm install
   npm run build
   ```

   This writes `dist/gui-experimental.cjs`.

2. Load the plugin from your **global** `opencode.json(c)` (Desktop reads GUI
   plugins from there, not from `cli.json`):

   ```jsonc
   {
     "$schema": "https://opencode.ai/config.json",
     "plugins": ["./path/to/opencode-agent-colors"],
   }
   ```

   Use an absolute path or a `file://` URL if the relative path is awkward.
   A published npm package name works the same way.

3. Reload. Rebuilding a local plugin reloads its GUI in every Desktop window;
   changing the plugin entry in config also reloads it. Do not restart the
   OpenCode service just to reload a GUI plugin.

## Configure agents

Set `color` on any agent configuration. OpenCode V2 accepts a **six-digit hex**
value:

```md
<!-- .opencode/agents/reviewer.md -->
---
description: Reviews changes
mode: subagent
color: "#E67E22"
---

Review the current changes.
```

```jsonc
{
  "agents": {
    "planner": { "mode": "primary", "color": "#2E86C1" },
    "reviewer": { "mode": "subagent", "color": "#E67E22" },
    "tester": { "mode": "all", "color": "#1E8449" },
  },
}
```

Agents without `color` keep the default appearance. Invalid values are ignored
by OpenCode before this plugin ever sees them, and are ignored again by the
plugin's own validation.

## How a color is resolved

1. The plugin calls `client.agent.list({ location })` on each connected server
   (the same information as `GET /api/agent`). This Desktop release does not
   expose an agent catalog in its synced GUI store, so the API is the stable
   source. The list is refreshed when the routed conversation changes and every
   5 seconds, so config edits appear without a restart.
2. Only strict `#RRGGBB` values are accepted; they are lowercased and passed to
   CSS directly. No random colors, no generated palette.
3. The visible label is matched to an agent id. Desktop capitalizes agent ids in
   user-message metadata (`reviewer` → `Reviewer`) and uses the raw or
   capitalized id in subagent rows and the composer selector. Both forms are recognized.
4. A private `data-oc-agent-color` attribute is added to the existing label
   element, and an injected `Style` rule colors that attribute. The attribute
   is removed again when the label no longer matches or the plugin unloads.
5. The color map lives in a Solid signal, so both a config edit (next poll) and
   a conversation switch re-inject the CSS and re-tag the visible labels.

Named theme colors (`primary`, `warning`, `accent`, …) are **not supported by
OpenCode V2 for agents**. Core rejects them with
`/^#[0-9a-fA-F]{6}$/` and drops the field, so no client can apply them. They were
valid in older V1 agent configs; V2 silently ignores them.

## Desktop SDK limitations

- The GUI plugin SDK offers `Style` (CSS injection), slots, panels, commands and
  settings pages. It has **no registry for chat messages, agent labels or
  timeline rows**, and no TUI styling API in Desktop. A badge in the
  `session.header` slot is the only fully public way to show agent identity,
  but it is not "alongside messages" and does not cover subagent rows.
- To color the existing labels, this plugin uses the Desktop app's internal
  `data-slot="user-message-meta-item"`, `data-slot="text-part-meta-item"` and
  `data-slot="timeline-event-item-name"` attributes, plus a `MutationObserver`
  to tag matching elements. **These attributes are not part of the public GUI
  SDK.** They may change in a future Desktop release, in which case labels can
  silently lose their color; chat behavior itself is unaffected because the
  plugin only sets/removes its own attribute and never rewrites content.
- Matching is by label text. If two different agents would produce the same
  visible label with different colors, that label is left default rather than
  guessing.
- A `MutationObserver` scans label elements on timeline changes. It is
  debounced to one microtask per batch and observes childList/characterData
  only, so its own attribute writes do not re-trigger it.
- The GUI API is experimental; pin the plugin SDK to the OpenCode release you
  target and rebuild/republish when the GUI contract changes.

## Manual verification checklist

Run these against a real Desktop build after installing:

- [ ] Two primary agents with different HEX colors show two distinct label colors.
- [ ] Two agents using V1-style named colors keep the default look (V2 drops them).
- [ ] An agent without `color` keeps the default look.
- [ ] An invalid color (e.g. `#abc`, `red`) keeps the default look and no errors appear.
- [ ] A primary agent message and a subagent row both show their configured color.
- [ ] Switching between conversations keeps the right color on each label.
- [ ] Editing an agent's color in its Markdown/JSON config updates the chat without restart.
- [ ] Typing, tool calls, streaming, copy menu and other Desktop features still work.

## Development

```sh
npm test      # builds first, then runs logic + built-bundle tests
npm run check # TypeScript check
npm run build # dist/gui-experimental.cjs
npm run dev   # rebuild on every change (Desktop reloads the GUI)
```

### Files

| Path | Purpose |
| --- | --- |
| `src/gui.tsx` | GUI plugin definition, reactive agent read, `Style` and cleanup |
| `src/core.js` | Color validation, label mapping, CSS generation (unit tested) |
| `src/observe.js` | MutationObserver that tags existing identity elements |
| `tests/core.test.mjs` | Pure-logic tests for resolution, fallback and CSS |
| `tests/gui-bundle.test.mjs` | Built-bundle smoke test with stubbed SDK/DOM |
| `vite.config.ts` | `@opencode/plugin/gui/vite` preset |

Nothing here writes to OpenCode's configuration, database or source tree.
