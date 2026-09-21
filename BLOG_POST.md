# The test you record on Monday should still pass on Thursday

If you look after end-to-end tests for a SaaS product, you already know the shape of the week. A deploy goes out. Twelve specs go red. Nine of them are selectors: a class name with a build hash in it, a button whose label changed from "Save" to "Save changes", a table row that used to be third and is now fourth. Two are timing. One is real, and it took you until Wednesday afternoon to find it because you had to clear the other eleven first.

The industry's answer for the last couple of years has been to put a language model in the browser. Give it the goal in English, let it read the page and decide what to click. And it works, in the sense that the agent usually finishes the task. What it does not do is rerun. Every run is a fresh agent reading every page again, at a dollar or so a pass on a dense app and several minutes of wall clock. You have not built a test. You have hired a very patient contractor who forgets everything at the end of each shift.

The obvious next move is to have the agent write a script from what it did, and this is where most teams find out the hard way that the recording is not the test.

## Why the agent's own script is wrong the moment it is saved

Take a flow that signs in, creates a sales order, adds a second line, changes a quantity and reads back the total. The agent does this fine. Now look at the script it left behind.

The order it created has an id, and that id is in the url it navigated to and in the heading it clicked on. The script quotes both. Tomorrow the app mints a different id, and the script either opens yesterday's order or, worse, opens a different order that happens to exist and works it to completion, reporting green while the database has the wrong record changed. The title the agent typed carried a run marker so the verifier could find it. The script types the same marker again, so the second run creates a duplicate and the verifier finds two.

The selectors are a second problem. What the agent clicked was right once. `tr:nth-of-type(3)` names a position, not a thing. A textbox whose accessible name includes the current minute is unique for sixty seconds. A heading that only renders after a scroll is invisible to a script that never scrolled.

The third problem is quieter. Every observation turn the agent took was a pause the app needed. A list refetched, a modal finished animating, a save round-tripped to the server. A script has no observation turns, so it runs ahead of the app and clicks a control that is about to be replaced.

And nothing checks the effect. A click can land on the wrong element and still return. A save can be refused by a dialog the script never saw. On the benchmark I will get to below, the strongest static script produced from an agent's run verified 14 of 48 objectives across four apps, and on one of them it confirmed an empty sales order as a success.

None of this is a prompting problem. It is structural. A transcript of what one run did is not a specification of what every run should do.

## Treat the recording as evidence, not as a script

The approach that does work is to compile the recording rather than replay it. That is what sitelooper does, and the distinction matters more than it sounds.

You still author with an agent. You give it one instruction at a time from the terminal: sign in as this user, create a ticket titled this and report its id, open the ticket and change its status. It drives the real browser, and each instruction comes back as one verified, structured result. But in learning mode every instruction that succeeds is compiled into a stored procedure, and the procedure is built from what the run proved rather than from what the agent typed.

Every action keeps a chain of locator candidates, not one selector. Role and accessible name first, then label, then test id, then a structural path as a last resort, and the chain ends with where the element was on screen so a positional fallback can be checked against the box it is supposed to hit. On each replay the tool records which candidates actually resolved. A volatile one is retired because it was measured failing, not because someone guessed it looked fragile. A click on a table row is retargeted to the row's own link, whose name is the record's identifier.

Values become parameters. What you typed becomes a slot. What you declared for the session, `var runid=k7`, becomes a reference. A value one step read back and a later step used becomes a live link between steps. An id that first appeared in a url after a save is recognised as something this run minted and is re-read from the browser on the next run instead of being pasted from memory. What cannot be sourced is left blank and sent to recovery rather than filled with a plausible guess.

Every step records what changed on the page when it ran, and a replay checks for that effect before moving on. The new title never appeared as a heading, an alert showed that the recording never saw, the page shows a different record than the one this step was asked for: the replay stops there rather than letting the next step act on the wrong state.

Waits are explicit. Each step lets the DOM go quiet, gives a navigation time to hydrate, and a click that changed nothing while the recording says it should have is retried once after the page settles. A click recorded to open a popup is skipped when the popup is already open, because on a React toggle the same click would close it. A click whose target matches no element at all is refused within three seconds rather than after every fallback tier's timeout, and it says so.

Then the whole thing is compiled to a standalone `@playwright/test` spec. The generated flow file holds the procedures, a typed input and output API, named Playwright steps and the effect checks. The spec file next to it is yours to add business assertions and fixtures to, and recompiling preserves it. CI runs plain Playwright. There is no daemon and no model in the loop at run time.

## What "converged" means, with numbers

The benchmark is four real applications on identical cloud boxes, and success is always what the app's own database or API says happened, never what the arm reported about itself. The apps are a React service-desk SPA, Kanboard (server-rendered PHP with drag-and-drop), Grafana, and Odoo's sales module, which is the one that punishes anything sloppy about ids and dialogs.

On first contact, recording a fresh flow with a cheap inner model and a stronger one for escalation, every target scored full marks: 6 of 6 objectives on each. The recordings cost between eight and eleven cents each and took five to thirteen minutes. Recording is slower than a bare agent run, and that is deliberate. The time goes into proving locators and effects instead of into finishing fast.

The replays are the point. On every one of the four apps, both zero-orchestrator replays of that recording ran every step from the stored procedure with no model call at all, scored the same 6 of 6 on the verifier, and cost nothing. Wall clock was 31 seconds on the service desk, 28 on Kanboard, 76 on Grafana and 62 on Odoo. The compiled Playwright specs, running with no sitelooper runtime present, passed with zero locator drift in 35, 25, 77 and 55 seconds. Two of Kanboard's and two of Grafana's objectives are report-only and cannot be checked from a plain spec, and the verifier marks them unverifiable rather than passing them.

The agent-browser baseline on the same tasks does the job again from scratch every run: 67 seconds and $0.19 on the service desk, 448 seconds and $1.05 on Grafana, 302 seconds and $1.51 on Odoo, and on Kanboard it hit its turn cap at 2 of 6 objectives every time. A converged replay beats it on wall clock by between two and six times, at zero cost, and the answer does not depend on what the model felt like doing that day.

Odoo deserves a paragraph of its own, because it is where this work spent most of its time. Its product configurator modal appears on some product choices and not others, its quotation numbers are minted on save and immediately appear in headings and urls, and a save can be refused silently if the form is not dirty in the way the app expects. Earlier builds replayed Odoo with the model stepping in on one step every run, which meant several hundred seconds and a few cents each time. The current build replays the same seven-step flow in 62 seconds with no model turns, and it took twenty-odd engine rules, each one general to any web app, to get there. None of them mention Odoo. That is a design boundary the project keeps deliberately: no selectors, gestures or workflow assumptions for any specific app live in the tool. App knowledge goes in a briefing you supply for the session.

## What happens when the app changes underneath you

This is the part a QA engineer actually cares about, because the app will change.

A replayed step that cannot run its pinned procedure does not fail the suite outright. It recovers on a cheap model with the partial replay in hand, escalates to the stronger model only if that comes back blocked, and halts with per-step state only if that fails too. A recovery that validates is compiled and pinned back into the flow, so the flow heals over runs and the next replay is deterministic again.

For the compiled spec, the equivalent is a repair proposal. When a spec fails or reports drift, the tool does a live triage run, a convergence run, and then a plain Playwright check of a staged candidate beside your original. It saves the candidate, the change list and the verification evidence without touching your spec. You read the diff, and applying writes exactly the checked source with no further browser run. It refuses to apply if the verification failed or if anything changed under it in the meantime. If the diagnosis is that the recording itself was bad, you re-record that one step, not the flow.

Readiness is earned by execution, not by compiling. The build gate runs the emitted spec three times from reset state with retries off, on at least two distinct datasets, and requires every step to complete with no skipped tests, no already-satisfied shortcuts and no drift. The evidence is written next to the spec with the artifact hash and each run's verdict. You can also hand it a negative spec that injects a known fault, and it will tell you whether the test actually detects that fault. Three clean runs are an execution gate, not a statistical promise about flakiness, and the docs say so plainly.

## Where it fits

If your suite is already green and stable, you do not need this. If your suite is a hand-maintained pile of selectors that a dozen people have patched, and every deploy costs a day of triage, the trade being offered is straightforward. Spend a few minutes and a few cents recording each flow with an agent, in your own words, once. Get back a Playwright spec that runs in CI with nothing extra installed, that checks the effect of each step rather than just the click, that carries no literal ids from the day it was recorded, and that repairs itself with a diff you approve.

The honest caveat is that it is young. The benchmark is four apps, and convergence on the hardest of them landed this week. The failure modes it guards against are the ones those apps exposed. Yours will expose some it has not seen. But the mechanism for handling a new one is a general rule and a unit test, not a special case, and that is the property that decides whether a tool like this is still working in a year.

It installs with `npm install -g sitelooper`. The rest is in the README.
