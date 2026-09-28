/**
 * GPT-6 Luna trial, gitea fwgt32-luna-n1 04-add
 * (test/fixture/fwgt32-luna-n1-labels.jsonl: script entries 0-161).
 *
 * 67 set the labels to "bug and priority-high" and reported blocked; its
 * resume 102 ticked `link "bug"` (latest at 125, committed by the close at
 * 128) and `link "priority-high"`, and reported failure. Gitea had applied
 * bug: 132 began with `- link "bug"` on the page, and its instruction said
 * "The bug label is already applied; add priority-high". 132 opened the
 * picker (133), ticked priority-high, reloaded (136) — throwing that away —
 * opened it again (142), ticked priority-high and committed it.
 *
 * resolveGroups keeps the failed attempt out of the flow (132 re-made its
 * priority-high choice), so 04-add was 132's procedure alone and every
 * replay applied priority-high only. carryOpener now splices the dead
 * attempt's bug tick into 132's procedure, right after the opening whose
 * close commits it (142, not 133).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry, RecordedInstruction, RecordedStep } from '../src/daemon/recorder.js';
import { carriedChoices, carryOpener } from '../src/skills/compile.js';
import { unbankedMutations } from '../src/skills/flow.js';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixture');
const load = (): RecordedEntry[] =>
  fs.readFileSync(path.join(DIR, 'fwgt32-luna-n1-labels.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const AT = 132;

const split = (entries: RecordedEntry[]) => [entries.slice(0, AT), entries.slice(AT)] as const;
const isStep = (e: RecordedEntry): e is RecordedStep => e.k === 'step';

describe('carryOpener: a dead attempt\'s choice that stuck (fwgt32-luna 04-add)', () => {
  it('splices the bug tick after the opening whose close commits it', () => {
    const entries = load();
    const [before, own] = split(entries);
    const out = carryOpener(before, own);
    expect(out.length).toBe(own.length + 1);
    const at = out.indexOf(entries[142]);
    const pick = out[at + 1] as RecordedStep;
    expect(pick.tool).toBe('click');
    expect(pick.locators?.target?.chain).toContainEqual({ kind: 'role', role: 'link', name: 'bug' });
    expect(pick.result).toBeUndefined();
    // the next gesture is 132's own priority-high tick
    expect(out[at + 2]).toBe(entries[143]);
    // not the first opening, which the reload at 136 threw away
    expect(out[out.indexOf(entries[133]) + 1]).toBe(entries[134]);
  });

  it('counts the carried tick as taken up in the unbanked-work warning', () => {
    const lines = unbankedMutations(load());
    expect(lines.some((l) => /carried into the next instruction's procedure/.test(l))).toBe(true);
  });

  const variant = (edit: (entries: RecordedEntry[]) => void) => {
    const entries = load();
    edit(entries);
    const [before, own] = split(entries);
    return carriedChoices(before, own);
  };

  it('carries it on the recording as it is', () => {
    expect(variant(() => {}).map((c) => c.step.args.target)).toEqual(['@e377']);
  });

  it('not when the dead attempt began elsewhere (it would be adopted, picks and all)', () => {
    expect(variant((e) => ((e[67] as RecordedInstruction).url = 'http://127.0.0.1:8095/bench/bench-repo/issues/new'))).toEqual([]);
  });

  it('not when the choice did not stick', () => {
    expect(variant((e) => {
      const head = e[AT] as RecordedInstruction;
      head.startText = head.startText!.split('\n').filter((l) => l.trim() !== '- link "bug"').join('\n');
    })).toEqual([]);
  });

  it('not when the dead instruction never asked for it', () => {
    expect(variant((e) => {
      for (const i of [67, 102]) (e[i] as RecordedInstruction).text = (e[i] as RecordedInstruction).text.replace(/\bbug and /g, '');
    })).toEqual([]);
  });

  it('not when this instruction touches the element itself', () => {
    expect(variant((e) => {
      const s = e[149] as RecordedStep;
      s.locators = { ...s.locators, target: { ...s.locators!.target!, chain: [{ kind: 'role', role: 'link', name: 'bug' }] } };
    })).toEqual([]);
  });

  it('not when this instruction made none of the dead attempt\'s choices over again', () => {
    expect(variant((e) => {
      for (const s of e.slice(AT).filter(isStep)) {
        const chain = s.locators?.target?.chain;
        if (chain) s.locators = { ...s.locators, target: { ...s.locators!.target!, chain: chain.filter((c) => c.kind !== 'role') } };
      }
    })).toEqual([]);
  });
});
