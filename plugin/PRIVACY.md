# Privacy policy: sitelooper plugin

Last updated: 2026-10-22

The sitelooper plugin is a set of instructions (skills) that lets Claude run the open-source
sitelooper command-line tool on your computer. Restspace, which publishes the plugin, operates no
service for it and receives no data from it.

## What the plugin collects

Nothing. The plugin has no server, no analytics and no telemetry. Neither the plugin nor the
sitelooper CLI sends any data to Restspace.

## Where your data goes

When Claude runs sitelooper on your behalf:

- **Your LLM provider** receives the instructions and what the browser shows on the pages being
  tested (accessibility tree, page text, form values), and screenshots only if you enable vision.
  This is the provider whose API key you configured (OpenRouter by default; also Z.ai, Novita,
  OpenAI or Anthropic). Their privacy policy and terms govern that data.
- **TypeSafe** receives questions about page state only if you configure a TypeSafe API key.
- **Credentials** you reference as `{{env:NAME}}` or `{{totp:NAME}}` are resolved and typed on your
  machine. Recordings and compiled specs keep only the marker, not the value.
- **Local files.** Browser profiles, sessions, learned procedures and flows are stored on your
  computer under `~/.sitelooper/` (or `SITELOOPER_HOME`), and compiled tests in your project. You can
  delete them at any time.

Anthropic's handling of your conversation with Claude is covered by Anthropic's own policies.

## Children

The plugin is a developer tool and is not directed at people under 18.

## Contact

Open an issue at https://github.com/restspace/sitelooper/issues.
