import type { Page } from 'playwright';
import { describe, expect, it } from 'vitest';
import { pageContextOf } from '../src/agent/tools.js';
import type { LocatorCandidate, RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills, creditUncreditedPopups } from '../src/skills/compile.js';

/**
 * FIX R, ghost fwgh6-n1 step 63: a click opened the public post in a new tab
 * that arrived after the step's capture. The recording wrote no popup effect,
 * the steps after it ran on page 1, and every replay stopped on "recorded on
 * page 1 … the procedure is on page 0". Parity (both runners follow the
 * credited popup) is test/execution-parity.test.ts "credited from the page
 * index alone".
 */
const role = (name: string, r = 'button'): LocatorCandidate[] => [{ kind: 'role', role: r, name }];
function rec(tool: string, chain: LocatorCandidate[] = [], extra: Partial<RecordedStep> = {}, args: Record<string, unknown> = { target: '@e1' }): RecordedStep {
  return { k: 'step', tool, args, locators: args.target ? { target: { expr: 'x', verified: true, raw: String(args.target), chain } } : {}, ...extra };
}

describe('creditUncreditedPopups (compile)', () => {
  it('credits the popup to the action before the first step on an unexplained page', () => {
    const steps = [
      rec('click', role('Publish')),
      rec('click', role('fwgh6-n1 Bench Post', 'heading')),
      rec('screenshot', [], {}, {}),
      rec('goto', [], { page: 1 }, { url: 'http://x.test/ghost/#/posts' }),
      rec('read', [], {}, { target: '(read-back)', what: 'text' }),
    ];
    const out = creditUncreditedPopups(steps);
    expect(out[1].effect).toEqual({ kind: 'popup' });
    expect(out[0].effect).toBeUndefined();
    expect(steps[1].effect, 'pure: the input is untouched').toBeUndefined();
  });

  it('compiles an effect-less click followed by steps on page 1 to a popup effect', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'open the post and check it', url: 'http://x.test/opener' },
      rec('click', role('Open approval', 'link')),
      rec('click', role('Approve'), { page: 1 }),
    ];
    const [skill] = compileSkills({ entries, instruction: 'open the post and check it', report: { status: 'success', summary: 'ok' }, session: 's' });
    expect(skill.steps[0].effect).toEqual({ kind: 'popup' });
    expect(skill.steps[1].page).toBe(1);
  });

  it('credits nothing when a recorded effect, a tabs switch or an intervening action explains the page', () => {
    const switched = creditUncreditedPopups([rec('click', role('A')), rec('tabs', [], { effect: { kind: 'switch', to: 1 } }, { switch_to: 1 }), rec('click', role('B'), { page: 1 })]);
    expect(switched[0].effect).toBeUndefined();
    const legacyTabs = creditUncreditedPopups([rec('click', role('A')), rec('tabs', [], {}, { switch_to: 1 }), rec('click', role('B'), { page: 1 })]);
    expect(legacyTabs[0].effect).toBeUndefined();
    const filled = creditUncreditedPopups([rec('click', role('A')), rec('fill', role('Name', 'textbox'), {}, { target: '@e2', value: 'x' }), rec('click', role('B'), { page: 1 })]);
    expect(filled[0].effect).toBeUndefined();
    const recorded = creditUncreditedPopups([rec('click', role('A'), { effect: { kind: 'popup', urlPattern: 'http://x.test/child' } }), rec('click', role('B'), { page: 1 })]);
    expect(recorded[0].effect).toEqual({ kind: 'popup', urlPattern: 'http://x.test/child' });
    // A page the recording was already on is no arrival.
    const back = creditUncreditedPopups([rec('click', role('A'), { page: 1 }), rec('click', role('B'), { page: 0 }), rec('click', role('C'), { page: 1 })]);
    expect(back.map((s) => s.effect)).toEqual([undefined, undefined, undefined]);
  });
});

describe('pageContextOf (recorder): a new page with no opener', () => {
  /** A page stand-in: `opener` null is what a late or noopener tab looked like to the recorder. */
  const fakePage = (url: string, extra: Partial<Record<string, unknown>> = {}): Page =>
    ({
      isClosed: () => false,
      opener: async () => null,
      url: () => url,
      waitForLoadState: async () => {},
      waitForEvent: async () => {
        throw new Error('timeout');
      },
      ...extra,
    }) as unknown as Page;

  it('credits the only page new since the step began, even with no opener', async () => {
    const opener = fakePage('http://x.test/ghost/#/posts');
    const tab = fakePage('http://x.test/bench-post/');
    const session = { listPages: async () => [opener, tab], getPage: async () => tab };
    const out = await pageContextOf(session, opener, 'click', { target: '@e1' }, [opener], null);
    expect(out.effect).toMatchObject({ kind: 'popup' });
    expect(out.afterPage).toBe(tab);
  });

  it('waits a moment for a late tab when the click changed nothing on its own page', async () => {
    const tab = fakePage('http://x.test/bench-post/');
    let pages: Page[] = [];
    const opener = fakePage('http://x.test/ghost/#/posts', {
      context: () => ({
        waitForEvent: async () => {
          await new Promise((r) => setTimeout(r, 50));
          pages = [opener, tab];
          return tab;
        },
      }),
    });
    pages = [opener];
    const session = { listPages: async () => pages, getPage: async () => opener };
    const out = await pageContextOf(session, opener, 'click', { target: '@e1' }, [opener], null, { appeared: [], quiet: true });
    expect(out.effect).toMatchObject({ kind: 'popup' });
    expect(out.afterPage).toBe(tab);
  });

  it('credits neither of two new pages', async () => {
    const opener = fakePage('http://x.test/a');
    const session = { listPages: async () => [opener, fakePage('http://x.test/b'), fakePage('http://x.test/c')], getPage: async () => opener };
    const out = await pageContextOf(session, opener, 'click', { target: '@e1' }, [opener], null);
    expect(out.effect).toBeUndefined();
  });
});
