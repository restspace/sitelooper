/**
 * A navigation whose recorded target names a record of the RECORDING's run,
 * at a position THIS run has already watched vary (fwgr41-n3 06-find: step 6
 * warned "url segment(s) differ from recorded (afyd7g0300dfkc→cfyd8hqymgfeoe)
 * — treated as volatile", and step 7 then went to the recorded uid, where
 * Grafana answered "Dashboard not found | Invalid dashboard UID in annotation
 * request" and the run stopped as if an alert had come out of nowhere).
 *
 * The VERDICT is the shared retargetNavigation (test/execution-gates.test.ts
 * pins it, and the compiled artifact calls the same one — test/spec-emit and
 * test/execution-source pin that call); what is tested here is the daemon's
 * adapter: the ledger of what this replay has watched vary, the goto that
 * consults it, and the cause it hands its alert gate.
 */
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { replaySkill } from '../src/skills/replay.js';
import type { Skill, SkillStep } from '../src/skills/store.js';

process.env.SITELOOPER_RESOLVE_WAIT_MS = '0';

const RECORDED = 'http://h:1/d/afyd7g0300dfkc/bench-dashboard';
const LIVE_UID = 'cfyd8hqymgfeoe';

/**
 * The minimal Page this path touches. `evaluate` is the page observation
 * (called with the snapshot limits) — it answers with the live-region alerts
 * the test wants and nothing else; called without an argument it is settleDom.
 */
function fakePage(state: { url: string; alerts?: string[] }): Page {
  return {
    url: () => state.url,
    evaluate: async (_fn: unknown, arg?: unknown) =>
      arg === undefined
        ? undefined
        : {
            nodes: [],
            alerts: (state.alerts ?? []).map((text) => ({ text, legacy: true })),
            coverage: {
              nodesWalked: 0,
              nodeCap: 100,
              nodesTruncated: false,
              linesTruncated: false,
              alertsTruncated: false,
              shadowRootsWalked: 0,
              collections: { partial: false, evidence: [] },
              frames: { observed: 0, hidden: 0, overCap: 0, inaccessible: [] },
            },
          },
    locator: () => ({ first: () => ({}) }),
  } as unknown as Page;
}

function skillOf(steps: SkillStep[]): Skill {
  return {
    id: 's_test',
    origin: 'http://h:1',
    template: 'open the dashboard',
    params: {},
    preconditions: { urlPattern: 'http://h:1/' },
    steps,
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 's', instruction: 'i', created: 't' },
  };
}

/**
 * Step 1 navigates and the app answers on a uid of ITS OWN (`lands`), which
 * the step's recorded url expectation sees as a volatile segment; step 2 is
 * the recorded goto to the uid the recording minted.
 */
function run(lands: string, then: string, state = { url: 'http://h:1/', alerts: [] as string[] }) {
  const gotos: string[] = [];
  const skill = skillOf([
    { tool: 'goto', args: { url: RECORDED }, locators: {}, expect: { urlPattern: RECORDED } },
    { tool: 'goto', args: { url: then }, locators: {} },
  ]);
  return replaySkill(skill, {}, {
    page: fakePage(state),
    exec: async (tool, args) => {
      if (tool === 'goto') {
        gotos.push(String(args.url));
        state.url = gotos.length === 1 ? lands : String(args.url);
      }
      return { result: 'ok' };
    },
  }).then((res) => ({ res, gotos }));
}

describe('a goto retargeted by what this replay has watched vary', () => {
  it('navigates to the live value at the volatile position, not the recorded literal', async () => {
    const { res, gotos } = await run(`http://h:1/d/${LIVE_UID}/bench-dashboard`, `${RECORDED}?refresh=1m`);
    expect(gotos).toEqual([RECORDED, `http://h:1/d/${LIVE_UID}/bench-dashboard?refresh=1m`]);
    expect(res.warnings.join('\n')).toContain(
      'step 2: the recorded target names path[1]=afyd7g0300dfkc, a position this run has already shown volatile — navigating to the live path[1]=cfyd8hqymgfeoe instead',
    );
    expect(res.ok).toBe(true);
  });

  it('leaves the recorded target alone when this replay has watched nothing vary', async () => {
    // Step 1 landed exactly where it was recorded landing: no evidence, no rewrite.
    const { res, gotos } = await run(RECORDED, `${RECORDED}?refresh=1m`);
    expect(gotos).toEqual([RECORDED, `${RECORDED}?refresh=1m`]);
    expect(res.warnings.join('\n')).not.toContain('already shown volatile');
  });

  it('names the dead page as the cause when the landing raises an unrecorded alert', async () => {
    // Step 2 leaves the dashboard for the list, where the live value cannot be
    // read off the url at all: the recorded target stands, and the app answers
    // it. The stop is the same stop; what it NAMES is the navigation.
    const state = { url: 'http://h:1/', alerts: [] as string[] };
    const skill = skillOf([
      { tool: 'goto', args: { url: RECORDED }, locators: {}, expect: { urlPattern: RECORDED } },
      { tool: 'back', args: {}, locators: {} },
      { tool: 'goto', args: { url: `${RECORDED}?refresh=1m` }, locators: {} },
    ]);
    const res = await replaySkill(skill, {}, {
      page: fakePage(state),
      exec: async (tool, args) => {
        if (tool === 'back') {
          state.url = 'http://h:1/dashboards';
          return { result: 'ok' };
        }
        if (tool !== 'goto') return { result: 'ok' };
        if (state.url === 'http://h:1/') {
          state.url = `http://h:1/d/${LIVE_UID}/bench-dashboard`;
          return { result: 'ok' };
        }
        state.url = String(args.url);
        state.alerts = ['Dashboard not found', 'Invalid dashboard UID in annotation request'];
        return { result: 'ok' };
      },
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(
      'step 3 navigated to a page that does not exist: its url still names the recorded path[1]=afyd7g0300dfkc, which this run has already shown varies (cfyd8hqymgfeoe)' +
        ' — the app answered with an alert the recording never saw: Dashboard not found | Invalid dashboard UID in annotation request',
    );
  });
});
