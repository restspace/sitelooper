# Changelog

## 0.4.0 — 2026-09-22

### Since 0.3.0: benchmark rounds 33–46
- Five new third-party benchmark targets: OpenProject (from round 33), and Gitea, Vikunja,
  EspoCRM, Snipe-IT and Ghost (from round 36). All ten targets were green on their latest
  sweep as of round 44 (`bench/SWEEPS.md`): every run verified, every replay step
  model-free, and the compiled Playwright script passing.
- Robustness fixes, each found by a sweep and fixed at its cause rather than per app:
  - A tab a click opens is credited to that click, even when it arrives late or has no opener.
  - Form fields a page reload empties are filled again before the submit, and a submit the
    reload swallowed is retried once.
  - A masked or formatted input that drops its value when it loses focus is typed key by key.
  - A recording that hits its turn cap and reports failure escalates to the fallback model.
  - Render-counter element ids (`#ember123`) are not trusted as stable locators.
  - A one-digit record id is referenced by where it came from, not matched by its value.
  - Relative times ("1 minute ago") are treated as volatile text.
  - A hide-then-show pair on one control compiles to a single toggle, skipped when the
    content is already showing.
  - Superseded attempts are dropped: a value set again after a reload, a click that did
    nothing before the one that worked, a link click abandoned for a goto.
  - A list read whose elements are each a reported value is split into one read per element.
  - A read-back found inside a longer text publishes only the value, not the whole text.
  - A page opened by a script is not credited as a popup; report keys that are page text
    become positional values; a stored `[role=x]` scope resolves as it did live; an
    image-only link reads as its accessible name; a nameless control gets a candidate from
    its own stable attributes.

### Credentials and CLI
- `{{env:NAME}}` sign-in steps now replay without the model: markers resolve at dispatch in
  the daemon, replay and the compiled script (which reads `process.env` at run time), and a
  missing variable is refused by name.
- New `{{totp:NAME}}` marker: `NAME` holds a base32 TOTP seed (or an `otpauth://` URI) and the
  current RFC 6238 code is typed at dispatch, in every runner; codes are never stored and
  are scrubbed from results.
- `sitelooper stop --all` also stops the default session; a running daemon whose skill store
  differs from the one requested is refused rather than silently reused.

- Cloud-verified at 2623dbf (round 46, the last engine change before this release): 2156 unit
  tests, 2332 with the browser suites, and 121 execution-parity tests passing; the corpus
  check changed status for no published run.

### Default provider
- Setting only `OPENROUTER_API_KEY` selects the benchmarked pairing:
  `deepseek/deepseek-v4.1-flash` pinned to OpenRouter's DeepSeek backend, escalating to
  `z-ai/glm-5.3`. A Z.ai key, or a generic key with no provider named, still selects
  `zhipu` as before; `SITELOOPER_PROVIDER` picks any other provider. `sitelooper doctor`
  reports which provider and models it will use, and why.

### Renamed to sitelooper
- The project, package, CLI and skill are now `sitelooper` (previously
  `sleep-walker`, which this package supersedes on npm).
- Env vars are `SITELOOPER_*`; state lives under `~/.sitelooper/`.
- Only the `sitelooper` command is installed; the old command names were
  removed. The legacy `SLEEP_WALKER_*` and `BROWSER_PILOT_*` env prefixes are
  still honoured (most recent wins), and an existing `~/.sleep-walker` or
  `~/.browser-pilot` home keeps being used until a `~/.sitelooper` exists.
- The package homepage is the GitHub repository.
- The bench arm id is now `sitelooper`; the verifiers still read results
  published under the old `sleep-walker` arm id, and published run artefacts
  keep the names they were recorded under.

## 0.2.0 — 2026-08-26 (beta)

The first beta cut. Everything below is measured, not claimed: the v0.2
addendum in `bench/MATRIX-v0.1.md` verifies 27/27 objectives across three
real apps (repairdesk, Odoo 17, Grafana 11) at $0.05–$0.50 per run, on the
same cloud environment as the v0.1 baseline.

### Replay v2 — evidence-based page/record re-resolution
- Structural URL matching: pattern markers (`:id`, `:var`, `{{…}}`) are the
  only wildcards; shape heuristics no longer decide matches.
- Soft matching (mechanism 2): a same-shape URL with 1–2 disagreeing literal
  segments proceeds optimistically and, once the run advances past it, that
  segment is generalised to `:var` in the stored skill — volatility proven,
  not guessed. Soft precondition matches are additionally gated by the
  segment's structural fingerprint (≥0.8 cosine), so a different page
  template still refuses.
- Provenance (mechanism 1): values a run mints (a created record's id, a
  generated uid) become `{{dN}}` derived params, re-bound from the live
  replay's own URL and threaded through segment chains; flows expose
  `{{step.url.<part>}}` outputs the same way.
- Navigation by recorded destination: when a navigation click's target is
  gone (session-local UI like a recents list), replay first clicks another
  visible link matching the recorded destination, then — only for a fully
  concrete URL — navigates directly. Both logged as fallthroughs.

### Component recipes
- A third, origin-INDEPENDENT learning tier for hard widgets: seeded,
  self-verifying procedures for monaco, CodeMirror 6, ProseMirror,
  contenteditable, and ARIA comboboxes, applied transparently under
  fill/type/select with fallback to the naive primitive. Recipes follow the
  skills lifecycle (provisional → validated on verified use, cross-origin
  success weighted double; demoted on repeat failure) and new variants are
  learned from successful recoveries. The mandatory verification read is
  the honesty rule made structural: a recipe that cannot re-observe its own
  effect did not succeed.

### Secrets
- `{{env:NAME}}` markers resolve only at the tool layer: the model, the
  transcript, recordings, skills, and flows carry the marker; the browser
  alone receives the value. Page echoes are scrubbed back to the marker.
  An unset variable is a hard error, never a literal keystroke.

### Install & operations
- `sleep-walker doctor`: one-command install diagnosis (node, home,
  launchable browser with the exact fix on failure, provider/key) — no
  daemon, no API key needed.
- CI: unit suite on Linux/Windows/macOS, the browser-gated suite on
  Playwright's chromium (the bare-box fallback path), and a cold-install
  job on all three OSes (pack → global install → doctor → keyless session).
- MIT license.

### Status labels
- Supported surface: `do`, learning/skills, briefings, secrets.
- Experimental: flows (`var` / `flow` / `run` / `stop --save-flow`) —
  functional end-to-end on real apps, still converging on replay cost.

## 0.1.0

Initial internal version: agent-in-the-loop `do` instruction loop, session
daemon with persistent profiles, recording to Playwright scripts, learning
mode (skills with locator chains, parameterisation, lifecycle), flows,
four-arm benchmark harness.
