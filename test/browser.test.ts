/**
 * Browser-backed primitive tests. Need an installed Chrome/Edge, so they are
 * opt-in:  BP_BROWSER_TESTS=1 npx vitest run test/browser.test.ts
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool, fireWhenAttached } from '../src/agent/tools.js';
import { generateScript } from '../src/daemon/codegen.js';
import { candidateExpr, describeTarget, makeLocator } from '../src/daemon/recorder.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;

const fixtureUrl = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture', 'page.html'),
).href;

d('browser primitives (fixture page)', () => {
  let session: BrowserSession;
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());

  beforeAll(async () => {
    process.env.SITELOOPER_HOME = path.join(os.tmpdir(), `bp-browser-test-${Date.now()}`);
    session = new BrowserSession({ session: 'fixture', persist: false });
    const page = await session.getPage();
    await page.goto(fixtureUrl);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
  });

  it('records the session to webm when asked, resolving paths on close', async () => {
    const recorded = new BrowserSession({ session: 'video', persist: false, record: true });
    const page = await recorded.getPage();
    await page.goto(fixtureUrl);
    await page.waitForTimeout(500);

    const videos = await recorded.close();
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatch(/.webm$/);
    expect(fs.statSync(videos[0]).size).toBeGreaterThan(0);
  }, 60_000);

  it('reports no videos when recording is off', async () => {
    expect(await new BrowserSession({ session: 'novideo', persist: false }).close()).toEqual([]);
  });

  it('snapshot returns the form with refs or roles', async () => {
    const out = await run('snapshot', {});
    expect(out.isError).toBe(false);
    expect(out.result).toMatch(/button/i);
    expect(out.result).toMatch(/Submit/);
  });

  it('read what=url publishes the page address without a target; other reads still need one', async () => {
    const page = await session.getPage();
    const url = await run('read', { what: 'url' });
    expect(url.isError).toBe(false);
    expect(JSON.parse(url.result)).toBe(page.url());
    const bare = await run('read', { what: 'text' });
    expect(bare.isError).toBe(true);
    expect(bare.result).toMatch(/needs a target/);
  }, 60_000);

  it('eval is read-only: a click through it is refused and the page is untouched', async () => {
    const before = (await run('read', { target: '#banner', what: 'text' })).result;
    const refused = await run('eval', { expression: "document.querySelector('#submit').click()" });
    expect(refused.isError).toBe(true);
    expect(refused.result).toMatch(/eval is read-only: the expression calls \.click\(\)/);
    expect((await run('read', { target: '#banner', what: 'text' })).result).toBe(before);
    const read = await run('eval', { expression: "document.querySelector('#submit').textContent.trim()" });
    expect(read.isError).toBe(false);
    expect(read.result).toBe('"Submit"');
  }, 60_000);

  it('clicks a control that re-mounts on every render, inside a window, and says so', async () => {
    const page = await session.getPage();
    // a React-style flicker: the button is torn down and rebuilt every 30ms,
    // so no single element ever passes Playwright's stability check
    await page.evaluate(() => {
      const w = window as unknown as { __flick: number; __flickTimer: number };
      w.__flick = 0;
      const host = document.createElement('div');
      host.id = 'flick-host';
      document.body.appendChild(host);
      const mount = () => {
        host.innerHTML = '';
        const b = document.createElement('button');
        b.id = 'flick';
        b.type = 'button';
        b.textContent = 'Flicker';
        b.addEventListener('click', () => { w.__flick++; });
        host.appendChild(b);
      };
      mount();
      w.__flickTimer = window.setInterval(mount, 8);
    });
    const flicks = () => page.evaluate(() => (window as unknown as { __flick: number }).__flick);
    // the window tier on its own: lands a click on the first attached poll
    const direct = await fireWhenAttached(page.locator('#flick'), { timeout: 5_000 });
    expect(direct).toMatch(/dispatched during a re-render window/);
    expect(await flicks()).toBeGreaterThanOrEqual(1);
    // and through the click tool: whichever tier lands it, it lands within
    // one actionability timeout plus the window — never two timeouts
    const started = Date.now();
    const res = await run('click', { target: '#flick' });
    const elapsed = Date.now() - started;
    await page.evaluate(() => window.clearInterval((window as unknown as { __flickTimer: number }).__flickTimer));
    expect(res.isError).toBe(false);
    expect(await flicks()).toBeGreaterThanOrEqual(2);
    expect(elapsed).toBeLessThan(18_000);
    await page.evaluate(() => document.getElementById('flick-host')?.remove());
  }, 60_000);

  it('@ref targets from a snapshot resolve to live elements', async () => {
    const snap = await run('snapshot', {});
    const match = /button "Submit" \[(@e\d+)\]/.exec(snap.result);
    expect(match, 'snapshot should carry refs (needs Playwright 1.61+ ai mode)').toBeTruthy();
    const read = await run('read', { target: match![1], what: 'text' });
    expect(read.isError).toBe(false);
    expect(read.result).toContain('Submit');
  });

  it('fill is React-safe: fires input+change and clear-then-sets number inputs', async () => {
    await run('fill', { target: '#name', value: 'Ada' });
    await run('fill', { target: '#qty', value: '42' });
    const page = await session.getPage();
    const seen = await page.evaluate(() => (window as any).__seenEvents as string[]);
    expect(await page.inputValue('#name')).toBe('Ada');
    expect(await page.inputValue('#qty')).toBe('42'); // not "342" (append bug)
    expect(seen).toContain('name:Ada');
    expect(seen.some((s) => s.startsWith('name:change'))).toBe(true);
    expect(seen).toContain('qty:42');
  });

  it('select matches by label', async () => {
    const out = await run('select', { target: '#colour', option: 'Green' });
    expect(out.result).toContain('g');
    const page = await session.getPage();
    expect(await page.inputValue('#colour')).toBe('g');
  });

  it('wait_for text_contains sees the async banner after click', async () => {
    await run('click', { target: '#submit' });
    const out = await run('wait_for', { target: '#banner', state: 'text_contains', text: 'Saved Ada' });
    expect(out.isError).toBe(false);
  });

  it('dialog_expect accept drives confirm() and captures the message', async () => {
    await run('dialog_expect', { action: 'accept' });
    const out = await run('click', { target: '#confirm-btn' });
    expect(out.result).toContain('Really delete?');
    const page = await session.getPage();
    expect(await page.innerText('#events')).toBe('deleted');
  });

  it('unarmed dialogs default to dismiss and are still captured', async () => {
    const out = await run('click', { target: '#confirm-btn' });
    expect(out.result).toContain('dismiss');
    const page = await session.getPage();
    expect(await page.innerText('#events')).toBe('kept');
  });

  it('read is a cheap spot check', async () => {
    const out = await run('read', { target: '#banner', what: 'text' });
    expect(out.result).toContain('Saved Ada');
  });

  it('a singular read refuses an ambiguous target instead of silently taking the first', async () => {
    // fwod24: `read text h1` matched three headings on Odoo's form, we returned
    // the first, and the recorder stored the locator with no alternates — so
    // both replays met the same ambiguity, had nothing to fall back to, and
    // dropped four of seven steps to the model. Every ACTION already refuses
    // this via Playwright's strict mode; the singular read was the exception.
    const out = await run('read', { target: '#rows .row', what: 'text' });
    expect(out.isError).toBe(true);
    expect(out.result).toContain('matched 3 elements');
    // The error has to teach the way out, or the agent just retries the same thing.
    expect(out.result).toContain('read_all');
    expect(out.result).toContain('@e');
  });

  it('a singular wait refuses an ambiguous target at record time, as a singular read does', async () => {
    // grafana fwgr43: `wait_for h2 state:visible` was recorded against THREE
    // panel headings. Nothing objected at record time; the wait dispatches
    // `.first()`, so it passed — and the ambiguity became the replays' problem
    // (both stopped) and the compiled arm's (0/6). Recording is the last
    // moment the agent can still say which element it meant.
    const out = await run('wait_for', { target: '#rows .row', state: 'visible', timeout_ms: 1_000 });
    expect(out.isError).toBe(true);
    expect(out.result).toContain('matched 3 elements');
    // the way out, or the agent retries the same thing
    expect(out.result).toContain('@e');
    expect(out.result).toContain('state=count');
    const text = await run('wait_for', { target: '#rows .row', state: 'text_contains', text: 'Row', timeout_ms: 1_000 });
    expect(text.isError).toBe(true);
    expect(text.result).toContain('matched 3 elements');
    // ...and naming one of them is accepted
    const one = await run('wait_for', { target: '#rows .row >> nth=0', state: 'visible', timeout_ms: 1_000 });
    expect(one.isError).toBe(false);
  }, 30_000);

  it('wait_for count and an absence wait stay plural — several matches are their point', async () => {
    const counted = await run('wait_for', { target: '#rows .row', state: 'count', count: 3, timeout_ms: 1_000 });
    expect(counted.isError).toBe(false);
    const page = await session.getPage();
    await page.evaluate(() =>
      document.body.insertAdjacentHTML('beforeend', '<div id="ghosts"><p class="ghost" style="visibility:hidden">Ghost A</p><p class="ghost" style="visibility:hidden">Ghost B</p></div>'),
    );
    const gone = await run('wait_for', { target: '.ghost', state: 'hidden', timeout_ms: 2_000 });
    expect(gone.isError).toBe(false);
    await page.evaluate(() => document.getElementById('ghosts')?.remove());
  }, 30_000);

  it('read what=count still answers for a plural target — the question IS how many', async () => {
    const out = await run('read', { target: '#rows .row', what: 'count' });
    expect(out.isError).toBe(false);
    expect(out.result).toBe('3');
  });

  it('read_all returns a value across every matching element in one call', async () => {
    const texts = await run('read_all', { target: '#rows .row', what: 'text' });
    expect(JSON.parse(texts.result)).toEqual(['Row Alpha', 'Row Beta', 'Row Gamma']);
    const attrs = await run('read_all', { target: '#rows .row', what: 'attr', attr: 'data-name' });
    expect(JSON.parse(attrs.result)).toEqual(['alpha', 'beta', 'gamma']);
    const count = await run('read_all', { target: '#rows .row', what: 'count' });
    expect(count.result).toBe('3');
  });

  it('a multi-match action returns a concise disambiguation hint, not a raw strict-mode dump', async () => {
    const out = await run('click', { target: '.dup' });
    expect(out.isError).toBe(true);
    expect(out.result).toMatch(/matched 2 elements/);
    expect(out.result).toMatch(/nth=0/);
    expect(out.result).not.toMatch(/strict mode violation/i);
    // and the caller can act on it in one step
    const fixed = await run('click', { target: '.dup >> nth=0' });
    expect(fixed.isError).toBe(false);
  });

  it('click recovers a non-normally-clickable element via the dispatch fallback', async () => {
    // Zero-size element: normal click times out (~10s) → force throws → dispatch fires the handler.
    const out = await run('click', { target: '#covered-btn' });
    expect(out.isError).toBe(false);
    expect(out.result).toMatch(/dispatched/);
    const page = await session.getPage();
    expect(await page.innerText('#covered-result')).toBe('covered-clicked');
  }, 20_000);

  it('wait_for flags an unsatisfiable condition instead of just timing out silently', async () => {
    const out = await run('wait_for', {
      target: '#rows .row',
      state: 'count',
      count: 99,
      timeout_ms: 600,
    });
    expect(out.isError).toBe(true);
    expect(out.result).toMatch(/never changed/);
  });
});

/**
 * Server response vs live DOM. The page below server-renders an island that its
 * own script then removes — a failed hydration. Reading the live DOM and calling
 * it "the server-rendered HTML" is exactly the conflation fetch_source exists to
 * prevent, so the two views must be observably different here.
 */
d('fetch_source (server response vs live DOM)', () => {
  let session: BrowserSession;
  let origin: string;
  let server: http.Server;
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());

  const BODY = `<!doctype html><title>SSR</title><div id="root">
<p>Hello world</p>
<button id="island">Simulate a submission</button>
</div>
<script>document.getElementById('island').remove()</script>`;

  beforeAll(async () => {
    process.env.SITELOOPER_HOME = path.join(os.tmpdir(), `bp-fetch-test-${Date.now()}`);
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(BODY);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    session = new BrowserSession({ session: 'fetch-src', persist: false });
    await (await session.getPage()).goto(origin);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    await new Promise<void>((r) => server?.close(() => r()));
  });

  it('returns the raw server response, which differs from the hydrated DOM', async () => {
    const live = await run('read', { target: '#island', what: 'count' });
    expect(live.result).toBe('0'); // client script stripped it — nothing to see live

    const source = await run('fetch_source', {});
    expect(source.isError).toBe(false);
    expect(source.result).toMatch(/HTTP 200/);
    expect(source.result).toMatch(/NOT the live DOM/);
    expect(source.result).toContain('Simulate a submission'); // but the server DID send it
  });

  // fwrdj5-n1: three steps on a target that named nothing cost 12.5s each — the
  // action's own 10s actionability timeout, waited out for an element that was
  // never going to exist. Absence is answered in the attach grace instead, and
  // says the action was NOT dispatched, so nothing downstream repeats it blind.
  it('a target that names nothing fails in the attach grace, not the action timeout', async () => {
    const started = Date.now();
    const fill = await run('fill', { target: '#no-such-field', value: 'x' });
    expect(fill.isError).toBe(true);
    expect(fill.result).toMatch(/nothing on the page matches "#no-such-field"/);
    expect(Date.now() - started).toBeLessThan(6_000);

    const refAt = Date.now();
    const click = await run('click', { target: '@e999' });
    expect(click.isError).toBe(true);
    expect(click.result).toMatch(/no element has ref @e999/);
    expect(Date.now() - refAt).toBeLessThan(3_000);

    // Absence is still an ANSWER where it is one.
    expect((await run('read', { target: '#no-such-field', what: 'count' })).result).toBe('0');
  });

  it('contains: narrows a large document to the matching lines', async () => {
    const out = await run('fetch_source', { url: '/', contains: 'Simulate a submission' });
    expect(out.isError).toBe(false);
    expect(out.result).toMatch(/1 line\(s\) contain/);
    expect(out.result).toContain('<button id="island">');
    expect(out.result).not.toContain('Hello world');
  });
});

/**
 * Script recording: the agent acts through snapshot-scoped `@ref` handles, so
 * the value of a recording is entirely in whether the selectors it derives
 * still find the same elements in a fresh run. Each generated locator is
 * therefore replayed against the page here, not just string-matched.
 */
d('script recording (fixture page)', () => {
  let session: BrowserSession;
  const run = (name: string, args: Record<string, unknown>) => executeTool(session, name, args, os.tmpdir());

  beforeAll(async () => {
    process.env.SITELOOPER_HOME = path.join(os.tmpdir(), `bp-script-test-${Date.now()}`);
    session = new BrowserSession({ session: 'rec', persist: false, script: true });
    await (await session.getPage()).goto(fixtureUrl);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
  });

  it('turns @ref actions into durable, verified locators', async () => {
    const recorder = session.script!;
    recorder.beginInstruction('fill the form and submit it');

    const snap = await run('snapshot', {});
    const ref = (pattern: RegExp) => {
      const m = pattern.exec(snap.result);
      expect(m, `snapshot should contain ${pattern}`).toBeTruthy();
      return m![1];
    };
    await run('fill', { target: ref(/textbox "Name" \[(@e\d+)\]/), value: 'Ada' });
    await run('click', { target: ref(/button "Submit" \[(@e\d+)\]/) });
    await run('wait_for', { target: '#banner', state: 'text_contains', text: 'Saved Ada' });

    const src = generateScript(recorder.entries, { session: 'rec' });
    expect(src).toContain("await test.step('fill the form and submit it', async () => {");
    expect(src).toContain("await page.getByRole('button', { name: 'Submit', exact: true }).click();");
    expect(src).toContain("await expect(page.locator('#banner')).toContainText('Saved Ada');");
    // no @ref survived into the generated script — they are meaningless outside the session
    expect(src).not.toMatch(/aria-ref|@e\d+(?![^\n]*TODO)/);
    expect(src).not.toContain('TODO');

    // and the derived locators actually resolve, uniquely, in the live page
    const page = await session.getPage();
    expect(await page.getByRole('button', { name: 'Submit' }).count()).toBe(1);
    expect(await page.getByRole('textbox', { name: 'Name' }).inputValue()).toBe('Ada');
  }, 60_000);

  it('records a select by its visible label, keeping the value only as the fallback', async () => {
    const recorder = session.script!;
    recorder.beginInstruction('pick the green colour');
    // The model selected by VALUE (the app's key for the option). The step is
    // recorded by the label — the term the procedure has provenance for.
    const out = await run('select', { target: '#colour', option: 'g' });
    expect(out.result).toContain('label="Green"');
    const step = recorder.entries.filter((e) => e.k === 'step' && e.tool === 'select').at(-1)!;
    expect(step.args.option).toBe('Green');
    expect(step.args.optionValue).toBe('g');
    // A label form that no longer matches falls back to the recorded value.
    const back = await run('select', { target: '#colour', option: 'Rouge', optionValue: 'r' });
    expect(back.result).toContain('label="Red"');
    expect(await (await session.getPage()).inputValue('#colour')).toBe('r');
    const again = recorder.entries.filter((e) => e.k === 'step' && e.tool === 'select').at(-1)!;
    expect(again.args.option).toBe('Red');
  }, 60_000);

  it('disambiguates same-named elements with nth() instead of a wrong match', async () => {
    const recorder = session.script!;
    const snap = await run('snapshot', {});
    const dupB = /button "Dup B" \[(@e\d+)\]/.exec(snap.result)?.[1];
    expect(dupB).toBeTruthy();
    await run('click', { target: dupB! });

    const last = recorder.entries.at(-1);
    expect(last?.k).toBe('step');
    const expr = last!.k === 'step' ? last!.locators.target.expr : '';
    expect(last!.k === 'step' && last!.locators.target.verified).toBe(true);
    // "Dup B" is unique by name; the point is the recorded locator finds exactly it
    const page = await session.getPage();
    const derived = expr.includes('getByRole')
      ? page.getByRole('button', { name: 'Dup B' })
      : page.locator('.dup >> nth=1');
    expect(await derived.count()).toBe(1);
    expect(await derived.innerText()).toBe('Dup B');
  }, 60_000);

  it('a role candidate matches its name exactly — "Edit" never resolves to a sibling "Exit edit"', async () => {
    const page = await session.getPage();
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<button id="exit-edit" type="button">Exit edit</button>'));
    // the fixture has two row "Edit" buttons; substring matching would make it three
    expect(await makeLocator(page, { kind: 'role', role: 'button', name: 'Edit' }).count()).toBe(2);
    expect(await makeLocator(page, { kind: 'role', role: 'button', name: 'Exit edit' }).count()).toBe(1);
    expect(candidateExpr({ kind: 'role', role: 'button', name: 'Edit' })).toBe("page.getByRole('button', { name: 'Edit', exact: true })");
    await page.evaluate(() => document.getElementById('exit-edit')?.remove());
  }, 60_000);

  // fwkb24: kanboard's column header is `<a>Ready <i class="fa fa-caret-down"></i></a>`.
  // The DOM walk records `link "Ready"`; Chromium's accessible name is
  // "Ready " — the icon font's glyph, a private-use code point, arrives
  // through CSS-generated content — and `exact: true` on 'Ready' found nothing,
  // so every synthesized column read missed on both replays. The name matcher
  // tolerates whitespace and glyphs at the edges, and nothing else.
  it('a role candidate still matches a name the browser decorates with an icon glyph or a stray space', async () => {
    const page = await session.getPage();
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.id = 'glyph-style';
      style.textContent = '.caret::before { content: "\\f0d7"; }';
      document.head.append(style);
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="glyph-fixture"><a id="col-ready" href="#">Ready <i class="caret"></i></a><a id="col-ready-q" href="#">Ready?</a><a id="col-done" href="#">  Done\n </a></div>',
      );
    });
    // the glyph and the trailing space are in the accessible name; the recorded name has neither
    expect(await makeLocator(page, { kind: 'role', role: 'link', name: 'Ready' }).count()).toBe(1);
    expect(await makeLocator(page, { kind: 'role', role: 'link', name: 'Done' }).count()).toBe(1);
    // ...but a letter, a digit or punctuation beside the name is a different name
    expect(await makeLocator(page, { kind: 'role', role: 'link', name: 'Ready?' }).count()).toBe(1);
    expect(await page.getByRole('link', { name: 'Ready', exact: true }).count()).toBe(0); // what exact:true alone sees
    await page.evaluate(() => {
      document.getElementById('glyph-fixture')?.remove();
      document.getElementById('glyph-style')?.remove();
    });
  }, 60_000);

  it('describes a ref whose element vanished from the snapshot that minted it, instead of recording nothing', async () => {
    const page = await session.getPage();
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<button id="ephemeral" type="button">Pick TestData</button>'));
    const snap = await run('snapshot', {});
    const ref = /button "Pick TestData" \[(@e\d+)\]/.exec(snap.result)?.[1];
    expect(ref).toBeTruthy();
    // the picker item re-renders away before the recorder gets to it
    await page.evaluate(() => document.getElementById('ephemeral')?.remove());
    const described = await describeTarget(page, ref!, true);
    expect(described.verified).toBe(false);
    expect(described.expr).toBe("page.getByRole('button', { name: 'Pick TestData', exact: true })");
    expect(described.chain).toEqual([{ kind: 'role', role: 'button', name: 'Pick TestData' }]);
  }, 60_000);

  // fwop3-n1 clicked the "Relations" tab as `aria-ref=e423`; described as a raw
  // selector it became the stored primary css candidate, and both replays
  // clicked whatever held e423 in their own last snapshot (the Wikis tab).
  it('describes an aria-ref=eNN target as the element it names, never as a stored selector', async () => {
    const page = await session.getPage();
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div id="tabs-fixture" role="tablist"><a role="tab" href="#r">Relations</a><a role="tab" href="#w">Wikis</a></div>'));
    const snap = await run('snapshot', {});
    const ref = /tab "Relations" \[@(e\d+)\]/.exec(snap.result)?.[1];
    expect(ref).toBeTruthy();
    const described = await describeTarget(page, `aria-ref=${ref}`, true);
    expect(described.verified).toBe(true);
    expect(described.chain?.some((c) => c.kind === 'css' && /aria-ref/.test(c.selector))).toBe(false);
    expect(described.chain).toContainEqual({ kind: 'role', role: 'tab', name: 'Relations' });
    await page.evaluate(() => document.getElementById('tabs-fixture')?.remove());
  }, 60_000);

  it('records a raw CSS target verbatim and flags it when it is not unique', async () => {
    const recorder = session.script!;
    await run('read', { target: '.dup', what: 'count' });
    const step = recorder.entries.at(-1);
    expect(step!.k === 'step' && step!.locators.target).toEqual({
      expr: "page.locator('.dup')",
      verified: false, // two matches — the generated script says so rather than guessing
      raw: '.dup',
      chain: [{ kind: 'css', selector: '.dup' }],
    });
  }, 30_000);

  it('records the index the dispatch used, and a full chain, when the step acts on ONE of several matches', async () => {
    // fwgr43's defect at its source: `wait_for h2 state:visible` matched three
    // panels, the recorder saw a count that was not 1 and bailed BEFORE
    // deriving any rung — so the stored locator was the bare tag with no index
    // and no alternates, which no replay could resolve to one element. A step
    // whose dispatch acts on match 0 (tools.ts waitFor `.first()`) is
    // describable: it acted on an element, and that element has a text, a path
    // and a place like any other.
    const page = await session.getPage();
    await page.evaluate(() =>
      document.body.insertAdjacentHTML('beforeend', '<div id="ghosts"><p class="ghost" style="visibility:hidden">Ghost A</p><p class="ghost" style="visibility:hidden">Ghost B</p></div>'),
    );
    const recorder = session.script!;
    const out = await run('wait_for', { target: '.ghost', state: 'hidden', timeout_ms: 2_000 });
    expect(out.isError).toBe(false);
    const step = recorder.entries.at(-1);
    const described = step!.k === 'step' ? step!.locators.target : undefined;
    expect(described!.verified).toBe(true);
    expect(described!.expr).toBe("page.locator('.ghost').nth(0)");
    // the index the dispatch used, on the primary...
    expect(described!.chain![0]).toEqual({ kind: 'css', selector: '.ghost', nth: 0 });
    // ...and the rungs the unique-match branch derives, so replay has
    // somewhere to go when the primary stops matching
    expect(described!.chain!.length).toBeGreaterThan(1);
    // Some rung that is not the plural selector itself. WHICH rungs exist is
    // the page's business — these ghosts are `visibility:hidden`, so they have
    // no visible text to be named by, and the derived rungs are a path and a
    // place. What matters is that the bail no longer left the chain at one.
    expect(described!.chain!.slice(1).every((c) => JSON.stringify(c) !== JSON.stringify({ kind: 'css', selector: '.ghost' }))).toBe(true);

    // A dispatch that spans every match keeps the bare plural selector with no
    // index: reading all three rows is what read_all is for.
    await run('read_all', { target: '.ghost', what: 'text' });
    const plural = recorder.entries.at(-1);
    expect(plural!.k === 'step' && plural!.locators.target).toEqual({
      expr: "page.locator('.ghost')",
      verified: false,
      raw: '.ghost',
      chain: [{ kind: 'css', selector: '.ghost' }],
    });
    await page.evaluate(() => document.getElementById('ghosts')?.remove());
  }, 30_000);

  it('accepts the name the [state: …] diff gives a field, even where the label text is not the accessible name', async () => {
    const page = await session.getPage();
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.id = 'req';
      box.innerHTML = '<label for="req-name">Part name <span aria-hidden="true">*</span></label><input id="req-name">';
      document.body.appendChild(box);
    });
    // The diff names this field `textbox "Part name *"` (its label's text); the role engine knows it as "Part name".
    const byDiffName = await run('fill', { target: 'role=textbox[name="Part name *"]', value: 'Bolt' });
    expect(byDiffName.isError).toBeFalsy();
    expect(await page.inputValue('#req-name')).toBe('Bolt');
    const byAccessibleName = await run('fill', { target: 'role=textbox[name="Part name"]', value: 'Nut' });
    expect(byAccessibleName.isError).toBeFalsy();
    expect(await page.inputValue('#req-name')).toBe('Nut');
    await page.evaluate(() => document.getElementById('req')?.remove());
  }, 30_000);

  it('runs a batch step written flat, with its arguments beside the tool name', async () => {
    const page = await session.getPage();
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.id = 'flat';
      box.innerHTML = '<label for="flat-a">Flat</label><input id="flat-a"><input id="flat-b">';
      document.body.appendChild(box);
    });
    const out = await run('batch', {
      steps: [
        { tool: 'fill', target: '#flat-a', value: 'one' },
        { tool: 'fill', args: { target: '#flat-b', value: 'two' } },
      ],
    });
    expect(out.isError).toBeFalsy();
    expect(await page.inputValue('#flat-a')).toBe('one');
    expect(await page.inputValue('#flat-b')).toBe('two');
    await page.evaluate(() => document.getElementById('flat')?.remove());
  }, 30_000);

  it('takes a screenshot as a batch step instead of refusing the batch', async () => {
    const page = await session.getPage();
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.id = 'shot';
      box.innerHTML = '<label for="shot-a">Note</label><input id="shot-a">';
      document.body.appendChild(box);
    });
    const out = await run('batch', {
      steps: [
        { tool: 'fill', args: { target: '#shot-a', value: 'x' } },
        { tool: 'screenshot', args: {} },
      ],
    });
    expect(out.isError).toBeFalsy();
    expect(out.result).toMatch(/^2\. screenshot .*→ screenshot saved: .+/m);
    await page.evaluate(() => document.getElementById('shot')?.remove());
  }, 30_000);

  it('drops actions that failed — a recording is of what worked', async () => {
    const recorder = session.script!;
    const before = recorder.entries.length;
    const out = await run('read', { target: '#does-not-exist', what: 'text' });
    expect(out.isError).toBe(true);
    expect(recorder.entries.length).toBe(before);
  }, 30_000);
});
