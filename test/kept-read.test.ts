/**
 * A skipped read publishes nothing, so in a compiled spec it erases nothing.
 *
 * Replay sets a label only when a read succeeds, and merges a chain's segments
 * over one another: a read that is skipped leaves what an earlier read of the
 * same label published. The spec assigned the skip's empty string instead.
 * fwrd98-fc: 02-create read `ticket_reference` in both of its chain segments,
 * the second read's locator chain had been retired, and the spec stopped at
 * "07-remove needs {{02-create.ticket_reference}}, and this run never published
 * it" while both replays passed on the value the first segment read.
 */
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow, SpecSegment } from '../src/spec/ir.js';

const ORIGIN = 'http://app.test';
const REF = { kind: 'css' as const, selector: '#ref' };
const KEY = `outputs['01-step.ref']`;

type Steps = SpecSegment['steps'];
const read = (locators: Steps[number]['locators']): Steps[number] => ({ tool: 'read', args: { target: '@e1', what: 'text' }, locators, label: 'ref' });
const click: Steps[number] = { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'css', selector: '#go' }] } };

function flowOf(...segments: Steps[]): SpecFlow {
  return {
    version: 1,
    name: 'kept-read',
    origin: ORIGIN,
    startUrl: `${ORIGIN}/`,
    vars: [],
    steps: [{
      id: '01-step', instruction: 'create it', params: {}, outputs: ['ref'],
      segments: segments.map((steps, i) => ({ id: `s_${i + 1}`, template: 'create it', params: {}, preconditions: { urlPattern: `${ORIGIN}/` }, steps })),
    }],
  };
}

describe('a compiled read that is skipped keeps what an earlier read of its label published', () => {
  it('a first read of a label is emitted as it always was', () => {
    const { source } = emitFlowFile(flowOf([read({ target: [REF] })]), { tier: 'plain' });
    expect(source).toContain(`${KEY} = await readOptional(page, [`);
    expect(source).not.toContain('keptRead(');
  });

  it('a later segment\'s read with no locator left no longer assigns the empty string over it', () => {
    const { source } = emitFlowFile(flowOf([read({ target: [REF] })], [click, read({ target: [] })]), { tier: 'plain' });
    expect(source).toContain(`${KEY} = await readOptional(page, [`);
    expect(source).toContain(`${KEY} ??= '';`);
    expect(source).not.toContain(`${KEY} = '';`);
  });

  it('a lone read with no locator still publishes the empty string', () => {
    const { source } = emitFlowFile(flowOf([read({ target: [] })]), { tier: 'plain' });
    expect(source).toContain(`${KEY} = '';`);
  });

  it('a later segment\'s read that has a locator keeps the earlier value only when it is skipped', () => {
    const { source } = emitFlowFile(flowOf([read({ target: [REF] })], [click, read({ target: [REF] })]), { tier: 'plain' });
    expect(source).toContain(`${KEY} = await readOptional(page, [`);
    expect(source).toContain(`${KEY} = keptRead(${KEY}, skippedReads.length, await readOptional(page, [`);

    // The helper itself, as the generated file carries it.
    const fn = /function keptRead\([^]*?\n}/.exec(source)?.[0];
    expect(fn).toBeTruthy();
    const js = ts.transpileModule(`const skippedReads: string[] = [];\n${fn}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const { keptRead, skippedReads } = new Function(`${js}\nreturn { keptRead, skippedReads };`)() as {
      keptRead: (prev: string | undefined, skipsBefore: number, value: string) => string;
      skippedReads: string[];
    };
    // Not skipped: the read's own value, even an empty one (replay publishes it too).
    expect(keptRead('RD-7', 0, 'RD-8')).toBe('RD-8');
    expect(keptRead('RD-7', 0, '')).toBe('');
    // Skipped: the earlier value stands; with none, the skip's empty string.
    skippedReads.push('01-step s_2/2 target');
    expect(keptRead('RD-7', 0, '')).toBe('RD-7');
    expect(keptRead(undefined, 0, '')).toBe('');
    // A skip logged before this read began is not this read's.
    expect(keptRead('RD-7', 1, 'RD-8')).toBe('RD-8');
  });
});
