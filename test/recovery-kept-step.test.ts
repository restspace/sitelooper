/**
 * Round 60, ghost fwgh14 rules B and C.
 *
 * n2's 03-open replayed s_9433ad, whose step 1 clicks the post in the list.
 * The click opened n2's own post — right — and its url gate then refused it
 * for not being n1's (the frozen id rule A removes). The recovery compile
 * dropped that replayed step, as round 55 drops the step that stopped a
 * replay (fwsi7, where the step — a goto to the recording's record — was the
 * wrong gesture). So n2's variant s_a63811 began with the post-settings
 * toggle, a control of the EDITOR, gated on the posts list (the instruction's
 * start). n3 replayed it there: the toggle was missing, the inline heal
 * clicked Ghost's "Settings" nav link, and the step ended on #/settings (22
 * turns).
 *
 * B: a recovery compile keeps the stopped replayed step when its action landed
 * where the recovery continued — a click, not an addressed navigation — and
 * its expectation is compiled from THIS recording, re-slotted.
 * C: a variant's precondition is the page its first kept step ran on.
 */
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import type { Skill } from '../src/skills/store.js';

const G = 'http://127.0.0.1:8099/ghost';
const N1 = '6ab55426050a19000152eab7';
const N2 = '6ab55506050a19000152eac7';
const INSTRUCTION = "In the Ghost admin, open the existing draft post titled 'fwgh14-n2 Bench Post' and open its post settings panel, then set the excerpt to 'Excerpt for bench post fwgh14-n2.'";

const role = (r: string, name: string) => [{ kind: 'role' as const, role: r, name }];
const step = (tool: string, args: Record<string, unknown>, chain: ReturnType<typeof role>, url: string, added: string[], extra: Partial<RecordedStep> = {}): RecordedStep => ({
  k: 'step',
  tool,
  args,
  locators: chain.length ? { target: { expr: 'x', verified: true, raw: String(args.target ?? ''), chain } } : {},
  diff: { url, alerts: [], added, dialect: 2 },
  ...extra,
});

/** n2's 03-open recovery, as the script records it: the replayed click (via s_9433ad step 1), then the model's steps on the editor. */
function recovery(): RecordedEntry[] {
  return [
    { k: 'instruction', text: INSTRUCTION, url: `${G}/#/posts` },
    step('click', { target: '@e1452' }, [{ kind: 'css', selector: '[data-testid="posts-list-item"] a' } as never], `${G}/#/editor/post/${N2}`, ['- button "Publish"', '- textbox "Post title": fwgh14-n2 Bench Post'], {
      via: { skill: 's_9433ad', step: 1 },
    }),
    step('click', { target: '@e1054' }, [{ kind: 'testid', attr: 'data-testid', value: 'settings-menu-toggle' } as never], `${G}/#/editor/post/${N2}`, ['- heading "Post settings"']),
    step('fill', { target: '@e1649', value: 'Excerpt for bench post fwgh14-n2.' }, role('textbox', 'Excerpt'), `${G}/#/editor/post/${N2}`, ['- textbox "Excerpt": Excerpt for bench post fwgh14-n2.']),
  ];
}
const report = { status: 'success' as const, summary: 'settings set', evidence: { values: {} } };
const compileRecovery = (entries: RecordedEntry[] = recovery()): Skill[] =>
  compileSkills({
    entries,
    instruction: INSTRUCTION,
    report,
    session: 'fwgh14-n2',
    variantOf: 's_9433ad',
    stoppedAt: { skill: 's_9433ad', step: 1 },
    knownValues: { 'var:runid': 'fwgh14-n2', 'url:i2:h2': N2 },
  });

describe('B: the stopped step is kept when its action landed where the recovery continued (fwgh14 n2)', () => {
  it('keeps the post-open click, first, on the posts list', () => {
    const skills = compileRecovery();
    const first = skills[0].steps[0];
    expect(first.tool).toBe('click');
    expect(JSON.stringify(first.locators)).toContain('posts-list-item');
    expect(skills[0].preconditions.urlPattern).toBe(`${G}/#/posts`);
    // the settings toggle is the editor's, after the click that opened it
    const steps = skills.flatMap((s) => s.steps);
    const toggle = steps.findIndex((s) => JSON.stringify(s.locators).includes('settings-menu-toggle'));
    expect(toggle).toBeGreaterThan(steps.indexOf(first));
  });

  it("re-slots the kept step's expectation from this recording, never n1's literal or n2's", () => {
    const first = compileRecovery()[0].steps[0];
    const url = first.expect?.urlPattern ?? '';
    expect(url).toMatch(/#\/editor\/post\/(\{\{[vd]\d+\}\}|:id)$/);
    expect(url).not.toContain(N1);
    expect(url).not.toContain(N2);
  });

  it('a click that went nowhere the recovery used is still dropped (the recovery navigated first)', () => {
    const entries = recovery();
    // the recovery went back to the list and opened the post itself
    entries.splice(2, 0, step('goto', { url: `${G}/#/posts` }, [], `${G}/#/posts`, []));
    entries.splice(3, 0, step('click', { target: '@e9' }, role('link', 'fwgh14-n2 Bench Post'), `${G}/#/editor/post/${N2}`, ['- button "Publish"']));
    const steps = compileRecovery(entries).flatMap((s) => s.steps);
    expect(steps.some((s) => JSON.stringify(s.locators).includes('posts-list-item'))).toBe(false);
  });
});

describe('C: a variant is gated on the page its first kept step ran on', () => {
  it('when the stopped step is dropped, the variant starts on the page it left (the editor), not the instruction start', () => {
    const entries = recovery();
    // make the stopped step an addressed navigation, which B never keeps
    entries[1] = step('goto', { url: `${G}/#/editor/post/${N1}` }, [], `${G}/#/editor/post/${N2}`, ['- button "Publish"'], { via: { skill: 's_9433ad', step: 1 } });
    const skills = compileRecovery(entries);
    expect(skills.flatMap((s) => s.steps).some((s) => s.tool === 'goto')).toBe(false);
    expect(skills[0].preconditions.urlPattern).toMatch(/#\/editor\/post\/(\{\{[vd]\d+\}\}|:id)$/);
  });
});
