# sitelooper for Claude

Write browser tests in plain English, and get standalone Playwright specs that run in CI with no
model in the loop.

Ask Claude for a test of a user journey ("sign in, create a ticket, check it appears in the list")
and this plugin has Claude drive the [sitelooper](https://github.com/restspace/sitelooper) CLI. A
small model inside sitelooper does each step against your app in a real browser and records
durable locators, where each value came from, and what each step changed. sitelooper then compiles
the recording into a `@playwright/test` spec and runs it three times against fresh state before
calling it ready. The spec needs only Playwright to run: no sitelooper, no API key, no model.

When the app changes and a compiled spec goes red, Claude can use sitelooper to repair it. A repair
re-records only the steps that broke, never weakens an assertion, and is checked under plain
Playwright before you apply it.

## Skills

| Skill | Use it for |
|---|---|
| `write-browser-test` | Author a Playwright test of a web app flow from a plain-English description |
| `fix-browser-test` | Repair a compiled spec after a red CI run, or re-record one step |
| `sitelooper` | Drive a local browser with natural-language steps, and the full CLI reference |

## Requirements

- **Claude Code**, or another Claude app that can run shell commands on your computer. sitelooper
  runs a browser on the machine where the commands run. In claude.ai chat the skills can explain the
  workflow but cannot run it.
- **Node.js 20 or later** and the CLI: `npm install -g sitelooper@0.6.0`. The skills check for it
  and ask you before installing anything.
- **Chrome, Edge or Playwright's bundled Chromium.**
- **An API key for an LLM provider, set in your own shell** (for example `OPENROUTER_API_KEY`).
  Recording and repair use it; compiled specs never do. The skills never ask you to paste a key into
  the conversation.
- `@playwright/test` in the project that runs the compiled specs.

## What runs, what is sent, and where

The plugin itself is instructions only: three skills, with no hooks, no MCP server, no scripts and
no executables. Everything below is done by the sitelooper CLI, which Claude runs in your shell.

- **Your LLM provider.** While recording or repairing, sitelooper sends the instruction text and
  what the browser shows (the page's accessibility tree, text and form values) to the provider you
  configured: OpenRouter by default, or Z.ai, Novita, OpenAI or Anthropic. Credentials are written as
  `{{env:NAME}}` markers and are typed into the browser locally; their values are not sent.
  Screenshots are sent only if you turn vision on (`SITELOOPER_VISION=on`).
- **TypeSafe.** If you set a TypeSafe API key (`SITELOOPER_JEV_API_KEY` or `TYPESAFE_API_KEY`), an
  optional tier sends typed questions about page state to TypeSafe's API. With no key it is off.
- **The sites you test.** The browser opens only the URLs you or Claude give it.
- **Your disk.** Sessions, browser profiles, learned procedures, flows, and any screenshots or
  videos you ask for are kept under `~/.sitelooper/` (or `SITELOOPER_HOME`). Recordings can contain
  values the app displayed, such as names or emails in test records. Compiled specs and their config
  go in your project.
- **Nothing else.** sitelooper has no telemetry and sends nothing to its authors.

Use it only on apps you operate or are authorised to test. It does not solve CAPTCHAs or evade
bot detection.

## Install

```
/plugin marketplace add restspace/sitelooper
/plugin install sitelooper@sitelooper
```

## Links

- [Documentation](https://github.com/restspace/sitelooper#readme)
- [Issues and support](https://github.com/restspace/sitelooper/issues)
- [Privacy](PRIVACY.md) and [terms](TERMS.md)
- License: MIT
