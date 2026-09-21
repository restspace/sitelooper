/**
 * grafana fwgr64 07-report (cloud round 34): the flow step pinned s_752017 and
 * carried NO params, so both replays reported "the pinned skill s_752017
 * bound no params for this instruction" and took the model (29-30 turns), and
 * the compile refused the flow as `unbound-pin`.
 *
 * Two causes, both covered here with the run's own shapes:
 *  - the post-session relabel renamed i1's `ref` to `grafana_host` in the
 *    skill's v3 origin but not in the ledger, so the export's bindSkill found
 *    no value for v3 and wrote the step with no params (ledger renameOutputs);
 *  - without params, bindSkill needs a value for v2 (the runid) and v3 (the
 *    host), which the template never states — both are INSIDE bound slots
 *    (v1, v7, v8), and are now read out of them (learn.ts deriveContained).
 */
import { describe, expect, it } from 'vitest';
import { bindSkill } from '../src/skills/learn.js';
import { RunLedger, bindingKey } from '../src/skills/ledger.js';
import { replayBinding } from '../src/spec/ir.js';
import type { Skill } from '../src/skills/store.js';

const TEMPLATE =
  "Final verification of the Grafana dashboard '{{v1}}' at {{v8}} (load it fresh). Report: (1) the dashboard title shown in the top bar; " +
  '(3) the text content rendered inside the {{v6}} panel; (4) open the panel editor for the panel titled \'{{v7}}\' (click its title/menu → Edit). ' +
  'Do not modify or save anything.';

/** s_752017 as the fwgr64 store holds it: template, slots, origins, usage. */
function reportSkill(): Skill {
  return {
    id: 's_752017',
    origin: 'http://127.0.0.1:3000',
    template: TEMPLATE,
    params: {
      v1: { example: 'fwgr64-n1 Bench Dashboard', usedIn: [15, 22], known: true, binding: 'output:i2:dashboard_title' },
      v2: { example: 'fwgr64-n1', usedIn: [], known: true, binding: 'var:runid' },
      v3: { example: '127.0.0.1', usedIn: [12], known: true, binding: 'output:i1:grafana_host' },
      v6: { example: 'Text', usedIn: [], known: true, binding: 'output:i3:new_panel_type' },
      v7: { example: 'fwgr64-n1 Availability', usedIn: [1, 2, 3], known: true, binding: 'output:i2:panel_title' },
      v8: { example: 'http://127.0.0.1:3000/d/efyxnzqqt40e8c/fwgr64-n1-bench-dashboard', usedIn: [13], known: true },
    },
    steps: [],
    preconditions: { urlPattern: 'http://127.0.0.1:3000/*' },
    status: 'provisional',
    stats: { uses: 1, successes: 1, partial: 0, created: '2026-09-21T15:23:16.962Z', failedAtStep: {}, fallthroughs: 0 },
  } as unknown as Skill;
}

const instruction = (runid: string, uid: string): string =>
  TEMPLATE.replace('{{v1}}', `${runid} Bench Dashboard`)
    .replace('{{v8}}', `http://127.0.0.1:3000/d/${uid}/${runid}-bench-dashboard`)
    .replace('{{v6}}', 'Text')
    .replace('{{v7}}', `${runid} Availability`);

describe('bindSkill: a slot the template never states, contained in a bound one', () => {
  it("binds fwgr64's 07-report on a later run with no ledger at all", () => {
    // n2's own runid and dashboard uid: nothing of the recording run survives.
    const bound = bindSkill(reportSkill(), instruction('fwgr64-n2', 'abcuid2'), {});
    expect(bound).toEqual({
      v1: 'fwgr64-n2 Bench Dashboard',
      v8: 'http://127.0.0.1:3000/d/abcuid2/fwgr64-n2-bench-dashboard',
      v6: 'Text',
      v7: 'fwgr64-n2 Availability',
      v2: 'fwgr64-n2', // out of v1/v7 (left-anchored) and v8 (right-anchored), all agreeing
      v3: '127.0.0.1', // out of v8: after 'http://', stopped at ':' as the recording was
    });
  });

  it("binds the flow's reference-bearing instruction the same way (compile side)", () => {
    // What spec/ir.ts sees: the export's {{refs}}, not their values. A ref is
    // one unit, so the '.' and '-' inside {{02-create.url.p1}} are never taken
    // for the delimiter.
    const text = instruction('{{runid}}', '{{02-create.url.p1}}');
    const bound = bindSkill(reportSkill(), text, {});
    expect(bound?.v2).toBe('{{runid}}');
    expect(bound?.v3).toBe('127.0.0.1');
    expect(bound?.v8).toBe('http://127.0.0.1:3000/d/{{02-create.url.p1}}/{{runid}}-bench-dashboard');
  });

  it('refuses when the containing slots disagree — never a guess, never the recorded value', () => {
    const skill = reportSkill();
    // v1 says one runid, v7 another: v2 has two readings, so it stays unbound
    // and so does the skill (the pre-fix refusal, for a real reason now).
    const text = instruction('fwgr64-n2', 'abcuid2').replace('fwgr64-n2 Availability', 'other-run Availability');
    expect(bindSkill(skill, text, {})).toBeNull();
  });

  it('refuses a slot no bound value contains', () => {
    const skill = reportSkill();
    // The host moved: 'http://' no longer leads v8, and v8's right context
    // (with the recording's uid and runid) cannot anchor either.
    const text = instruction('fwgr64-n2', 'abcuid2').replace('http://127.0.0.1:3000/d/', 'https://grafana.example/d/');
    expect(bindSkill(skill, text, {})).toBeNull();
  });

  it("a banked origin still wins over the instruction's reading", () => {
    const bound = bindSkill(reportSkill(), instruction('fwgr64-n2', 'abcuid2'), { 'var:runid': 'fwgr64-n2', 'output:i1:grafana_host': '10.0.0.9' });
    expect(bound?.v3).toBe('10.0.0.9');
    expect(bound?.v2).toBe('fwgr64-n2');
  });

  it('the compiled spec binds the pin from the instruction instead of refusing it (unbound-pin)', () => {
    const pin = reportSkill();
    const bound = replayBinding(pin, [pin], instruction('{{runid}}', '{{02-create.url.p1}}'));
    expect(bound?.skill.id).toBe('s_752017');
    expect(Object.keys(bound!.params).sort()).toEqual(['v1', 'v2', 'v3', 'v6', 'v7', 'v8']);
  });
});

describe('RunLedger.renameOutputs: the ledger follows the relabel', () => {
  it("keys i1's host by the name the relabel gave it, so the export binds v3", () => {
    const ledger = new RunLedger();
    ledger.add('fwgr64-n1', { from: 'var', name: 'runid' }, { vouched: true });
    ledger.beginInstruction(1);
    ledger.add('127.0.0.1', { from: 'output', step: 'i1', name: 'ref' });
    ledger.beginInstruction(2);
    ledger.add('fwgr64-n1 Bench Dashboard', { from: 'output', step: 'i2', name: 'ref' });
    // fwgr64-n1's stop: relabel renamed i1's `ref` only.
    expect(ledger.renameOutputs('i1', { ref: 'grafana_host' })).toBe(1);
    const keys = Object.fromEntries(ledger.all().map((e) => [bindingKey(e.binding), e.value]));
    expect(keys).toEqual({
      'var:runid': 'fwgr64-n1',
      'output:i1:grafana_host': '127.0.0.1',
      'output:i2:ref': 'fwgr64-n1 Bench Dashboard', // another instruction's same name is untouched
    });
    // And with those keys the recording's own export binds every slot, v3 by origin.
    const bound = bindSkill(reportSkill(), instruction('fwgr64-n1', 'efyxnzqqt40e8c'), keys);
    expect(bound?.v3).toBe('127.0.0.1');
    expect(bound?.v2).toBe('fwgr64-n1');
  });
});
