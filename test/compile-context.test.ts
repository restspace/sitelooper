/**
 * Frame and page context through compile (ROBUSTNESS.md finding 5): a target
 * recorded inside an iframe keeps its frame path beside its chain, two
 * identical controls in different frames never fold into one loop or merge
 * into one procedure, a popup/close/tab switch is a segment seam gated on the
 * page the procedure continues on, and only a procedure that carries any of
 * it is stamped contract 3.
 */
import { describe, expect, it } from 'vitest';
import type { LocatorExpr, RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, foldLoops, samePageContexts, sameProcedure } from '../src/skills/compile.js';
import { contractFor, isVerified, type SkillStep } from '../src/skills/store.js';
import type { FramePath } from '../src/execution/context.js';

const ORIGIN = 'http://127.0.0.1:4100';
const PAYMENT: FramePath = [{ selectors: ['iframe[title="Payment"]', 'iframe[src*="/frames/inner"]'], title: 'Payment' }];

function locator(name: string, frame?: FramePath): Record<string, LocatorExpr> {
  return { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name }], ...(frame ? { frame } : {}) } };
}

function click(name: string, extra: Partial<RecordedStep> = {}, frame?: FramePath): RecordedStep {
  return { k: 'step', tool: 'click', args: { target: '@e1' }, locators: locator(name, frame), ...extra };
}

const REPORT = { status: 'success' as const, summary: 'done', evidence: { values: {} } };

function compile(steps: RecordedStep[], url = `${ORIGIN}/frames`) {
  const entries: RecordedEntry[] = [{ k: 'instruction', text: 'save the payment', url }, ...steps];
  return compileSkills({ entries, instruction: 'save the payment', report: REPORT, session: 't', now: '2026-09-14T00:00:00.000Z' });
}

describe('compile: frame context', () => {
  it('carries a recorded frame path onto the step as contexts.target, and stamps the procedure contract 3', () => {
    const [skill] = compile([click('Save', {}, PAYMENT)]);
    expect(skill.steps[0].contexts).toEqual({ target: { frame: PAYMENT } });
    // nothing of the frame leaks into the chain the identity guard reads
    expect(JSON.stringify(skill.steps[0].locators)).not.toContain('Payment');
    expect(skill.contract).toBe(3);
    expect(skill.stats.verifiedContract).toBe(3);
  });

  it('leaves a main-frame recording exactly as it was: no contexts, contract 2', () => {
    const [skill] = compile([click('Save')]);
    expect(skill.steps[0].contexts).toBeUndefined();
    expect(skill.steps[0].page).toBeUndefined();
    expect(skill.contract).toBe(2);
    // a validated contract-2 procedure stays verified under this build
    expect(isVerified({ ...skill, status: 'validated' })).toBe(true);
  });

  it('never folds identical controls in different frames into one loop', () => {
    const inFrame = (id: string): SkillStep => ({
      tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'testid', attr: 'data-testid', value: `del-${id}` }] }, contexts: { target: { frame: PAYMENT } },
    });
    const onPage = (id: string): SkillStep => ({ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'testid', attr: 'data-testid', value: `del-${id}` }] } });
    expect(foldLoops([inFrame('1'), inFrame('2')])[0]).toMatchObject({ tool: 'loop', whileContext: { frame: PAYMENT } });
    expect(foldLoops([inFrame('1'), onPage('2')]).map((s) => s.tool)).toEqual(['click', 'click']);
  });

  it('does not call the same Save in the page and in the frame the same procedure', () => {
    const [framed] = compile([click('Save', {}, PAYMENT)]);
    const [plain] = compile([click('Save')]);
    expect(sameProcedure(framed, plain)).toBe(false);
    expect(samePageContexts(framed, plain)).toBe(false);
    expect(samePageContexts(framed, structuredClone(framed))).toBe(true);
  });
});

describe('compile: page effects', () => {
  it('splits a segment at a popup, and again at the close that returns to the opener', () => {
    const skills = compile(
      [
        click('Open approval', { effect: { kind: 'popup' }, afterUrl: `${ORIGIN}/popup/child` }),
        click('Approve', { page: 1, effect: { kind: 'close' }, afterUrl: `${ORIGIN}/opener` }),
        click('After'),
      ],
      `${ORIGIN}/opener`,
    );
    expect(skills).toHaveLength(3);
    expect(skills.map((s) => s.preconditions.urlPattern)).toEqual([`${ORIGIN}/opener`, `${ORIGIN}/popup/child`, `${ORIGIN}/opener`]);
    expect(skills[0].steps[0].effect).toEqual({ kind: 'popup', urlPattern: `${ORIGIN}/popup/child` });
    expect(skills[1].steps[0]).toMatchObject({ page: 1, effect: { kind: 'close' } });
    expect(skills[2].steps[0].page).toBeUndefined();
    expect(skills.map((s) => s.contract)).toEqual([3, 3, 2]);
    expect(new Set(skills.map((s) => s.seq?.chain)).size).toBe(1);
  });

  it('never folds or coalesces a step that moves the procedure to another page', () => {
    const tab = (to: number): SkillStep => ({ tool: 'tabs', args: { switch_to: to }, locators: {}, effect: { kind: 'switch', to } });
    expect(contractFor([tab(1)])).toBe(3);
    const popupClick = (id: string): SkillStep => ({ tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'testid', attr: 'data-testid', value: `open-${id}` }] }, effect: { kind: 'popup' } });
    expect(foldLoops([popupClick('1'), popupClick('2')]).map((s) => s.tool)).toEqual(['click', 'click']);
  });
});

/**
 * snipeit fwsi1 02-find: the recording filled "Seed:" and then "" (a clear);
 * the list rewrote its query string on a debounce after its AJAX call, and
 * the url landed during the clear's settle. A fill never navigates, so the
 * url after one is judged on its path only — in the daemon and the artifact
 * alike, both through the shared url matcher.
 */
describe('a url seen after a fill or type is judged on its path only (fwsi1)', () => {
  const O = 'http://127.0.0.1:8099';
  const LIST = `${O}/hardware`;
  const REWRITTEN = `${LIST}?order=asc&page=1&search=Seed:&size=20&sort=created_at`;
  const fill = (value: string, url: string): RecordedStep => ({
    k: 'step',
    tool: 'fill',
    args: { target: '@e5', value },
    locators: { target: { expr: "page.getByRole('searchbox', { name: 'Search' })", verified: true, raw: '@e5', chain: [{ kind: 'role', role: 'searchbox', name: 'Search' }] } },
    diff: { url, alerts: [], added: [], dialect: 2 },
  });

  it('stores the fill\'s url pattern without the query, and still a click\'s with it', async () => {
    const { urlMatches } = await import('../src/execution/url.js');
    const [skill] = compileSkills({
      entries: [
        { k: 'instruction', text: "Search the asset list for 'Seed:' and report the matches.", url: LIST },
        fill('Seed:', LIST),
        fill('', REWRITTEN),
        {
          k: 'step',
          tool: 'click',
          args: { target: '@e9' },
          locators: { target: { expr: "page.getByRole('link', { name: 'Next' })", verified: true, raw: '@e9', chain: [{ kind: 'role', role: 'link', name: 'Next' }] } },
          diff: { url: `${LIST}?order=asc&page=2`, alerts: [], added: [], dialect: 2 },
        },
      ],
      instruction: "Search the asset list for 'Seed:' and report the matches.",
      report: { status: 'success', summary: 'found', evidence: { values: {} } },
      session: 's',
    });
    const clear = skill.steps.find((s) => s.tool === 'fill' && s.args.value === '');
    expect(clear?.expect?.urlPattern).toBe(LIST);
    expect(urlMatches(clear!.expect!.urlPattern!, LIST)).toBe(true);
    expect(urlMatches(clear!.expect!.urlPattern!, REWRITTEN)).toBe(true);
    expect(urlMatches(clear!.expect!.urlPattern!, `${O}/users`)).toBe(false);
    expect(skill.steps.find((s) => s.tool === 'click')?.expect?.urlPattern).toContain('?');
  });
});
