/**
 * The daemon's url gate reads the link a click reported (the executor's
 * StepRun.link) through the shared linkLandingWarning — the rule the compiled
 * artifact's urlEffect asks too (test/spec-emit pins that call).
 *
 * fwop2 (OpenProject, round 33): s_f4e3b6 step 1, a click on "Bench Project"
 * recorded as landing on /projects because the recorder settled before Turbo
 * Drive's visit committed. Both replays went to /projects/bench-project and
 * stopped "after step 1 expected url …/projects but browser is at
 * …/projects/bench-project".
 */
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { replaySkill, type StepRunResult } from '../src/skills/replay.js';
import type { Skill, SkillStep } from '../src/skills/store.js';

process.env.SITELOOPER_RESOLVE_WAIT_MS = '0';

const LIST = 'http://127.0.0.1:8090/projects';
const PROJECT = 'http://127.0.0.1:8090/projects/bench-project';

/** A page whose one locator resolves to a single element; the executor moves its url. */
function fakePage(state: { url: string }): Page {
  const loc = () => ({ count: async () => 1, first: () => ({ textContent: async () => '' }) });
  return {
    url: () => state.url,
    async goto() {},
    async content() {
      return '<html></html>';
    },
    async evaluate() {
      return '';
    },
    async waitForLoadState() {},
    getByRole: loc,
    locator: loc,
  } as unknown as Page;
}

function skillOf(steps: SkillStep[]): Skill {
  return {
    id: 's_f4e3b6',
    origin: 'http://127.0.0.1:8090',
    template: 'open the project',
    params: {},
    preconditions: { urlPattern: LIST },
    steps,
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 's', instruction: 'i', created: 't' },
  };
}

/** s_f4e3b6 step 1 as stored: the click, and the url it was recorded "landing" on. */
const click: SkillStep = {
  tool: 'click',
  args: { target: 'role=link[name="Bench Project"]' },
  locators: { target: [{ kind: 'role', role: 'link', name: 'Bench Project' }] as SkillStep['locators']['target'] },
  expect: { urlPattern: LIST },
};

async function replayWith(link: StepRunResult['link'], lands = PROJECT) {
  const state = { url: LIST };
  let clicks = 0;
  const res = await replaySkill(skillOf([click]), {}, {
    page: fakePage(state),
    exec: async (tool) => {
      clicks++;
      if (tool === 'click') state.url = lands;
      return { result: 'clicked', settled: true, ...(link ? { link } : {}) };
    },
  });
  return Object.assign(res, { clicks });
}

describe('a link click recorded on the page it left', () => {
  it('passes, warned, when the click went where the link points', async () => {
    const res = await replayWith({ from: LIST, href: PROJECT });
    expect(res.clicks).toBe(1);
    expect(res.reason).toBeUndefined();
    expect(res.ok).toBe(true);
    expect(res.warnings.join('\n')).toContain('step 1: recorded url http://127.0.0.1:8090/projects is the page the clicked link left');
  });

  it('still stops when no link was reported, as round 33 did', async () => {
    const res = await replayWith(undefined);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(`after step 1 expected url ${LIST} but browser is at ${PROJECT}`);
  });

  it('still stops when the click went somewhere the link does not point', async () => {
    const res = await replayWith({ from: LIST, href: PROJECT }, 'http://127.0.0.1:8090/login');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/expected url/);
  });
});
