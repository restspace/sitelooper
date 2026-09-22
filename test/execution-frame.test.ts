/**
 * A read-back pinned by CONTAINMENT publishes only the text at the value's
 * recorded position (text.ts FRAME_MARK / frameValue / extractFramed,
 * observe.ts framedRead). fwvk3's runid read was pinned to the <h1>
 * "fwvk3-n1 Bench Task" and every replay published the whole heading; fwgh5
 * s_5ee393's `ref` published "fwgh5-n2 Bench Post".
 */
import { describe, expect, it } from 'vitest';
import { FRAME_MARK, extractFramed, frameValue } from '../src/execution/text.js';
import { framedRead } from '../src/execution/observe.js';

describe('frameValue', () => {
  it('cuts the value out of its own line', () => {
    expect(frameValue('fwvk3-n1 Bench Task', 'fwvk3-n1')).toBe(`${FRAME_MARK} Bench Task`);
    expect(frameValue('Folder:   Bench', 'bench')).toBe(`Folder: ${FRAME_MARK}`);
  });

  it('takes the value’s shortest line, and prefers a bounded occurrence', () => {
    expect(frameValue('a long description mentioning n1 in passing\nRef n1', 'n1')).toBe(`Ref ${FRAME_MARK}`);
    expect(frameValue('fwvk3-n10 then fwvk3-n1 here', 'fwvk3-n1')).toBe(`fwvk3-n10 then ${FRAME_MARK} here`);
  });

  it('keeps a neighbouring line when the value is a whole line of a multi-line element', () => {
    expect(frameValue('Folder\nBench', 'Bench')).toBe(`Folder\n${FRAME_MARK}`);
    expect(frameValue('Bench\nFolder', 'Bench')).toBe(`${FRAME_MARK}\nFolder`);
  });

  it('is null when no line carries the value', () => {
    expect(frameValue('Something else', 'bench')).toBeNull();
  });
});

describe('extractFramed', () => {
  it('publishes the span at the mark, not the line (fwvk3, fwgh5)', () => {
    expect(extractFramed('fwvk3-n2 Bench Task', `${FRAME_MARK} Bench Task`)).toBe('fwvk3-n2');
    expect(extractFramed('fwgh5-n2 Bench Post', `${FRAME_MARK} Bench Post`)).toBe('fwgh5-n2');
  });

  it('folds whitespace and case as a displayed value is compared', () => {
    expect(extractFramed('  FOLDER:\t Bench  ', `Folder: ${FRAME_MARK}`)).toBe('Bench');
  });

  it('wildcards volatile tokens and unfilled slots in the frame', () => {
    expect(extractFramed('Due 10/02/2026 08:15 — t42', `Due 09/01/2026 07:40 — ${FRAME_MARK}`)).toBe('t42');
    expect(extractFramed('Owner admin: t42', `Owner {{v2}}: ${FRAME_MARK}`)).toBe('t42');
  });

  it('matches multi-line frames against consecutive lines', () => {
    expect(extractFramed('Title\nFolder\nOps\nTags', `Folder\n${FRAME_MARK}`)).toBe('Ops');
  });

  it('is null when the element no longer shows the frame, or shows it twice with different values', () => {
    expect(extractFramed('Another Heading', `${FRAME_MARK} Bench Task`)).toBeNull();
    expect(extractFramed('a Bench Task\nb Bench Task', `${FRAME_MARK} Bench Task`)).toBeNull();
    expect(extractFramed('a Bench Task\na Bench Task', `${FRAME_MARK} Bench Task`)).toBe('a');
    expect(extractFramed('Bench Task', `${FRAME_MARK} Bench Task`)).toBeNull();
  });

  it('round-trips what frameValue recorded', () => {
    const frame = frameValue('Total: £ 279.00', '£ 279.00')!;
    expect(extractFramed('Total: £ 312.50', frame)).toBe('£ 312.50');
  });
});

describe('framedRead', () => {
  it('passes an unframed read through untouched', () => {
    expect(framedRead('fwvk3-n2 Bench Task', undefined)).toBe('fwvk3-n2 Bench Task');
    expect(framedRead(['a', 'b'], '')).toEqual(['a', 'b']);
  });

  it('publishes the framed span, and throws (a skipped read) when the frame is gone', () => {
    expect(framedRead('fwvk3-n2 Bench Task', `${FRAME_MARK} Bench Task`)).toBe('fwvk3-n2');
    expect(() => framedRead('Other', `${FRAME_MARK} Bench Task`)).toThrow(/no longer shows/);
  });
});
