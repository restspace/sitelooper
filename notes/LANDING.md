# sitelooper

#### Write browser tests in English, run them in CI as scripts, recover automatically when things change

Most people don't write many E2E browser tests because it's hard and then they're brittle. So now people are starting to use agents to make it easier and more flexible. But then it's slow and expensive, not necessarily reproducible and impossible to run in a CI process.

sitelooper is a CLI: you can run it yourself on the command line or give it to an agent (we have a skill for it). You start a session and each call of the CLI is part of the session, an instruction you give in natural language to take some step in the test process.

These instructions could look like:

- Sign in as bench@example.com with password {{env:APP_PASSWORD}} and verify the ticket list opens
- Create a ticket titled 'k7 Bench Ticket' for customer 'Demo Customer'; verify it appears in the list and report its ticket id
- Open ticket 'k7 Bench Ticket' and add a part named 'k7 Part A' with cost 100 and markup 25; report the price the app computes

sitelooper is a mini agent which uses a cheap model to work out how to follow your instructions and it records what it finds.

```
sitelooper --session demo --learn open http://127.0.0.1:4180/
sitelooper --session demo do "Sign in as bench@example.com with password {{env:APP_PASSWORD}} and verify the ticket list opens"
```

The first run is somewhat slower but much cheaper than just running it with an agent.

You then save the recording as a 'flow', and you can play the flow back with sitelooper if you want to have an agent available to fix any problems, or you can compile it to a Playwright spec with built-in resilience which you can run in CI.

Each step automatically checks that it did what it was supposed to do by ensuring whatever was meant to change on the page actually did change. It stops and reports failure if not.

That's critical because scripts that don't check their effects fail silently. In our benchmark, we tested an agent without sitelooper against 4 third party apps and got it to write a Playwright script from its own run. Scored against each app's own database, those scripts verified **14 of 48** objectives. On Odoo, the script confirmed a sales order with no lines on it, left it active, and only then reported failure; the wrong record was already in the database. sitelooper's compiled specs verified **20 of 20** checkable objectives on the same four apps.

Cost and time per run, compared with an agent (agent-browser) doing the same work:

| app         | agent, every run | sitelooper, first run | sitelooper replay | compiled Playwright spec |
| ----------- | ---------------- | --------------------- | ----------------- | ------------------------ |
| repair-desk | $0.19 · 67s      | $0.05 · 171s          | **$0 · 34s**      | **$0 · 39s**             |
| Kanboard    | $0.77 · 118s     | $0.05 · 187s          | **$0 · 20s**      | **$0 · 21s**             |
| Grafana     | $1.05 · 448s     | $0.09 · 475s          | **$0 · 98–201s**  | **$0 · 97s**             |
| Odoo        | $1.51 · 302s     | $0.10 · 432s          | **$0 · 79s**      | **$0 · 64s**             |

<sub>Cost is model spend at list price. Each sitelooper figure is from that app's latest passing benchmark run; the agent figures are from an earlier round, with agent-browser driven by glm-5.3. repair-desk is the demo app in the sitelooper repo. On Kanboard the agent hit its turn limit and completed 2 of 6 objectives.</sub>

sitelooper is robust: if your spec breaks, you can repair it automatically.

```
sitelooper repair tests/sitelooper/ticket.flow.ts
```

It can handle many classes of minor changes ongoing development makes to the app under test, often not needing any work or at worst requiring one or two simple automatic steps to fix a flow.

