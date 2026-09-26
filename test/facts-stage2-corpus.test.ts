/**
 * Site facts stage 2 (notes/design/site-facts-stage2-contract.md, Piece L):
 * one case per survey row from design-site-facts.md §3 ("Survey rows
 * decided"), driven through the PUBLIC decision functions only —
 * `classifyReportValueWithFacts` / `identityMarkerVerdictWithFacts` /
 * `counterNames` / `maskCountersWithFacts` / `slotRenderings`
 * (src/execution/facts-display.ts, Piece J), `readBackRenderings`
 * (src/daemon/recorder.ts, Piece K's consumer 3, a pure function once the
 * page is out of the way), and the tightened observer `frameObservation`
 * (src/skills/facts-format.ts, Piece K).
 *
 * As facts-stage1-corpus.test.ts did: every `SiteFacts` here is built BY HAND
 * with `observeFact` (src/execution/facts.ts), over TWO SESSIONS with
 * `hard: false` where the row is a SOFT kind, and with a single `hard: true`
 * observation where the design's own table (§3) calls the observation a
 * structural proof — the point is the CONSUMER, not the observer.
 *
 * Each fact-aware case is shown beside the plain call it replaces (the
 * contract's "byte-identical fallback" promise: `emptyFacts` reproduces
 * today's rule exactly) so a failure here says which side broke.
 */
import { describe, expect, it } from 'vitest';
import { emptyFacts, observeFact, type Fact, type Observation, type SiteFacts } from '../src/execution/facts.js';
import { classifyReportValue, type GivenEvidence } from '../src/execution/report.js';
import { identityMarkerVerdict } from '../src/execution/gates.js';
import { FRAME_MARK, WILDCARD, maskCounters } from '../src/execution/text.js';
import {
  classifyReportValueWithFacts,
  controlKey,
  counterNames,
  identityMarkerVerdictWithFacts,
  maskCountersWithFacts,
  reportFormatKey,
  slotRenderings,
  titleKey,
  type IdentityLook,
  type SlotControls,
} from '../src/execution/facts-display.js';
import { affixOfFrame, frameObservation, sweptObservations } from '../src/skills/facts-format.js';
import { readBackRenderings } from '../src/daemon/recorder.js';

// ---------------------------------------------------------------------------
// shared fixture builders (facts-stage1-corpus.test.ts's own pattern)
// ---------------------------------------------------------------------------

const obs = (o: Partial<Observation> & Pick<Observation, 'k' | 'key' | 'v'>): Observation => ({
  hard: false,
  session: 's1',
  at: '2026-09-26T10:00:00.000Z',
  ...o,
});

/** A SiteFacts with one HARD observation per add: the structural-proof path to `reliable()`. */
function hardFacts(origin: string, adds: { key: string; v: Fact['v'] }[]): SiteFacts {
  const sf = emptyFacts(origin);
  for (const a of adds) observeFact(sf, obs({ k: 'format', ...a, hard: true, session: 's1' }));
  return sf;
}

/** A SiteFacts with TWO soft sessions per add: the statistical path to `reliable()`. */
function softFacts(origin: string, adds: { key: string; v: Fact['v'] }[]): SiteFacts {
  const sf = emptyFacts(origin);
  for (const a of adds) {
    observeFact(sf, obs({ k: 'format', ...a, session: 's1' }));
    observeFact(sf, obs({ k: 'format', ...a, session: 's2' }));
  }
  return sf;
}

const noLook: IdentityLook = { presence: 'absent', lines: async () => null, title: async () => '' };

// ---------------------------------------------------------------------------
// 1. fwec13 / the espo amount: a typed 12500, shown "12,500.00", is an echo
//    today and `committed` once the control's thousands+decimals format is
//    reliable (design §3 consumer 1, classifyReportValue)
// ---------------------------------------------------------------------------

describe('fwec13 / the espo amount: classifyReportValueWithFacts commits a typed number the app grouped and decimalled', () => {
  const ORIGIN = 'http://espo.test';
  const URL_ = `${ORIGIN}/#Opportunity/edit/view`;
  const TEMPLATE = 'created opportunity with amount {{v1}}';
  const PARAMS = { v1: '12500' };
  const SHOWN = ['Created opportunity with amount 12,500.00 USD'];
  const EVIDENCE: GivenEvidence = { typed: ['v1'], live: SHOWN, committed: [] };
  const CONTROLS: SlotControls = { v1: [{ role: 'textbox', name: 'Amount' }] };
  const KEY = controlKey(URL_, 'textbox', 'Amount');

  it('today, unaided: classifyReportValue calls it an echo (typed "12500" and the live "12,500.00" do not share a wordrun)', () => {
    // words() keeps only letter/digit runs, so "12500" and "12,500.00" do NOT
    // share a wordrun ("12500" vs "12" "500" "00"): the live line does not
    // contain the exact typed run, so the slot stays open.
    const verdict = classifyReportValue(TEMPLATE, PARAMS, SHOWN, EVIDENCE);
    expect(verdict.class).toBe('echo');
    expect(verdict.slots).toEqual(['v1']);
  });

  it('two reliable format facts (thousands, decimals) on the Amount control make it committed, applied, and the published value is the EXACT typed fill', () => {
    const sf = hardFacts(ORIGIN, [
      { key: KEY, v: { kind: 'thousands' } },
      { key: KEY, v: { kind: 'decimals' } },
    ]);
    expect(sf.facts.every((f) => f.hard && f.contra === 0)).toBe(true);
    // renderings() applies every reliable format IN SEQUENCE to one running
    // "core" (thousands, then decimals), so the offered spelling is the value
    // with BOTH applied, not one rendering per format.
    expect(slotRenderings(sf, URL_, CONTROLS, PARAMS)).toEqual({ v1: ['12,500.00'] });
    const verdict = classifyReportValueWithFacts(sf, URL_, CONTROLS, TEMPLATE, PARAMS, SHOWN, EVIDENCE);
    expect(verdict).toMatchObject({ class: 'committed', applied: true, value: 'created opportunity with amount 12500' });
  });

  it('byte-identical fallback: no facts reproduces classifyReportValue exactly', () => {
    const empty = emptyFacts(ORIGIN);
    expect(classifyReportValueWithFacts(empty, URL_, CONTROLS, TEMPLATE, PARAMS, SHOWN, EVIDENCE)).toEqual(
      classifyReportValue(TEMPLATE, PARAMS, SHOWN, EVIDENCE),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. fwkb39: "Backlog " trimmed — the fact is observed, but no Piece J/K
//    consumer's comparison is whitespace-sensitive, so it decides nothing
//    here (design's consumer 4, liveLines' rendered fill, is the one this
//    row needs, and it is not part of this contract's three pieces).
// ---------------------------------------------------------------------------

describe('fwkb39: a reliable trim format fact changes nothing in classify or identity (both already fold whitespace)', () => {
  const ORIGIN = 'http://kb.test';
  const URL_ = `${ORIGIN}/board`;
  const KEY = controlKey(URL_, 'link', 'Backlog');
  const sf = hardFacts(ORIGIN, [{ key: KEY, v: { kind: 'trim' } }]);

  it('slotRenderings still offers the trimmed spelling (renderings() applies `trim`)', () => {
    const controls: SlotControls = { v1: [{ role: 'link', name: 'Backlog' }] };
    expect(slotRenderings(sf, URL_, controls, { v1: ' Backlog ' })).toEqual({ v1: ['Backlog'] });
  });

  it('but classifyReportValueWithFacts decides no differently than today: wordrun already ignores whitespace', () => {
    const template = 'opened column {{v1}}';
    const params = { v1: ' Backlog ' };
    const shown = ['Opened column Backlog (3)'];
    const evidence: GivenEvidence = { typed: ['v1'], live: shown, committed: [] };
    const controls: SlotControls = { v1: [{ role: 'link', name: 'Backlog' }] };
    const plain = classifyReportValue(template, params, shown, evidence);
    const withFacts = classifyReportValueWithFacts(sf, URL_, controls, template, params, shown, evidence);
    // Already committed (the typed slot's wordrun is found in the live
    // line), not echo, in BOTH cases: "backlog" (folded) is a wordrun of
    // "Backlog (3)" whether the trailing/leading space was typed or not —
    // the fact changes nothing here.
    expect(plain.class).toBe('committed');
    expect(withFacts).toEqual(plain);
  });
});

// ---------------------------------------------------------------------------
// 3. fwgt8 / fwsi8: "Seed: … (#1)" — a read-back the exact tier misses,
//    pinned by a reliable affix rendering (design §3 consumer 3,
//    recorder.ts captureReadBack; readBackRenderings is its pure half)
// ---------------------------------------------------------------------------

describe('fwgt8 / fwsi8: readBackRenderings frames a value the exact read-back tier would miss', () => {
  const ORIGIN = 'http://gt.test';
  const URL_ = `${ORIGIN}/bench/seed-repo`;
  const LABEL = 'seed_name';
  const TPL = `Seed: My Repo (#${FRAME_MARK})`;

  it('the affix survives the tightened observer: remainder has letters, neither side of the mark continues a number', () => {
    expect(affixOfFrame(TPL)).toBe(TPL);
  });

  it('a reliable affix fact under the report key renders "1" as the full frame, not the bare value', () => {
    const sf = hardFacts(ORIGIN, [{ key: reportFormatKey(URL_, LABEL), v: { kind: 'affix', tpl: TPL } }]);
    const found = readBackRenderings(sf, URL_, LABEL, '1');
    expect(found).toEqual([{ text: 'Seed: My Repo (#1)', tpl: TPL, key: reportFormatKey(URL_, LABEL) }]);
  });

  it('byte-identical fallback: no facts, no renderings offered', () => {
    expect(readBackRenderings(emptyFacts(ORIGIN), URL_, LABEL, '1')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. fwkb41: "#4" — twice (innerText/textContent) recorded but deciding
//    nothing here, affix deciding the identity gate
// ---------------------------------------------------------------------------

describe('fwkb41: identityMarkerVerdictWithFacts passes a bare id on a reliable "#" affix fact; the twice fact rides along but decides nothing in this consumer', () => {
  const ORIGIN = 'http://kb.test';
  const URL_ = `${ORIGIN}/task/4`;
  const CONTROL_KEY = controlKey(URL_, 'link', 'Task');

  it('today, unaided: the marker "4" is not on the page as written (the page shows "#4")', () => {
    const verdict = identityMarkerVerdict(undefined, URL_, {}, '4', 'absent');
    expect(verdict.pass).toBe(false);
  });

  it('a reliable "#" affix fact renders "4" as "#4", which the live lines show whole — pass, applied', () => {
    const sf = hardFacts(ORIGIN, [
      { key: CONTROL_KEY, v: { kind: 'affix', tpl: `#${FRAME_MARK}` } },
      // the sweep's own "twice" observation for the same control: recorded, but
      // renderings() (and so this consumer) reads nothing from a `twice` kind
      { key: CONTROL_KEY, v: { kind: 'twice' } },
    ]);
    const look: IdentityLook = { presence: 'absent', lines: async () => ['Task #4 details'], title: async () => '' };
    // identityMarkerVerdictWithFacts reads every format key on the route, so
    // this control's own key (not only a `|title` key) is enough here.
    return identityMarkerVerdictWithFacts(sf, undefined, URL_, {}, '4', look).then((verdict) => {
      expect(verdict.pass).toBe(true);
      expect(verdict.applied).toBe(true);
      expect(verdict.reason).toContain('affix');
    });
  });

  it('byte-identical fallback: no facts, identityMarkerVerdictWithFacts matches identityMarkerVerdict exactly', async () => {
    const empty = emptyFacts(ORIGIN);
    const verdict = await identityMarkerVerdictWithFacts(empty, undefined, URL_, {}, '4', noLook);
    expect(verdict).toEqual(identityMarkerVerdict(undefined, URL_, {}, '4', 'absent'));
  });
});

// ---------------------------------------------------------------------------
// 5. fwvk15: vikunja identity — a title affix ("Task #4 (#4)") passes a
//    marker the plain gate refused
// ---------------------------------------------------------------------------

describe('fwvk15: identityMarkerVerdictWithFacts passes on the TITLE\'s reliable affix', () => {
  const ORIGIN = 'http://vk.test';
  const URL_ = `${ORIGIN}/tasks/4`;
  const TITLE_TPL = `Task #4 (${FRAME_MARK})`;

  it('today, unaided: refused (unknown presence, no url record part to fall back on)', () => {
    const verdict = identityMarkerVerdict(undefined, URL_, {}, '#4', 'unknown');
    expect(verdict.pass).toBe(false);
  });

  it('a reliable title affix fact renders "#4" as the exact title — pass, applied, naming the fact', async () => {
    const sf = hardFacts(ORIGIN, [{ key: titleKey(URL_), v: { kind: 'affix', tpl: TITLE_TPL } }]);
    const look: IdentityLook = { presence: 'unknown', lines: async () => null, title: async () => 'Task #4 (#4)' };
    const verdict = await identityMarkerVerdictWithFacts(sf, undefined, URL_, {}, '#4', look);
    expect(verdict).toMatchObject({ pass: true, applied: true });
    expect(verdict.reason).toContain('#4');
  });
});

// ---------------------------------------------------------------------------
// 6. fwop10 / fwod85: innerText/textContent "twice" — observed, but
//    `renderings()` (and so every Piece J consumer) reads nothing from it:
//    consumer 3's captureReadBack is the one this row decides through, at
//    the exact-vs-hidden-duplicate DOM check, out of this file's reach
//    without a live page
// ---------------------------------------------------------------------------

describe('fwop10 / fwod85: a "twice" format fact is recorded but spells nothing (renderings() is empty for it)', () => {
  const ORIGIN = 'http://op.test';
  const URL_ = `${ORIGIN}/work_packages/7`;

  it('sweptObservations records `twice` for a role/name pair, hard, from the sweep\'s own unoffered-occurrence evidence', () => {
    const found = sweptObservations(URL_, [{ kind: 'twice', role: 'cell', name: 'Subject' }]);
    expect(found).toEqual([{ key: controlKey(URL_, 'cell', 'Subject'), v: { kind: 'twice' }, hard: true, ev: 'shown twice, one copy unrendered' }]);
  });

  it('once merged, the fact is reliable but renderings() offers nothing under its key: `twice` describes the field, it does not spell a value', () => {
    const key = controlKey(URL_, 'cell', 'Subject');
    const sf = hardFacts(ORIGIN, [{ key, v: { kind: 'twice' } }]);
    expect(sf.facts[0].hard).toBe(true);
    const controls: SlotControls = { v1: [{ role: 'cell', name: 'Subject' }] };
    expect(slotRenderings(sf, URL_, controls, { v1: 'Demo Task' })).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 7. odoo's `£ 2,{{=}}` and `{{=}} Bench Customer`: the tightened observer
//    REFUSES both (round 67's over-generalisation), the reason stage 2's
//    exit requires no `£ 2,{{=}}`-class fact in any published store
// ---------------------------------------------------------------------------

describe("odoo's £ 2,{{=}} and {{=}} Bench Customer: the tightened observer refuses both frames", () => {
  it('£ 2,{{=}} is refused: the character before the mark is a digit-group separator next to a digit (cut from a number)', () => {
    const frame = `£ 2,${FRAME_MARK}`;
    expect(affixOfFrame(frame)).toBeNull();
    expect(frameObservation('http://od.test/sale/12', 'amount_total', frame, true)).toBeNull();
  });

  it('{{=}} Bench Customer is refused: the value IS a declared var\'s value (the runid folded into the customer name), even though the frame itself would otherwise pass', () => {
    const frame = `${FRAME_MARK} Bench Customer`;
    // the frame alone (no var check) is a valid affix: letters in the
    // remainder, neither side of the mark continues a number
    expect(affixOfFrame(frame)).toBe(frame);
    const value = 'fwod93-n1';
    const vars = ['fwod93-n1'];
    expect(frameObservation('http://od.test/sale/12', 'ref', frame, true, value, vars)).toBeNull();
    // a value that is NOT a declared var still observes normally
    expect(frameObservation('http://od.test/sale/12', 'ref', frame, true, 'Bench Widget Co', vars)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. fwod-cv3 counters: odoo's leading-count menu name — round 68's parity
//    gap (the artifact insisted on "6 3", the daemon tolerated it) closed by
//    extending maskCounters to ANY role a `counter` fact names
// ---------------------------------------------------------------------------

describe('fwod-cv3 counters: maskCountersWithFacts extends maskCounters to a role the fixed regex does not cover', () => {
  const ORIGIN = 'http://od.test';
  const URL_ = `${ORIGIN}/web`;
  const LINE = '- option "6 3 YourCompany"'; // "option" is NOT in maskCounters' fixed role list

  it("today, unaided: maskCounters leaves an \"option\" role's leading counts alone", () => {
    expect(maskCounters(LINE)).toBe(LINE);
  });

  it('a reliable counter fact on option|YourCompany masks it the same way maskCounters masks menu/button/etc', () => {
    const sf = softFacts(ORIGIN, [{ key: controlKey(URL_, 'option', 'YourCompany'), v: { kind: 'counter' } }]);
    const names = counterNames(sf, URL_);
    expect(names).toEqual(['option|YourCompany']);
    expect(maskCountersWithFacts(LINE, names)).toBe(`- option "${WILDCARD} YourCompany"`);
  });

  it('a role ALREADY in maskCounters\' own list is unaffected either way (menu is covered natively)', () => {
    const menuLine = '- menu "6 3 YourCompany"';
    expect(maskCounters(menuLine)).toBe(`- menu "${WILDCARD} YourCompany"`);
    expect(maskCountersWithFacts(menuLine, [])).toBe(maskCounters(menuLine));
  });

  it('byte-identical fallback: counterNames on an empty store is [], and maskCountersWithFacts(line, []) IS maskCounters(line)', () => {
    expect(counterNames(emptyFacts(ORIGIN), URL_)).toEqual([]);
    expect(maskCountersWithFacts(LINE, [])).toBe(maskCounters(LINE));
  });
});
