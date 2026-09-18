/**
 * Site B of PLAN-jev.md: inline replay healing.
 *
 * Two halves, deliberately kept apart. `unhealableWhy` and the replay seam are
 * about what the runner will ACT on, and are tested with no System One tier at
 * all — a plain function handed in as `ReplayOptions.heal` — because the seam
 * has to be neutral and the cheapest proof of that is that these tests never
 * mention Jev. The healer itself runs against the same SCRIPTED client site A
 * uses (CI has no TypeSafe key, and the tier's absence must be
 * indistinguishable from its silence).
 */
import { describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright-core';
import { parseAnswers, type AskResult, type Entry, type Questions, type SystemOne } from '../src/agent/system-one.js';
import type { SystemOneDecision } from '../src/agent/system-one.js';
import { HEAL_TICKET_ROWS, REPLAY_HEAL_SITE, REPLAY_HEAL_VERDICT_SITE, healGate, inlineHealer } from '../src/skills/heal-jev.js';
import { healedProposer, triage, type DriftTicket, type SnapshotRow } from '../src/skills/repair.js';
import { replaySkill, setInlineHealer, unhealableWhy, type HealProposal, type HealRequest, type InlineHealer } from '../src/skills/replay.js';
import type { LocatorCandidate } from '../src/daemon/recorder.js';
import type { Skill, SkillStep } from '../src/skills/store.js';

// Every case here exercises what happens AFTER the chain has missed; the
// resolver's wait window would otherwise be paid on each one.
process.env.SITELOOPER_RESOLVE_WAIT_MS = '0';

// --- the fake page -----------------------------------------------------------

/**
 * The minimal Page surface this path touches: a url, `settleDom`'s evaluate,
 * and locators whose count comes from a map (so a proposal can be made to
 * match nothing, one thing, or two). Rows for `interactiveRows` come back from
 * the same evaluate, which is the only other caller on this path.
 */
function fakePage(state: { url: string }, counts: Record<string, number> = {}, rows: SnapshotRow[] = [], kind: { role: string | null; tag: string } | null = null): Page {
  const loc = (key: string): Locator =>
    ({
      count: async () => counts[key] ?? 0,
      first: () => loc(key),
      evaluate: async () => kind,
      textContent: async () => '',
    }) as unknown as Locator;
  return {
    url: () => state.url,
    evaluate: async () => rows,
    getByTestId: (value: string) => loc(`testid:${value}`),
    getByRole: (role: string) => loc(`role:${role}`),
    getByLabel: () => loc('label'),
    getByPlaceholder: () => loc('placeholder'),
    getByText: () => loc('text'),
    locator: () => loc('css'),
  } as unknown as Page;
}

const ADD_PART: LocatorCandidate = { kind: 'testid', attr: 'data-testid', value: 'part-attach' };

/** One click step whose recorded chain cannot resolve on the fake page. */
function clickSkill(over: Partial<SkillStep> = {}): Skill {
  return {
    id: 's_heal',
    origin: 'http://h:1',
    template: 'add a part',
    params: {},
    preconditions: { urlPattern: 'http://h:1/t/1' },
    steps: [
      {
        tool: 'click',
        args: { target: '@e1' },
        locators: { target: [{ kind: 'testid', attr: 'data-testid', value: 'add-part' } as LocatorCandidate] },
        expect: { urlPattern: 'http://h:1/t/1' },
        ...over,
      } as SkillStep,
    ],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 's', instruction: 'i', created: 't' },
  } as Skill;
}

/** A healer that always offers ADD_PART, recording what it was asked and told. */
function scriptedHealer(rows: SnapshotRow[] = [], settled: boolean[] = []): InlineHealer & { asked: HealRequest[] } {
  const asked: HealRequest[] = [];
  const heal = async (req: HealRequest): Promise<HealProposal | null> => {
    asked.push(req);
    return {
      candidate: ADD_PART,
      note: 'healed inline: the step ran on getByTestId("part-attach")',
      rows,
      settled: (ok) => settled.push(ok),
    };
  };
  return Object.assign(heal, { asked });
}

// --- the blast-radius policy --------------------------------------------------

const step = (over: Partial<SkillStep>): SkillStep => ({ tool: 'click', args: {}, locators: {}, ...over }) as SkillStep;

describe('unhealableWhy — the blast radius', () => {
  it('heals a read, whose worst case is a value the step then checks like any other', () => {
    expect(unhealableWhy(step({ tool: 'read' }), 'target', '4')).toBeNull();
    expect(unhealableWhy(step({ tool: 'read_all' }), 'target', '4')).toBeNull();
  });

  it('heals a write into one control, whose own expectation echoes what it wrote', () => {
    for (const tool of ['fill', 'type', 'select', 'check', 'uncheck']) {
      expect(unhealableWhy(step({ tool }), 'target', '4')).toBeNull();
    }
  });

  it('heals a click ONLY when the recording left something that would contradict a wrong one', () => {
    expect(unhealableWhy(step({ expect: { urlPattern: 'http://h:1/x' } }), 'target', '4')).toBeNull();
    expect(unhealableWhy(step({ expect: { addedContains: ['- dialog "Add part"'] } }), 'target', '4')).toBeNull();
    expect(unhealableWhy(step({ effect: { kind: 'popup' } as SkillStep['effect'] }), 'target', '4')).toBeNull();
    expect(unhealableWhy(step({}), 'target', '4')).toMatch(/recorded nothing that would verify/);
  });

  it('a minting step needs the url, not merely some added lines', () => {
    const lines = { addedContains: ['- row "RD-1013"'] };
    expect(unhealableWhy(step({ mints: { at: 'p2' }, expect: lines }), 'target', '4')).toMatch(/record into existence/);
    expect(unhealableWhy(step({ mints: { at: 'p2' }, expect: { ...lines, urlPattern: 'http://h:1/t/:id' } }), 'target', '4')).toBeNull();
  });

  it('refuses a loop body, a framed target, an unproven read and an unknown tool', () => {
    expect(unhealableWhy(step({ tool: 'read' }), 'target', '9.2.1')).toMatch(/folded loop/);
    expect(unhealableWhy(step({ tool: 'read', contexts: { target: { frame: [{ selectors: ['iframe#f'] }] } } as unknown as SkillStep['contexts'] }), 'target', '4')).toMatch(/recorded inside/);
    expect(unhealableWhy(step({ tool: 'read', unproven: true }), 'target', '4')).toMatch(/synthesized read/);
    expect(unhealableWhy(step({ tool: 'goto' }), 'target', '4')).toMatch(/is not one inline healing acts for/);
  });
});

// --- the replay seam ----------------------------------------------------------

describe('the replay seam', () => {
  it('with no healer, a dead chain fails the step exactly as it did before', async () => {
    const state = { url: 'http://h:1/t/1' };
    const res = await replaySkill(clickSkill(), {}, { page: fakePage(state), exec: async () => ({ result: 'ok' }) });
    expect(res.ok).toBe(false);
    expect(res.failedAt).toBe(1);
    expect(res.reason).toMatch(/no element matched any known locator/);
    expect(res.healed).toBeUndefined();
    expect(res.fallthroughs).toBe(0);
    expect(res.misses[0].used).toBeNull();
  });

  it('heals a renamed control and the replay continues', async () => {
    const state = { url: 'http://h:1/t/1' };
    const rows: SnapshotRow[] = [{ tag: 'button', testid: 'part-attach', text: 'Attach part' }];
    const settled: boolean[] = [];
    const heal = scriptedHealer(rows, settled);
    const clicked: string[] = [];
    const res = await replaySkill(clickSkill(), {}, {
      page: fakePage(state, { 'testid:part-attach': 1 }),
      heal,
      exec: async (tool) => {
        clicked.push(tool);
        return { result: 'ok' };
      },
    });
    expect(res.ok).toBe(true);
    expect(clicked).toEqual(['click']);
    expect(heal.asked[0].key).toBe('target');
    expect(heal.asked[0].chain).toHaveLength(1);
    // The step's own gates accepted it, so the heal is labelled right.
    expect(settled).toEqual([true]);
    expect(res.healed).toEqual([
      { step: '1', key: 'target', locator: "page.getByTestId('part-attach')", note: expect.stringContaining('healed inline'), verified: true },
    ]);
  });

  it('the miss it files carries the proposal and the rows, and `used` reads like any fallback', async () => {
    const state = { url: 'http://h:1/t/1' };
    const rows: SnapshotRow[] = [{ tag: 'button', testid: 'part-attach', text: 'Attach part' }];
    const res = await replaySkill(clickSkill(), {}, {
      page: fakePage(state, { 'testid:part-attach': 1 }),
      heal: scriptedHealer(rows),
      exec: async () => ({ result: 'ok' }),
    });
    expect(res.fallthroughs).toBe(1);
    expect(res.misses).toHaveLength(1);
    expect(res.misses[0]).toMatchObject({ step: '1', key: 'target', healed: true, proposal: ADD_PART, rows });
    expect(res.misses[0].primary).toBe("page.getByTestId('add-part')");
    expect(res.misses[0].used).toBe("page.getByTestId('part-attach')");
  });

  it('a proposal that matches two elements is refused — a locator naming several names none', async () => {
    const state = { url: 'http://h:1/t/1' };
    const settled: boolean[] = [];
    const res = await replaySkill(clickSkill(), {}, {
      page: fakePage(state, { 'testid:part-attach': 2 }),
      heal: scriptedHealer([], settled),
      exec: async () => ({ result: 'ok' }),
    });
    expect(res.ok).toBe(false);
    expect(res.healed).toBeUndefined();
    expect(res.fallthroughs).toBe(0);
    expect(settled).toEqual([false]);
    expect(res.warnings.join(' ')).toMatch(/matches 2 element\(s\).*refused/);
  });

  it('a healer that declines, or throws, leaves the step exactly where it was', async () => {
    for (const heal of [async () => null, async () => { throw new Error('429'); }] as InlineHealer[]) {
      const res = await replaySkill(clickSkill(), {}, { page: fakePage({ url: 'http://h:1/t/1' }), heal, exec: async () => ({ result: 'ok' }) });
      expect(res.ok).toBe(false);
      expect(res.failedAt).toBe(1);
      expect(res.healed).toBeUndefined();
    }
  });

  it('a step the policy refuses is never offered to the healer, and says why', async () => {
    const heal = scriptedHealer();
    // A click with nothing recorded to verify it: the case that must still
    // cost a model recovery.
    const res = await replaySkill(clickSkill({ expect: undefined }), {}, {
      page: fakePage({ url: 'http://h:1/t/1' }, { 'testid:part-attach': 1 }),
      heal,
      exec: async () => ({ result: 'ok' }),
    });
    expect(heal.asked).toHaveLength(0);
    expect(res.ok).toBe(false);
    expect(res.warnings.join(' ')).toMatch(/was not healed inline — the step recorded nothing that would verify/);
  });

  it("the step's own checks refusing a healed locator falls through, and the recovery is told", async () => {
    // The click lands but the url never becomes what the step recorded, so the
    // url-effect gate stops the step — the ordinary verifier, indifferent to
    // where the locator came from.
    const state = { url: 'http://h:1/t/1' };
    const settled: boolean[] = [];
    const skill = clickSkill({ expect: { urlPattern: 'http://h:1/t/1/parts/new' } });
    const res = await replaySkill(skill, {}, {
      page: fakePage(state, { 'testid:part-attach': 1 }),
      heal: scriptedHealer([], settled),
      exec: async () => ({ result: 'ok' }),
    });
    expect(res.ok).toBe(false);
    expect(settled).toEqual([false]);
    expect(res.healed?.[0].verified).toBe(false);
    expect(res.warnings.join(' ')).toMatch(/the inline heal page\.getByTestId\('part-attach'\) ran and the step's own checks then refused it/);
    const { renderReplay } = await import('../src/skills/replay.js');
    expect(renderReplay(skill, res)).toMatch(/ALREADY TRIED and refused/);
  });

  it('the process-wide healer is used when the caller passes none, and unsetting it restores the old path', async () => {
    const heal = scriptedHealer();
    setInlineHealer(heal);
    try {
      const res = await replaySkill(clickSkill(), {}, {
        page: fakePage({ url: 'http://h:1/t/1' }, { 'testid:part-attach': 1 }),
        exec: async () => ({ result: 'ok' }),
      });
      expect(res.ok).toBe(true);
      expect(heal.asked).toHaveLength(1);
    } finally {
      setInlineHealer(null);
    }
    const again = await replaySkill(clickSkill(), {}, { page: fakePage({ url: 'http://h:1/t/1' }), exec: async () => ({ result: 'ok' }) });
    expect(again.ok).toBe(false);
    expect(heal.asked).toHaveLength(1);
  });
});

// --- the healer ---------------------------------------------------------------

/** The System One twin of loop.test's scriptedProvider (see test/repair-jev.test.ts). */
function scriptedSystemOne(answer: (state: Entry, questions: Questions, n: number) => Record<string, unknown>): SystemOne & { asks: number } {
  const self = {
    model: 'jev-test',
    asks: 0,
    async ask<Q extends Questions>(state: Entry, questions: Q): Promise<AskResult<Q>> {
      const answers = answer(state, questions, ++self.asks);
      return { ...parseAnswers(questions, { model: 'jev-test', answers, usage: { input_tokens: 10, output_tokens: 0 } }), ms: 1 };
    },
  };
  return self;
}

/**
 * Answer whatever was asked: one-request rounds ask pick/pickReversed/gone,
 * a tournament shard asks `pick` alone, and `parseAnswers` is strict about
 * getting exactly the keys of the question it was given.
 */
const agrees = (label: string, confidence: number) => (_state: Entry, questions: Questions) =>
  Object.fromEntries(
    Object.entries(questions).map(([key, q]) => {
      if (key === 'gone') return [key, { type: 'noul', noul: 0.02 }];
      // A tournament shard's ballot holds only its own slice of the rows, so
      // `label` is not on it; vote for that group's first element instead —
      // which is what puts one finalist per shard into the final round.
      const options = Object.keys((q as { criteria: Record<string, unknown> }).criteria);
      return [key, { type: 'choice', choice: options.includes(label) ? label : options[0], confidence, probabilities: {} }];
    }),
  );

const ROWS: SnapshotRow[] = [
  { tag: 'button', text: 'Cancel' },
  { tag: 'button', testid: 'part-attach', text: 'Attach part' },
];

function healRequest(page: Page): HealRequest {
  return {
    skill: clickSkill(),
    step: clickSkill().steps[0],
    tag: '1',
    key: 'target',
    // A role candidate, so `recordedKindOf` can say what kind of control
    // the recording named — which is what the kind check below is made of.
    chain: [{ kind: 'role', role: 'button', name: 'Add part' }] as LocatorCandidate[],
    page,
  };
}

describe('inlineHealer', () => {
  it('acts only above its OWN gate, which is stricter than the post-session proposer\'s 0.85', async () => {
    expect(healGate()).toBeGreaterThan(0.85);
    const page = fakePage({ url: 'http://h:1/t/1' }, { 'testid:part-attach': 1 }, ROWS, { role: 'button', tag: 'button' });
    const log: SystemOneDecision[] = [];
    const below = await inlineHealer(scriptedSystemOne(agrees('e1', 0.86)), (d) => log.push(d))(healRequest(page));
    expect(below).toBeNull();
    expect(log.map((d) => [d.site, d.outcome])).toEqual([[REPLAY_HEAL_SITE, 'deferred']]);

    const above = await inlineHealer(scriptedSystemOne(agrees('e1', 0.97)))(healRequest(page));
    expect(above?.candidate).toEqual({ kind: 'testid', attr: 'data-testid', value: 'part-attach' });
  });

  it('refuses its own answer when it names two elements, and logs the refusal as a verdict', async () => {
    const page = fakePage({ url: 'http://h:1/t/1' }, { 'testid:part-attach': 2 }, ROWS, { role: 'button', tag: 'button' });
    const log: SystemOneDecision[] = [];
    const out = await inlineHealer(scriptedSystemOne(agrees('e1', 0.99)), (d) => log.push(d))(healRequest(page));
    expect(out).toBeNull();
    expect(log.map((d) => d.site)).toEqual([REPLAY_HEAL_SITE, REPLAY_HEAL_VERDICT_SITE]);
    expect(log[1]).toMatchObject({ verified: false, why: expect.stringContaining('matched 2 element(s)') });
  });

  it('refuses a proposal of the wrong kind, as patchSegment would after the fact', async () => {
    const page = fakePage({ url: 'http://h:1/t/1' }, { 'testid:part-attach': 1 }, ROWS, { role: 'textbox', tag: 'input' });
    const log: SystemOneDecision[] = [];
    const out = await inlineHealer(scriptedSystemOne(agrees('e1', 0.99)), (d) => log.push(d))(healRequest(page));
    expect(out).toBeNull();
    expect(log[1]).toMatchObject({ site: REPLAY_HEAL_VERDICT_SITE, verified: false, why: expect.stringContaining('is a textbox') });
  });

  it('pairs the decision with the verdict the step later gives it, keyed by skill/step/key', async () => {
    const page = fakePage({ url: 'http://h:1/t/1' }, { 'testid:part-attach': 1 }, ROWS, { role: 'button', tag: 'button' });
    const log: SystemOneDecision[] = [];
    const out = await inlineHealer(scriptedSystemOne(agrees('e1', 0.99)), (d) => log.push(d))(healRequest(page));
    out!.settled!(true);
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ site: REPLAY_HEAL_SITE, outcome: 'acted', chosen: 'e1' });
    expect(log[1]).toMatchObject({ site: REPLAY_HEAL_VERDICT_SITE, verified: true, detail: { skill: 's_heal', step: '1', key: 'target' } });
  });

  it('carries the live rows out for the ticket, bounded', async () => {
    // Past MAX_ROWS_PER_STATE, so this also walks the tournament reduce.
    const many: SnapshotRow[] = Array.from({ length: HEAL_TICKET_ROWS + 20 }, (_, i) => ({ tag: 'button', text: `b${i}` }));
    const page = fakePage({ url: 'http://h:1/t/1' }, { 'role:button': 1 }, many, { role: 'button', tag: 'button' });
    const out = await inlineHealer(scriptedSystemOne(agrees('e0', 0.99)))(healRequest(page));
    expect(out?.rows).toHaveLength(HEAL_TICKET_ROWS);
  });

  it('a page with nothing of the recorded kind is not asked about at all', async () => {
    const page = fakePage({ url: 'http://h:1/t/1' }, {}, [{ tag: 'input', type: 'text', label: 'Search' }], null);
    const client = scriptedSystemOne(agrees('e0', 0.99));
    expect(await inlineHealer(client)(healRequest(page))).toBeNull();
    expect(client.asks).toBe(0);
  });
});

// --- evidence, not mutation ---------------------------------------------------

describe('healedProposer', () => {
  const ticket = (over: Partial<DriftTicket>): DriftTicket =>
    ({ flow: 'f', step: '01', skill: 's_heal', similarity: 1, missedLocator: 'x', fallbackUsed: null, recovered: false, ...over }) as DriftTicket;
  const ctx = (t: DriftTicket) => ({ ticket: t }) as Parameters<ReturnType<typeof healedProposer>>[0];

  it('hands the drain the locator the run already proved, so no model re-derives it', async () => {
    expect(await healedProposer()(ctx(ticket({ healed: true, proposal: ADD_PART })))).toEqual(ADD_PART);
  });

  it('says nothing about a heal inside a step that then went to recovery, or about an ordinary ticket', async () => {
    expect(await healedProposer()(ctx(ticket({ healed: true, proposal: ADD_PART, recovered: true })))).toBeNull();
    expect(await healedProposer()(ctx(ticket({})))).toBeNull();
  });

  it('triage sends a healed ticket to patch-segment, never to promote-fallback', () => {
    // Its `fallbackUsed` never was a rung of the chain, so there is no index
    // to promote — promoteFallback would refuse it and the repair would be
    // lost to a "no longer maps onto the stored skill" skip.
    const healed = ticket({ healed: true, proposal: ADD_PART, fallbackUsed: "page.getByTestId('part-attach')" });
    expect(triage([healed]).map((a) => a.kind)).toEqual(['patch-segment']);
    const ordinary = ticket({ fallbackUsed: "page.getByRole('button', { name: 'Add part' })" });
    expect(triage([ordinary]).map((a) => a.kind)).toEqual(['promote-fallback']);
  });
});
