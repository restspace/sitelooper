/**
 * compile-g1 item 2, the replay half. erpnext fwen9-luna s_1c570b steps 3 and
 * 16: the synthesized `text "{{v4}}"` primary ("Bench Widget") matched several
 * elements on n2, n3, the spec and all three readiness runs; a positional css
 * took the read every time, and replay banked nothing because the winner was
 * positional (the fwrd26l rule), so `retired()` never moved the primary.
 *
 * Now a NAMED candidate that missed as AMBIGUOUS above a positional winner is
 * banked as a miss — and only that: the winner gets no hit, and a named
 * candidate that was merely absent is not banked.
 *
 *   BP_BROWSER_TESTS=1 npx vitest run test/ambiguous-evidence.browser.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import type { LocatorCandidate } from '../src/daemon/recorder.js';
import { recordCandidateEvidence, retired } from '../src/skills/repair.js';
import { replaySkill } from '../src/skills/replay.js';
import { SkillStore, type Skill } from '../src/skills/store.js';

const enabled = process.env.BP_BROWSER_TESTS === '1';
const d = enabled ? describe : describe.skip;
const ORIGIN = 'http://amb.test';

const skillOf = (chain: LocatorCandidate[]): Skill =>
  ({
    id: 's_amb',
    origin: ORIGIN,
    template: 'read the item',
    params: { v4: { example: 'Bench Widget', usedIn: [1] } },
    preconditions: { urlPattern: `${ORIGIN}/` },
    steps: [{ tool: 'read', args: { target: '(read-back)', what: 'text', scopedBy: 'v4' }, label: 'item_1', locators: { target: chain } }],
    stats: { uses: 1, successes: 1, partial: 0, created: '', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 's', instruction: 'read the item', created: '' },
  }) as unknown as Skill;

/** The grid as fwen9's saved order drew it: the item's name in its code AND name columns. */
const GRID = (item: string) => `<html><body><div class="grid">
  <div class="row"><div class="code"><a href="#i1">${item}</a></div><div class="name">${item}</div></div>
  <div class="row"><div class="code"><a href="#i2">Bench Gadget</a></div><div class="name">Bench Gadget</div></div>
</div></body></html>`;

d('candidate evidence beneath a positional winner', () => {
  let session: BrowserSession;
  beforeAll(async () => {
    session = new BrowserSession({ session: `ambev-${Date.now()}`, persist: false });
  });
  afterAll(async () => {
    await session?.close();
  });

  const replayOn = async (html: string, chain: LocatorCandidate[], v4: string) => {
    const page = await session.getPage();
    await page.unrouteAll().catch(() => undefined);
    await page.route(`${ORIGIN}/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await page.goto(`${ORIGIN}/`);
    return replaySkill(skillOf(chain), { v4 }, {
      page,
      exec: async (_tool, _args, resolved) => ({ result: JSON.stringify(await resolved.target.first().innerText()) }),
    });
  };

  const positional: LocatorCandidate = { kind: 'css', selector: 'div.grid > div:nth-of-type(1) > div:nth-of-type(1) > a' };

  it('banks a miss for an ambiguous named primary, and no hit for the positional winner', async () => {
    const out = await replayOn(GRID('Bench Widget'), [{ kind: 'text', text: '{{v4}}' }, positional], 'Bench Widget');
    expect(out.ok, JSON.stringify(out.warnings)).toBe(true);
    expect(out.values.item_1).toBe('Bench Widget');
    expect(out.candidateEvidence).toEqual([{ step: '1', key: 'target', missed: [0] }]);

    // Folded twice (two runs), the primary is retired; the positional path
    // has no hit, so nothing confirmed "whatever sorted into that slot".
    const store = new SkillStore();
    store.put(skillOf([{ kind: 'text', text: '{{v4}}' }, positional]));
    recordCandidateEvidence(store, 's_amb', out.candidateEvidence);
    recordCandidateEvidence(store, 's_amb', out.candidateEvidence);
    const chain = store.get('s_amb')!.steps[0].locators.target!;
    expect(retired(chain[0])).toBe(true);
    expect(chain[1].seen).toBeUndefined();
  }, 30_000);

  it('banks nothing when the named candidate was absent rather than ambiguous', async () => {
    // Bench Widget is gone from the page: the positional path may stand on another record.
    const out = await replayOn(GRID('Bench Thing'), [{ kind: 'text', text: '{{v4}}' }, positional], 'Bench Widget');
    expect(out.candidateEvidence).toEqual([]);
  }, 30_000);

  it('a unique named primary still wins outright, with nothing to bank', async () => {
    const page = `<html><body><div class="grid"><div class="row"><div class="code"><a href="#i1">Bench Widget</a></div></div></div></body></html>`;
    const out = await replayOn(page, [{ kind: 'text', text: '{{v4}}' }, positional], 'Bench Widget');
    expect(out.ok).toBe(true);
    expect(out.candidateEvidence).toEqual([]);
    expect(out.fallthroughs).toBe(0);
  }, 30_000);
});
