/**
 * What a run WATCHED a url position hold must outlive the run.
 *
 * fwgr41-n2 replayed 06-find, its step 6 reported
 * "url segment(s) differ from recorded (afyd7g0300dfkc→bfyd7wj0ceolcf) —
 * treated as volatile", and step 7 then navigated to the recorded uid, which no
 * longer existed, and stopped. The staged GENERALISATION was dropped, correctly
 * — a promise about the skill is only kept once the run walks past the segment
 * — but the OBSERVATION went with it, so n3 was back to guessing the uid from
 * its characters. Variance is a fact about the environment, not about the
 * step's success: the diffs survive the stop (ReplayResult.urlDiffs), the flow
 * runner seeds the ledger with them and banks them on the step
 * (FlowStep.urlVariance), and the next run starts with them
 * (flow.ts varyingValues → ledger seedVariance).
 */
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { replaySkill } from '../src/skills/replay.js';
import { RunLedger, urlVarianceValues } from '../src/skills/ledger.js';
import type { Skill } from '../src/skills/store.js';

process.env.SITELOOPER_RESOLVE_WAIT_MS = '0';

/** The minimal Page surface this path touches. */
function fakePage(state: { url: string }): Page {
  return {
    url: () => state.url,
    evaluate: async () => undefined,
    locator: () => ({ first: () => ({}) }),
  } as unknown as Page;
}

const RECORDED = 'http://h:1/d/uid1abc23/bench-dashboard';
const LIVE = 'http://h:1/d/uid2def34/bench-dashboard';

/**
 * Step 1 lands on a dashboard whose uid this run minted differently (soft:
 * warn, stage, continue). Step 2 then stops, exactly as fwgr41's navigation to
 * the recorded uid did.
 */
function twoStepSkill(): Skill {
  return {
    id: 's_var',
    origin: 'http://h:1',
    template: 'open the dashboard and check it',
    params: {},
    preconditions: { urlPattern: 'http://h:1/' },
    steps: [
      { tool: 'goto', args: { url: RECORDED }, locators: {}, expect: { urlPattern: RECORDED } },
      { tool: 'goto', args: { url: 'http://h:1/other' }, locators: {}, expect: { urlPattern: 'http://h:1/elsewhere/deep/page' } },
    ],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 's', instruction: 'i', created: 't' },
  };
}

async function replayThatStops() {
  const state = { url: 'http://h:1/' };
  return replaySkill(twoStepSkill(), {}, {
    page: fakePage(state),
    exec: async (tool, args) => {
      // The app answers the first navigation with ITS uid — the minting the
      // recording cannot reproduce — and the second one plainly.
      if (tool === 'goto') state.url = String(args.url) === RECORDED ? LIVE : String(args.url);
      return { result: 'ok' };
    },
  });
}

describe('a url difference a stopped run observed', () => {
  it('is reported even though the replay never got past the segment', async () => {
    const res = await replayThatStops();
    expect(res.ok).toBe(false);
    expect(res.failedAt).toBe(2);
    expect(res.warnings.join(' ')).toContain('url segment(s) differ from recorded (uid1abc23→uid2def34)');
    expect(res.urlDiffs).toEqual([{ where: 'path', index: 1, expected: 'uid1abc23', actual: 'uid2def34' }]);
  });

  it('is kept where the staged generalisation is discarded — the two say different things', async () => {
    const res = await replayThatStops();
    // The caller's rule for a generalisation (tools.ts): keep it only once the
    // replay walked PAST the step that staged it. Here it did not, so the
    // skill's pattern stays exact...
    const staged = res.generalisations.find((g) => g.kind === 'expect');
    expect(staged?.step).toBe(1);
    expect(res.ok || (staged!.step !== undefined && res.stepsRun > staged!.step)).toBe(false);
    // ...while what the run SAW is true regardless of how far it got.
    expect(urlVarianceValues(res.urlDiffs)).toEqual(['uid1abc23', 'uid2def34']);
  });

  it('makes the next run bank the same position by evidence rather than by shape', async () => {
    const res = await replayThatStops();
    // What runFlow does with it: seed the ledger (this run) and write it onto
    // the step (the next run reads it back through varyingValues).
    const ledger = new RunLedger();
    ledger.seedVariance(urlVarianceValues(res.urlDiffs));
    ledger.addUrlIds(LIVE, 'i6', [
      { label: 'p0', value: 'd' },
      { label: 'p1', value: 'uid2def34' },
    ]);
    expect(ledger.all().map((e) => [e.value, e.basis])).toEqual([['uid2def34', 'variance']]);
    // 'variance' is what `evidenced` reads, and an evidenced identifier in a
    // locator is the only leak the export refuses over.
    expect(ledger.runSpecific('uid1abc23')).toBe(true);
  });
});
