import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Flow } from '../src/skills/flow.js';
import { SkillStore, type SkillStep } from '../src/skills/store.js';
import { diagnosticLine, diagnosticNote, formatDiagnostic, hasError, rerecordFix, type Diagnostic } from '../src/spec/diagnostics.js';
import { flowToSpec, type SpecFlow } from '../src/spec/ir.js';
import { emitFlowFile } from '../src/spec/emit.js';
import { compileFlow } from '../src/spec/index.js';

/**
 * The published odoo run this whole shape exists for: 08-open is pinned to
 * s_c86522, a DEMOTED skill whose recorded instruction asks to cancel an order
 * step 06 already cancelled, so its first action clicks a Cancel button that is
 * never there on replay. Everything below asserts the tool says so once, in one
 * shape, with the command that fixes it.
 */
const FWOD34 = path.resolve('bench/results-published/fwod34.json');
const FWOD34_SKILLS = path.resolve('bench/results-published/fwod34-skills');
const DEMOTED_STEP = '08-open';
const DEMOTED_SKILL = 's_c86522';

describe('the Diagnostic shape', () => {
  const d: Diagnostic = {
    code: 'demoted-pin',
    step: '08-open',
    what: 'it is pinned to a demoted skill',
    why: 's_c86522 is demoted: 1 of 4 replays succeeded.',
    fix: 'sitelooper rerecord flows/fwod34.json 08-open',
    severity: 'error',
  };

  it('formats as a block: severity, step, what, then why and fix', () => {
    expect(formatDiagnostic(d)).toBe(
      [
        'error 08-open: it is pinned to a demoted skill',
        '  why: s_c86522 is demoted: 1 of 4 replays succeeded.',
        '  fix: sitelooper rerecord flows/fwod34.json 08-open',
      ].join('\n'),
    );
  });

  it('omits the fix line when there is no command that fixes it', () => {
    expect(formatDiagnostic({ ...d, fix: undefined })).not.toContain('fix:');
  });

  it('names no step for a flow-level diagnostic', () => {
    expect(formatDiagnostic({ ...d, step: undefined })).toMatch(/^error it is pinned/);
  });

  /**
   * Typing a warning must not rename it: callers (and tests) that assert on
   * the exact one-line string keep working through `diagnosticLine`.
   */
  it('carries the legacy one-line warning verbatim, and composes one when there is none', () => {
    expect(diagnosticLine({ ...d, line: 'step 08-open compiles a demoted skill (s_c86522)' })).toBe(
      'step 08-open compiles a demoted skill (s_c86522)',
    );
    expect(diagnosticLine(d)).toBe('step 08-open it is pinned to a demoted skill');
  });

  it('says in one line what a thrown error has room for', () => {
    expect(diagnosticNote(d)).toBe('it is pinned to a demoted skill — fix: sitelooper rerecord flows/fwod34.json 08-open');
    expect(diagnosticNote({ ...d, fix: undefined })).toBe('it is pinned to a demoted skill');
  });

  it('an error is what stops a write; a warning never is', () => {
    expect(hasError([{ ...d, severity: 'warning' }])).toBe(false);
    expect(hasError([{ ...d, severity: 'warning' }, d])).toBe(true);
  });

  it('quotes a flow path with spaces in the fix command', () => {
    expect(rerecordFix('flows/fwod34.json', '08-open')).toBe('sitelooper rerecord flows/fwod34.json 08-open');
    expect(rerecordFix('my flows/a.json', '08-open')).toBe('sitelooper rerecord "my flows/a.json" 08-open');
    expect(rerecordFix('a.json', '08-open', 'cancel it')).toBe('sitelooper rerecord a.json 08-open --instruction "cancel it"');
  });
});

describe('flowToSpec: diagnostics over the published fwod34 flow', () => {
  const flow = JSON.parse(fs.readFileSync(FWOD34, 'utf8')) as Flow;
  const store = new SkillStore(FWOD34_SKILLS);
  const { diagnostics, warnings } = flowToSpec(flow, store, { flowFile: FWOD34 });
  const demoted = diagnostics.find((d) => d.code === 'demoted-pin');

  it('flags the demoted pin as an ERROR against the step that carries it', () => {
    expect(demoted).toBeDefined();
    expect(demoted!.step).toBe(DEMOTED_STEP);
    expect(demoted!.severity).toBe('error');
    expect(demoted!.what).toContain(DEMOTED_SKILL);
  });

  /** The reason is the store's own stats — the numbers that caused the demotion. */
  it('gives the demotion its evidence: uses, successes, the step it failed at, when', () => {
    expect(demoted!.why).toContain('1 of 4 replays succeeded');
    expect(demoted!.why).toContain('failed at step 1 on 3 of them');
    expect(demoted!.why).toContain('last used 2026-09-04');
  });

  it('names the rerecord command, with the flow FILE the compile was given', () => {
    expect(demoted!.fix).toBe(`sitelooper rerecord ${FWOD34} ${DEMOTED_STEP}`);
  });

  it('keeps the legacy warning strings, in the same order, as diagnosticLine', () => {
    expect(warnings).toEqual(diagnostics.map(diagnosticLine));
    expect(warnings).toContain(
      `step ${DEMOTED_STEP} compiles a demoted skill (${DEMOTED_SKILL}) — its last replays failed at the same step`,
    );
  });

  it('types the rethread warnings without rewording them', () => {
    const rethread = diagnostics.filter((d) => d.code === 'unthreaded-param');
    expect(rethread.length).toBeGreaterThan(0);
    expect(rethread.every((d) => d.severity === 'warning')).toBe(true);
    expect(rethread.map((d) => d.why)).toContain(
      'step 06-open param v1 was bound to the literal "S00022"; rethreaded to {{02-create.quotation_ref}} from the instruction',
    );
  });

  it('has nothing to say about the steps that are fine', () => {
    expect(diagnostics.filter((d) => d.code === 'demoted-pin' || d.code === 'no-procedure' || d.code === 'missing-skill').map((d) => d.step)).toEqual([
      DEMOTED_STEP,
    ]);
  });
});

describe('flowToSpec: a step with nothing to compile', () => {
  const base: Flow = {
    name: 'gap',
    origin: 'http://localhost:5173',
    startUrl: 'http://localhost:5173/',
    vars: [],
    steps: [{ id: '01-do', instruction: 'archive the ticket', skill: 's_nope', outputs: [], recorded: {} }],
    provenance: { session: 'test', created: new Date(0).toISOString() },
  };

  it('reports the missing skill and the missing procedure, each with a rerecord fix', () => {
    const { diagnostics } = flowToSpec(base, new SkillStore(FWOD34_SKILLS), { flowFile: 'flows/gap.json' });
    expect(diagnostics.map((d) => d.code)).toEqual(['missing-skill', 'no-procedure']);
    expect(diagnostics.every((d) => d.fix === 'sitelooper rerecord flows/gap.json 01-do')).toBe(true);
    // A gap is not an error: the emitted body throws, and that is honest — it
    // is a demoted PIN that silently compiles a wrong procedure.
    expect(diagnostics.every((d) => d.severity === 'warning')).toBe(true);
  });

  /** Agent D writes these onto the flow at record time; compile re-surfaces them. */
  it('turns the flow\'s own `noop-step:` warnings into noop-step diagnostics', () => {
    const flow: Flow = {
      ...base,
      steps: [{ id: '08-open', instruction: 'cancel the order', outputs: [], recorded: {} }],
      warnings: [
        "noop-step: 08-open changed nothing: its instruction asks to cancel, the recording made no state-changing action, and the page already showed 'Cancelled' before it ran. The step may be redundant.",
        'something else entirely',
      ],
    };
    const { diagnostics } = flowToSpec(flow, new SkillStore(FWOD34_SKILLS), { flowFile: 'flows/gap.json' });
    const noop = diagnostics.find((d) => d.code === 'noop-step');
    expect(noop).toBeDefined();
    expect(noop!.step).toBe('08-open');
    expect(noop!.severity).toBe('warning');
    expect(noop!.why).toContain('the recording made no state-changing action');
    expect(noop!.fix).toBe('sitelooper rerecord flows/gap.json 08-open');
    // Only the prefixed ones; a flow warning about anything else is not ours.
    expect(diagnostics.filter((d) => d.code === 'noop-step').length).toBe(1);
  });

  it('does not fall over on a flow with no warnings at all', () => {
    expect(flowToSpec(base, new SkillStore(FWOD34_SKILLS)).diagnostics.some((d) => d.code === 'noop-step')).toBe(false);
  });
});

describe('compileFlow: a demoted pin refuses to write', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-diag-'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('writes nothing, and says why, when a step is pinned to a demoted skill', () => {
    const out = path.join(dir, 'refused');
    const result = compileFlow(FWOD34, { store: new SkillStore(FWOD34_SKILLS), outDir: out });
    expect(result.refused).toBe(true);
    expect(result.flowFile).toBeNull();
    expect(result.specFile).toBeNull();
    expect(fs.existsSync(out)).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'demoted-pin' && d.severity === 'error')).toBe(true);
  });

  it('--allow-demoted compiles it anyway, and the file carries the diagnostic', () => {
    const out = path.join(dir, 'forced');
    const result = compileFlow(FWOD34, { store: new SkillStore(FWOD34_SKILLS), outDir: out, allowDemoted: true });
    expect(result.refused).toBe(false);
    expect(result.flowFile).toBe(path.join(out, 'fwod34.flow.ts'));
    const source = fs.readFileSync(result.flowFile!, 'utf8');
    expect(source).toContain(`// error ${DEMOTED_STEP}: it is pinned to the demoted skill ${DEMOTED_SKILL}`);
    expect(source).toContain(`// fix: sitelooper rerecord ${FWOD34} ${DEMOTED_STEP}`);
    // and the step's own failure says it too
    expect(source).toContain(`'08-open s_c86522/1 target', { drift: run.drift }, 'it is pinned to the demoted skill s_c86522`);
  });
});

/** A one-step spec whose only action targets `steps[0]`. */
function specOf(steps: SkillStep[]): SpecFlow {
  return {
    version: 1,
    name: 'demo',
    origin: 'http://localhost:5173',
    startUrl: 'http://localhost:5173/',
    vars: [],
    steps: [
      {
        id: '01-do',
        instruction: 'cancel the order',
        params: {},
        outputs: [],
        segments: [
          {
            id: 's_demo',
            template: 'cancel the order',
            params: {},
            preconditions: { urlPattern: 'http://localhost:5173/' },
            steps,
          },
        ],
      },
    ],
  };
}

const FLAG: Diagnostic = {
  code: 'demoted-pin',
  step: '01-do',
  what: 'it is pinned to the demoted skill s_demo',
  why: 's_demo is demoted.',
  fix: 'sitelooper rerecord flows/demo.json 01-do',
  severity: 'error',
};
const NOTE = 'it is pinned to the demoted skill s_demo — fix: sitelooper rerecord flows/demo.json 01-do';

/** Syntax diagnostics only: a generated file that does not parse is unusable. */
function syntaxErrors(source: string): string[] {
  const out = ts.transpileModule(source, {
    fileName: 'flow.ts',
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

/** Just the step bodies: the inlined helpers have try/catch of their own. */
function stepsBlock(source: string): string {
  return source.slice(source.indexOf('export const steps = {'), source.indexOf('export async function runFlow'));
}

describe('the emitter on a flagged step', () => {
  const twoWays: SkillStep = {
    tool: 'click',
    args: { target: '@e1' },
    locators: { target: [{ kind: 'role', role: 'button', name: 'Cancel' }, { kind: 'css', selector: 'button.cancel' }] },
  } as SkillStep;
  const oneWay: SkillStep = {
    tool: 'click',
    args: { target: '@e1' },
    locators: { target: [{ kind: 'css', selector: 'button.cancel' }] },
  } as SkillStep;

  it('puts the diagnostic above the step, before its instruction comment', () => {
    const { source } = emitFlowFile(specOf([twoWays]), { tier: 'plain', diagnostics: [FLAG] });
    const block = source.slice(source.indexOf('export const steps'));
    expect(block).toContain('  // error 01-do: it is pinned to the demoted skill s_demo');
    expect(block).toContain('  // why: s_demo is demoted.');
    expect(block).toContain('  // fix: sitelooper rerecord flows/demo.json 01-do');
    expect(block.indexOf('// fix:')).toBeLessThan(block.indexOf('/** cancel the order */'));
  });

  it('hands the note to `pick`, as the trailing argument, so the throw carries it', () => {
    const { source } = emitFlowFile(specOf([twoWays]), { tier: 'plain', diagnostics: [FLAG] });
    expect(source).toContain(`'01-do s_demo/1 target', { drift: run.drift }, '${NOTE}'`);
    // and the helper appends it to the message it throws
    expect(source).toContain('async function pick(page: Page, candidates: Locator[], where: string, opts: { any?: boolean; drift?: string[] } = {}, note?: string)');
    expect(source).toContain("(note ? `\\n  ${note}` : '')");
  });

  /**
   * The single-candidate case has no `pick` to carry the note, and Playwright's
   * own timeout says only that a selector never resolved — which is exactly the
   * "reads as drift" failure this whole shape exists to stop.
   */
  it('wraps a single-candidate action in a rethrow that appends the note', () => {
    const { source } = emitFlowFile(specOf([oneWay]), { tier: 'plain', diagnostics: [FLAG] });
    const block = stepsBlock(source);
    expect(block).toContain('try {');
    expect(block).toContain(`err.message += '\\n  ${NOTE}';`);
    expect(block).toContain('throw err;');
    // the action itself is unchanged inside the wrapper
    expect(block).toContain("await click(page.locator('button.cancel'));");
  });

  it('is still parsable TypeScript with the note and the rethrow in it', () => {
    expect(syntaxErrors(emitFlowFile(specOf([twoWays, oneWay]), { tier: 'plain', diagnostics: [FLAG] }).source)).toEqual([]);
  });

  it('leaves an unflagged step exactly as it was: no note, no comment, no try', () => {
    const { source } = emitFlowFile(specOf([twoWays, oneWay]), { tier: 'plain' });
    expect(source).toContain("], '01-do s_demo/1 target', { drift: run.drift });");
    expect(stepsBlock(source)).not.toContain('try {');
    expect(source).not.toContain('// error 01-do');
    // the note parameter is still on the helper — it is simply never passed
    expect(source).toContain('note?: string');
  });

  it('a noop-step diagnostic is a comment, never a failure note', () => {
    const noop: Diagnostic = { code: 'noop-step', step: '01-do', what: '01-do changed nothing', why: 'no mutation.', severity: 'warning' };
    const { source } = emitFlowFile(specOf([twoWays, oneWay]), { tier: 'plain', diagnostics: [noop] });
    expect(source).toContain('  // warning 01-do: 01-do changed nothing');
    expect(source).toContain("], '01-do s_demo/1 target', { drift: run.drift });");
    expect(stepsBlock(source)).not.toContain('try {');
  });

  it('says nothing in the file about a diagnostic that is about a binding', () => {
    const param: Diagnostic = { code: 'unthreaded-param', step: '01-do', what: 'a literal', why: 'why.', severity: 'warning' };
    const { source } = emitFlowFile(specOf([twoWays]), { tier: 'plain', diagnostics: [param] });
    expect(source).not.toContain('// warning 01-do');
  });
});
