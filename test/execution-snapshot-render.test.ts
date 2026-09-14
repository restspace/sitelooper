/**
 * The observation model's pure half (src/execution/snapshot.ts): how one
 * structured observation renders in each line dialect, when its coverage lets
 * a missing line mean absent, and that the line rules other modules apply to
 * recorded lines still read a dialect-2 line. The in-page walk itself — and
 * dialect 1's byte identity with the capture it replaced — is pinned against a
 * real DOM in test/observation.browser.test.ts.
 */
import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import {
  alertsComplete,
  captureLines,
  confirmPresence,
  coverageComplete,
  describeCoverage,
  presence,
  presentOnPage,
  renderAlerts,
  renderLines,
  type ObservationCoverage,
  type ObservedNode,
  type PageObservation,
} from '../src/execution/snapshot.js';
import { DIALOG_LINE, TRANSIENT_LINE, isEchoLine, maskMinted } from '../src/execution/expect.js';
import { OPENER_LINE } from '../src/skills/replay.js';
import { parseSignatureLine } from '../src/skills/sitemap.js';
import { documentOf, isObserveArg } from './fixture/observation.js';

const full = (over: Partial<ObservationCoverage> = {}): ObservationCoverage => ({
  nodesWalked: 10,
  nodeCap: 4000,
  nodesTruncated: false,
  linesTruncated: false,
  alertsTruncated: false,
  shadowRootsWalked: 0,
  frames: { observed: 0, hidden: 0, overCap: 0, inaccessible: [] },
  collections: { partial: false, evidence: [] },
  ...over,
});

const node = (over: Partial<ObservedNode> & { role: string }): ObservedNode => ({
  name: '',
  legacyName: '',
  context: { frame: [], shadow: [] },
  legacy: true,
  ...over,
});

/** A labelled input, a disabled button, a checked checkbox, a shadow button, and a button inside a frame. */
const observation: PageObservation = {
  url: 'http://app.test/',
  nodes: [
    node({ role: 'textbox', name: 'Email', legacyName: '', value: 'a@b.test' }),
    node({ role: 'button', name: 'Save', legacyName: 'Save', disabled: true }),
    node({ role: 'checkbox', name: 'Remember me', legacyName: 'Remember me', checked: true }),
    node({ role: 'checkbox', name: 'Newsletter', legacyName: 'Newsletter', checked: false }),
    node({ role: 'generic', name: 'decoration', legacyName: 'decoration' }),
    node({ role: 'button', name: 'Shadow action', legacyName: 'Shadow action', legacy: false, context: { frame: [], shadow: ['x-panel#p'] } }),
    node({ role: 'button', name: 'Pay', legacyName: 'Pay', legacy: false, context: { frame: [0], shadow: [] } }),
  ],
  alerts: [
    { text: 'Saved', legacy: true },
    { text: 'Shadow toast', legacy: false },
  ],
  coverage: full(),
};

describe('renderLines', () => {
  it('renders dialect 1 exactly as the first capture wrote it: light DOM only, legacy names, no disabled state', () => {
    expect(renderLines(observation, 1)).toEqual([
      '- textbox "": a@b.test',
      '- button "Save"',
      '- checkbox "Remember me" [checked]',
      '- checkbox "Newsletter"',
    ]);
  });

  it('renders dialect 2 from every node: label names, [disabled], shadow and frame content, context never in the text', () => {
    expect(renderLines(observation, 2)).toEqual([
      '- textbox "Email": a@b.test',
      '- button "Save" [disabled]',
      '- checkbox "Remember me" [checked]',
      '- checkbox "Newsletter"',
      '- button "Shadow action"',
      '- button "Pay"',
    ]);
  });

  it('orders the state markers before the value, and never gives a checkbox a value', () => {
    const o = { ...observation, nodes: [node({ role: 'textbox', name: 'Due', legacyName: 'Due', disabled: true, value: '12/31' }), node({ role: 'radio', name: 'A', legacyName: 'A', checked: true, disabled: true, value: 'on' })] };
    expect(renderLines(o, 2)).toEqual(['- textbox "Due" [disabled]: 12/31', '- radio "A" [checked] [disabled]']);
    expect(renderLines(o, 1)).toEqual(['- textbox "Due": 12/31', '- radio "A" [checked]']);
  });

  it('renders alerts per dialect', () => {
    expect(renderAlerts(observation, 1)).toEqual(['Saved']);
    expect(renderAlerts(observation, 2)).toEqual(['Saved', 'Shadow toast']);
  });
});

describe('coverage', () => {
  it('is complete only with no cap reached, every rendered frame read and no partial collection', () => {
    expect(coverageComplete(full())).toBe(true);
    expect(coverageComplete(full({ nodesTruncated: true }))).toBe(false);
    expect(coverageComplete(full({ linesTruncated: true }))).toBe(false);
    expect(coverageComplete(full({ frames: { observed: 0, hidden: 0, overCap: 1, inaccessible: [] } }))).toBe(false);
    expect(coverageComplete(full({ frames: { observed: 0, hidden: 0, overCap: 0, inaccessible: [{ path: [0], url: 'x', reason: 'timeout' }] } }))).toBe(false);
    expect(coverageComplete(full({ collections: { partial: true, evidence: ["grid 'Orders' 20/500"] } }))).toBe(false);
    // a hidden frame shows nothing, so it is not a gap; an alert cap is not a LINE gap
    expect(coverageComplete(full({ frames: { observed: 1, hidden: 3, overCap: 0, inaccessible: [] } }))).toBe(true);
    expect(coverageComplete(full({ alertsTruncated: true }))).toBe(true);
  });

  it('asks the alert question separately', () => {
    expect(alertsComplete(full())).toBe(true);
    expect(alertsComplete(full({ alertsTruncated: true }))).toBe(false);
    expect(alertsComplete(full({ linesTruncated: true }))).toBe(true);
    expect(alertsComplete(full({ frames: { observed: 0, hidden: 0, overCap: 0, inaccessible: [{ path: [1], url: 'x', reason: 'gone' }] } }))).toBe(false);
  });

  it('says why a look was incomplete, in words a verdict can carry', () => {
    expect(describeCoverage(full())).toBe('');
    expect(
      describeCoverage(full({ nodesTruncated: true, nodesWalked: 4000, collections: { partial: true, evidence: ["grid 'Orders' 20/500"] }, frames: { observed: 0, hidden: 0, overCap: 2, inaccessible: [{ path: [0], url: 'x', reason: 'did not answer within 500ms' }] } })),
    ).toBe("the element cap was reached (4000 walked); 1 visible frame(s) could not be read (did not answer within 500ms); 2 frame(s) past the frame cap; a collection is only partly rendered (grid 'Orders' 20/500)");
  });
});

/** A page stub that answers the observation with this document. */
const pageShowing = (lines: string[], coverage: Parameters<typeof documentOf>[2] = {}) => {
  let looks = 0;
  const page = {
    url: () => 'http://app.test/',
    evaluate: async (_fn: unknown, arg?: unknown) => {
      if (!isObserveArg(arg)) return undefined;
      looks++;
      return documentOf(lines, [], coverage);
    },
  } as unknown as Page;
  return { page, looks: () => looks };
};

describe('presence', () => {
  it('is present on a match, absent only on a look that covered the page, unknown otherwise', async () => {
    expect(await presence(pageShowing(['- heading "S00021"']).page, ['S00021'], 2, { whole: true })).toBe('present');
    expect(await presence(pageShowing(['- heading "S00022"']).page, ['S00021'], 2, { whole: true })).toBe('absent');
    expect(await presence(pageShowing(['- heading "S00022"'], { nodesTruncated: true }).page, ['S00021'], 2, { whole: true })).toBe('unknown');
    // a match on an incomplete look is still a match
    expect(await presence(pageShowing(['- heading "S00021"'], { linesTruncated: true }).page, ['S00021'], 2)).toBe('present');
    const dead = { evaluate: async () => { throw new Error('closed'); } } as unknown as Page;
    expect(await presence(dead, ['S00021'], 2)).toBe('unknown');
  });

  it('presentOnPage is a yes only for present, in dialect 1 unless asked', async () => {
    expect(await presentOnPage(pageShowing(['- dialog "Edit"'], { nodesTruncated: true }).page, ['- dialog "Edit"'])).toBe(true);
    expect(await presentOnPage(pageShowing([], { nodesTruncated: true }).page, ['- dialog "Edit"'])).toBe(false);
  });

  it('confirmPresence sweeps and asks once more only when the answer is unknown', async () => {
    const unknown = pageShowing(['- heading "other"'], { collections: { partial: true, evidence: ["grid 'Orders' 20/500"] } });
    expect(await confirmPresence(unknown.page, ['S00021'], 2, { whole: true })).toEqual({ presence: 'unknown', why: "a collection is only partly rendered (grid 'Orders' 20/500)" });
    expect(unknown.looks()).toBe(2);
    const absent = pageShowing(['- heading "other"']);
    expect(await confirmPresence(absent.page, ['S00021'], 2)).toEqual({ presence: 'absent' });
    expect(absent.looks()).toBe(1);
  });

  it('captureLines carries completeness with the lines', async () => {
    expect(await captureLines(pageShowing(['- button "Go"']).page, 2)).toMatchObject({ lines: ['- button "Go"'], complete: true });
    expect(await captureLines(pageShowing(['- button "Go"'], { linesTruncated: true }).page, 2)).toMatchObject({ complete: false });
  });
});

describe('the line rules still read a dialect-2 line', () => {
  it('maskMinted, isEchoLine and the line regexes tolerate a state marker', () => {
    expect(maskMinted('- combobox "Project" [disabled]: 13f9pv52yozr')).toBe('- combobox "Project" [disabled]: {{*}}');
    expect(isEchoLine('- textbox "Email" [disabled]: a@b.test', 'a@b.test')).toBe(true);
    expect(DIALOG_LINE.exec('- dialog "Discard changes?"')?.[1]).toBe('Discard changes?');
    expect(OPENER_LINE.test('- menu "Actions" [disabled]')).toBe(true);
    expect(TRANSIENT_LINE.test('- status "Loading" [disabled]')).toBe(true);
    expect(parseSignatureLine('- button "Save" [disabled]')).toEqual({ role: 'button', name: 'Save' });
  });
});
