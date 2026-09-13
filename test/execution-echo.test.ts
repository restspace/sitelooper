import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { MIN_ECHO_LEN, candidateNames, echoKey, echoVerdict, noteInteraction, setsSomething } from '../src/execution/echo.js';
import type { SkillStep } from '../src/skills/store.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';

/**
 * Gap 10: the echo rule (src/execution/echo.ts), which daemon replay calls and
 * the compiled artifact embeds. Pinned here: the rule itself, where the
 * emitter feeds and consults the ledger, and the emitted `echoRead` helper run
 * from the whole helper block (a helper cut alone fails closed).
 */

describe('the shared echo rule', () => {
  it('keys loosely, so case and punctuation do not hide an echo', () => {
    expect(echoKey('Last 6 hours.')).toBe(echoKey('last  6 HOURS'));
    expect(echoKey('notes for run')).toBe('notes for run');
  });

  it('remembers only substantial strings, at the floor', () => {
    const ledger = new Set<string>();
    noteInteraction(ledger, ['1m', 'abcd', 'abcde', undefined, 42, null]);
    expect([...ledger]).toEqual(['abcde']);
    expect(MIN_ECHO_LEN).toBe(5);
  });

  it('names a candidate by its name, else its label', () => {
    expect(candidateNames([{ name: 'Last 6 hours' }, { label: 'Time range' }, { name: 'Both', label: 'ignored' }, {}])).toEqual(['Last 6 hours', 'Time range', 'Both', undefined]);
  });

  it('an echo is a read whose value the ledger holds; a short or foreign value is not', () => {
    const ledger = new Set<string>();
    noteInteraction(ledger, ['Last 6 hours']);
    expect(echoVerdict(ledger, 'range', 'last 6 hours', 'step 4')).toBe(
      "step 4: read 'range' returned a value the skill itself set/selected ('last 6 hours') — confirms the control, not persistence; dropped from the report's confident values",
    );
    expect(echoVerdict(ledger, 'range', 'Last 7 days', 'step 4')).toBeNull();
    expect(echoVerdict(ledger, 'range', '', 'step 4')).toBeNull();
    noteInteraction(ledger, ['abcde']);
    expect(echoVerdict(ledger, 'x', 'abcd', 'step 4')).toBeNull();
  });

  it('only a step that sets or selects feeds the ledger: never a read, a scroll, a wait or a hover', () => {
    for (const tool of ['fill', 'type', 'select', 'click', 'dblclick', 'press', 'check']) expect(setsSomething(tool), tool).toBe(true);
    for (const tool of ['read', 'read_all', 'scroll_into_view', 'wait_for', 'hover', 'screenshot']) expect(setsSomething(tool), tool).toBe(false);
  });
});

const ORIGIN = 'http://app.test';
const specOf = (steps: SkillStep[]): SpecFlow => ({
  version: 1,
  name: 'echo',
  origin: ORIGIN,
  startUrl: `${ORIGIN}/`,
  vars: [],
  steps: [
    {
      id: '01-set',
      instruction: 'set the range',
      params: { v1: 'Echoville' },
      outputs: ['shown'],
      segments: [
        {
          id: 's_echo',
          template: 'set the range',
          params: { v1: { example: 'Echoville', usedIn: [1] } },
          preconditions: { urlPattern: `${ORIGIN}/` },
          steps,
        },
      ],
    },
  ],
});

describe('the emitted ledger', () => {
  const steps: SkillStep[] = [
    { tool: 'fill', args: { target: '@e1', value: '{{v1}}' }, locators: { target: [{ kind: 'label', label: 'City' }] } },
    { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'role', role: 'option', name: 'Last 6 hours' }] } },
    { tool: 'scroll_into_view', args: { target: '@e3' }, locators: { target: [{ kind: 'role', role: 'heading', name: 'Latency by endpoint' }] } },
    { tool: 'read', args: { target: '@e4', what: 'value', label: 'shown' }, label: 'shown', locators: { target: [{ kind: 'label', label: 'City' }] } },
  ];
  const { source } = emitFlowFile(specOf(steps), { tier: 'plain' });

  it('declares one ledger per segment, feeds it from what a step sets and what a resolved target is named, and asks it at the read', () => {
    expect(source).toContain('const typed1 = new Set<string>();');
    // the filled value, with its slot filled at run time
    expect(source).toContain('noteInteraction(typed1, [`${p.v1}`]);');
    // the clicked option's name, once its chain resolved
    expect(source).toMatch(/const hit\d+ = await pick\([^;]*?'Last 6 hours'[\s\S]*?\);\n\s*noteInteraction\(typed1, \['Last 6 hours'\]\);/);
    // a scroll sets nothing: its heading never enters the ledger
    expect(source).not.toContain("noteInteraction(typed1, ['Latency by endpoint'])");
    expect(source).toContain("echoRead(typed1, run, 'shown', '01-set.shown', outputs['01-set.shown'], '01-set s_echo/4');");
    // the embedded rule rides along
    expect(source).toContain('function echoVerdict(');
    expect(source).toContain('echoed: string[];');
    expect(source).toContain('run.echoed = [];');
  });

  it('a flow that neither sets nor reads carries no ledger and no echo helper', () => {
    const plain = emitFlowFile(specOf([{ tool: 'goto', args: { url: `${ORIGIN}/x` }, locators: {} }]), { tier: 'plain' }).source;
    expect(plain).not.toContain('new Set<string>();');
    expect(plain).not.toContain('function echoRead(');
    expect(plain).not.toContain('function echoVerdict(');
  });

  it('echoRead, run from the whole helper block, lists the key and warns once for an echo, and nothing otherwise', () => {
    const block = /export const DRIFT: string\[\] = \[\];\n([\s\S]*?)\nexport const steps = \{/.exec(source);
    if (!block) throw new Error('helper block not found in the emitted source');
    const js = ts.transpileModule(block[1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const names = [...block[1].matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]);
    const log: string[] = [];
    const helpers = new Function('DRIFT', 'console', `${js}\nreturn { ${names.join(', ')} };`)([], { warn: (l: string) => log.push(l), log: () => {} }) as Record<string, (...a: unknown[]) => unknown>;

    const ledger = new Set<string>();
    helpers.noteInteraction(ledger, ['Echoville']);
    const run = { outputs: {}, drift: [], echoed: [] as string[] };
    helpers.echoRead(ledger, run, 'shown', '01-set.shown', 'echoville', '01-set s_echo/4');
    helpers.echoRead(ledger, run, 'other', '01-set.other', 'Somewhere else', '01-set s_echo/5');
    helpers.echoRead(ledger, run, 'none', '01-set.none', undefined, '01-set s_echo/6');
    expect(run.echoed).toEqual(['01-set.shown']);
    expect(log).toEqual([
      "[sitelooper warn] 01-set s_echo/4: read 'shown' returned a value the skill itself set/selected ('echoville') — confirms the control, not persistence; dropped from the report's confident values",
    ]);
  });
});
