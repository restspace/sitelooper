import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedStep } from '../src/daemon/recorder.js';
import { preconditionVerdict } from '../src/execution/gates.js';
import { compileSkills } from '../src/skills/compile.js';
import type { SkillStep } from '../src/skills/store.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';

/**
 * FIX AF, odoo fwod78 01-open: the recording's login landed on `/web#cids=1`
 * before Odoo wrote its default action into the hash; the next click (the app
 * switcher) coincided with `action=123&menu_id=81` arriving, and compile
 * recorded a `q.action` mint. mintedAhead then refused every replay — whose
 * login had already landed on the full url — as past its start. Parity is
 * test/execution-parity.test.ts "a minted key that arrived with others".
 */
const ORIGIN = 'http://127.0.0.1:8069';
const click = (name: string, url: string): RecordedStep => ({
  k: 'step',
  tool: 'click',
  args: { target: '@e1' },
  locators: { target: { expr: 'x', verified: true, raw: '@e1', chain: [{ kind: 'role', role: 'button', name }] } },
  diff: { url, alerts: [], added: ['- heading "x"'], dialect: 2 },
});
const mintsOf = (entries: RecordedEntry[]) =>
  compileSkills({ entries, instruction: 'do it', report: { status: 'success', summary: 'ok' }, session: 's' })
    .flatMap((s) => s.steps)
    .flatMap((s) => (s.mints ? [s.mints] : []));

describe('compile: a state key minted alone, or with others', () => {
  it('fwod78: action arriving with menu_id is a mint, but not a sole one', () => {
    const entries: RecordedEntry[] = [
      { k: 'instruction', text: 'do it', url: `${ORIGIN}/web#cids=1` },
      click('Home Menu', `${ORIGIN}/web#action=123&cids=1&menu_id=81`),
    ];
    expect(mintsOf(entries)).toEqual([{ at: 'q.action', sole: false }]);
  });

  it('fwod66: a save that adds id alone is a sole mint', () => {
    const form = `${ORIGIN}/web#action=316&cids=1&menu_id=194&model=sale.order&view_type=form`;
    const entries: RecordedEntry[] = [{ k: 'instruction', text: 'do it', url: form }, click('Save', `${form}&id=44`)];
    expect(mintsOf(entries)).toEqual([{ at: 'q.id', sole: true }]);
  });
});

describe('preconditionVerdict: only a sole mint marks the page past its start', () => {
  const pattern = `${ORIGIN}/web#cids={{d1}}`;
  const url = `${ORIGIN}/web#action=123&cids=1&menu_id=81`;
  it('does not refuse a page carrying a key the procedure minted along with others', () => {
    expect(preconditionVerdict(pattern, url, { d1: '1' }, 1, [{ at: 'q.action', step: 1, sole: false }]).refuse).toBeUndefined();
  });
  it('still refuses for a sole mint, and for a store compiled before the flag', () => {
    expect(preconditionVerdict(pattern, url, { d1: '1' }, 1, [{ at: 'q.action', step: 1, sole: true }]).past).toEqual({ key: 'action', value: '123', step: 1 });
    expect(preconditionVerdict(pattern, url, { d1: '1' }, 1, [{ at: 'q.action', step: 1 }]).past).toEqual({ key: 'action', value: '123', step: 1 });
  });
});

describe('emit: the artifact carries the flag to its gate', () => {
  it('passes sole with the minted positions', () => {
    const step: SkillStep = { tool: 'click', args: { target: '@e1' }, locators: { target: [{ kind: 'id', selector: '#apps' }] }, mints: { at: 'q.action', sole: false } };
    const spec: SpecFlow = {
      version: 2,
      name: 'mint-sole',
      origin: ORIGIN,
      startUrl: `${ORIGIN}/web#cids=1`,
      vars: [],
      steps: [{ id: '01-open', instruction: 'open', params: {}, outputs: [], segments: [{ id: 's_1', template: 'open', params: {}, preconditions: { urlPattern: `${ORIGIN}/web#cids=:id` }, steps: [step] }] }],
    };
    const { source } = emitFlowFile(spec, { tier: 'plain' });
    expect(source).toContain('[{"at":"q.action","step":1,"sole":false}]');
  });
});
