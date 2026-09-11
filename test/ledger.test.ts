/**
 * The RunLedger and its leak scanner, checked against the artifacts that
 * exposed each defect. Phase 1 of PLAN-provenance.md: before the ledger is
 * allowed to replace anyone's recognition logic, it has to reproduce every
 * leak we found the slow way — by reading drift files after a two-hour cloud
 * sweep. If a case here does not fire, the ledger is incomplete, and that is
 * the finding.
 */
import { describe, expect, it } from 'vitest';
import { RunLedger, evidenced, fatal, inLocator, occursAsToken, scanForLeaks } from '../src/skills/ledger.js';
import { looksLikeId } from '../src/skills/shape.js';
import { primaryFor } from '../src/daemon/recorder.js';

describe('looksLikeId (the one copy)', () => {
  it('accepts minted ids, including the three-character ones', () => {
    expect(looksLikeId('t15', 'first-run')).toBe(true); // fwrd16: six flow steps kept #/tickets/t15
    expect(looksLikeId('RD-1015', 'first-run')).toBe(true);
    expect(looksLikeId('afwfbbc2of6rkf', 'first-run')).toBe(true); // grafana uid: no digit, but long
    expect(looksLikeId('fwrd17-n2', 'first-run')).toBe(true);
  });

  it('rejects a slug: a hyphenated pair of words is a route, not an id', () => {
    // Every one of these was banked from a url and made the export gate refuse
    // a whole recording: grafana's dashboard slug, atelyr's route segment.
    expect(looksLikeId('bench-service-health', 'first-run')).toBe(false);
    expect(looksLikeId('service-health', 'first-run')).toBe(false);
    expect(looksLikeId('project-manager', 'first-run')).toBe(false);
    // A separator makes a reference when a digit comes with it...
    expect(looksLikeId('RD-1015', 'first-run')).toBe(true);
    expect(looksLikeId('fwrd24l-n1', 'first-run')).toBe(true);
    // ...and a digitless opaque token still qualifies on length, which is what
    // grafana's uids need ("cfwcsdxqdjabkf" sank fwgr2).
    expect(looksLikeId('cfwcsdxqdjabkf', 'first-run')).toBe(true);
  });

  it('rejects prose, so an observed error message is not a reference', () => {
    // fwrd23l refused a clean 37-minute export because the app's validation
    // heading was reported as a value, cleared the `length >= 12` clause meant
    // for digitless uids, and was banked as an identifier.
    expect(looksLikeId('Ticket is not ready', 'first-run')).toBe(false);
    expect(looksLikeId('No parts on this ticket yet.', 'first-run')).toBe(false);
    expect(looksLikeId('Bench Customer', 'first-run')).toBe(false);
    // ...while the digitless uid that clause exists for still passes.
    expect(looksLikeId('afwfbbc2of6rkf', 'first-run')).toBe(true);
  });

  it('rejects route words, which is what stops a url turning into prose', () => {
    expect(looksLikeId('tickets', 'first-run')).toBe(false);
    expect(looksLikeId('dashboards', 'first-run')).toBe(false);
    expect(looksLikeId('new', 'first-run')).toBe(false);
    expect(looksLikeId('d', 'first-run')).toBe(false);
  });
});

describe('token boundaries', () => {
  it('binds on underscores and not on hyphens', () => {
    // fwod5 shipped a ref rewritten through the middle of an identifier.
    expect(occursAsToken('o_form_view_group', 'form')).toBe(false);
    expect(occursAsToken('x7-bench-dashboard', 'x7')).toBe(true);
    expect(occursAsToken('the ticket RD-1015 is ready', 'RD-1015')).toBe(true);
    expect(occursAsToken('RD-10159', 'RD-1015')).toBe(false);
  });
});

describe('banking values', () => {
  it('gives the minting step ownership — first appearance wins', () => {
    const l = new RunLedger();
    l.addUrlIds('http://app/d/afwfbbc2of6rkf/x', '02-create', [
      { label: 'p0', value: 'd' },
      { label: 'p1', value: 'afwfbbc2of6rkf' },
    ]);
    // A later step landing on the same uid must not re-mint it.
    l.addUrlIds('http://app/d/afwfbbc2of6rkf/settings', '05-edit', [{ label: 'p1', value: 'afwfbbc2of6rkf' }]);
    const banked = l.all().filter((e) => e.value === 'afwfbbc2of6rkf');
    expect(banked.length).toBe(1);
    expect(banked[0].binding).toEqual({ from: 'url', step: '02-create', label: 'p1' });
  });

  it('does not bank route words from a url', () => {
    const l = new RunLedger();
    l.addUrlIds('http://app/#/tickets', '01-open', [{ label: 'h0', value: 'tickets' }]);
    expect(l.all()).toEqual([]);
  });

  it('records WHAT entitled each entry to its kind, not merely that the run made it', () => {
    const l = new RunLedger();
    // A declared var is run-scoped because the caller said so.
    l.add('fwrd17-n2', { from: 'var', name: 'runid' });
    // A reported value's kind comes from looksLikeId and nothing else.
    l.add('SKU-4471', { from: 'output', step: '01-open', name: 'code' });
    expect(l.values({ basis: 'var' })).toEqual(['fwrd17-n2']);
    expect(l.values({ basis: 'shape' })).toEqual(['SKU-4471']);
    // Both are kinded identifier; they are not equally believed.
    expect(l.all().map((e) => e.kind)).toEqual(['identifier', 'identifier']);
  });

  it('says which arm of addUrlIds admitted a part', () => {
    const l = new RunLedger();
    // Position: odoo's `#id=44` is a record id whatever its characters.
    l.addUrlIds('http://app/web#id=44', '01-open', [{ label: 'q.id', value: '44' }]);
    // Shape: a path segment that merely looks minted.
    l.addUrlIds('http://app/d/afwfbbc2of6rkf', '02-open', [{ label: 'p1', value: 'afwfbbc2of6rkf' }]);
    expect(l.all().map((e) => [e.value, e.basis])).toEqual([
      ['44', 'position'],
      ['afwfbbc2of6rkf', 'shape'],
    ]);
  });
});

describe('refusing an export is reserved for what we actually know', () => {
  const leakIn = (where: string, basis: 'position' | 'var' | 'variance' | 'shape') => ({
    where,
    value: 'SKU-4471',
    binding: { from: 'output' as const, step: '01-open', name: 'code' },
    kind: 'identifier' as const,
    basis,
    context: 'SKU-4471',
  });

  it('does not bin a recording on the strength of a regex', () => {
    // The reachable false refusal: an app constant the model reported, kinded
    // identifier by shape, standing as a step's only locator. Before this it
    // threw and the whole recording went to .rejected.json.
    expect(fatal(leakIn('steps[2].locators.target[0].name', 'shape'))).toBe(false);
    // Still reported, still stripped where the chain survives without it —
    // the leak is not ignored, only demoted from fatal.
    expect(inLocator(leakIn('steps[2].locators.target[0].name', 'shape'))).toBe(true);
  });

  it('still refuses when something other than the spelling says so', () => {
    expect(fatal(leakIn('steps[2].locators.target[0].name', 'position'))).toBe(true);
    expect(fatal(leakIn('steps[2].locators.target[0].name', 'var'))).toBe(true);
    // The deferred case: run 2 landed a different value in the same place.
    expect(fatal(leakIn('steps[2].locators.target[0].name', 'variance'))).toBe(true);
  });

  it('keeps the location bar unchanged — a loud leak is still not fatal', () => {
    // A stale urlPattern refuses its own skill and says so; refusing an export
    // over a defect that already announces itself only teaches --force.
    expect(fatal(leakIn('preconditions.urlPattern', 'position'))).toBe(false);
    expect(fatal(leakIn('reportTemplate', 'variance'))).toBe(false);
  });
});

describe('the scanner reproduces every leak we found the slow way', () => {
  /** A ledger shaped like the recording run of the repairdesk flow. */
  const repairdesk = (): RunLedger => {
    const l = new RunLedger();
    l.add('fwrd17-n1', { from: 'var', name: 'runid' });
    l.addUrlIds('http://127.0.0.1:4180/#/tickets/t15', '01-open', [
      { label: 'h0', value: 'tickets' },
      { label: 'h1', value: 't15' },
    ]);
    l.add('RD-1015', { from: 'output', step: '01-open', name: 'ref' }, { kind: 'identifier', known: true });
    return l;
  };

  it('fwrd16: a literal record id left in a flow instruction', () => {
    const flow = {
      steps: [
        { id: '04-open', instruction: "On the ticket detail page for {{02-create.ref}} (currently open at #/tickets/t15), add a part." },
      ],
    };
    const leaks = scanForLeaks(flow, repairdesk());
    expect(leaks.length).toBe(1);
    expect(leaks[0].value).toBe('t15');
    expect(leaks[0].where).toBe('steps[0].instruction');
  });

  it('fwgr6: a minted uid embedded in a skill template', () => {
    const l = new RunLedger();
    l.add('fwgr6-n1', { from: 'var', name: 'runid' });
    l.addUrlIds('http://127.0.0.1:3000/d/afwfbbc2of6rkf/fwgr6-n1-bench-dashboard', '02-create', [
      { label: 'p0', value: 'd' },
      { label: 'p1', value: 'afwfbbc2of6rkf' },
    ]);
    const skill = {
      template: 'In Grafana at http://127.0.0.1:3000/d/afwfbbc2of6rkf/{{v1}}-bench-dashboard, add a {{v2}} panel.',
      steps: [{ tool: 'click', args: {}, locators: {} }],
    };
    const leaks = scanForLeaks(skill, l);
    expect(leaks.map((k) => k.value)).toEqual(['afwfbbc2of6rkf']);
    expect(leaks[0].binding).toEqual({ from: 'url', step: '02-create', label: 'p1' });
  });

  it('fwrd12l: the recording run id baked into a locator anchor', () => {
    const skill = {
      steps: [
        {
          tool: 'click',
          args: { target: '@e1' },
          locators: { target: [{ kind: 'scoped', container: 'tr', hasText: 'fwrd17-n1', selector: 'td' }] },
        },
      ],
    };
    const leaks = scanForLeaks(skill, repairdesk());
    expect(leaks.length).toBe(1);
    expect(leaks[0].where).toBe('steps[0].locators.target[0].hasText');
  });

  it('a properly slotted artifact is clean', () => {
    const skill = {
      template: "Open ticket {{v2}} titled '{{v1}} RD Bench Ticket'",
      steps: [
        {
          tool: 'click',
          args: { target: '@e1' },
          locators: { target: [{ kind: 'scoped', container: '#ticket-rows tr', hasText: '{{v1}} RD Bench Ticket', selector: 'td' }] },
        },
      ],
      preconditions: { urlPattern: 'http://127.0.0.1:4180/#/tickets/:id' },
    };
    expect(scanForLeaks(skill, repairdesk())).toEqual([]);
  });

  it('reports where the value came from, so a leak names its own fix', () => {
    const leaks = scanForLeaks({ template: 'go to #/tickets/t15 and read RD-1015' }, repairdesk());
    expect(leaks.map((l) => [l.value, l.binding.from])).toEqual([
      ['RD-1015', 'output'],
      ['t15', 'url'],
    ]);
  });
});

describe('a raw text target is recorded as text, not css', () => {
  it('maps the quoted form, which is what disarmed the identity guard', () => {
    // fwrd19l 01-open/02-open: the agent's own `text="..."` target was kept
    // verbatim at the head of the chain and typed css, so identityOfPrimary
    // (which skips css by design) saw no identity and every fallback —
    // including tr:nth-of-type(1) — was accepted unchecked.
    expect(primaryFor('text="x7 RD Bench Ticket"')).toEqual({ kind: 'text', text: 'x7 RD Bench Ticket' });
    expect(primaryFor("text='x7 RD Bench Ticket'")).toEqual({ kind: 'text', text: 'x7 RD Bench Ticket' });
  });

  it('leaves everything else css, including the forms that do not mean exact', () => {
    // Unquoted is substring + case-insensitive and the regex form is neither;
    // typing them as `text` would silently NARROW what the agent asked for.
    expect(primaryFor('text=Ready')).toEqual({ kind: 'css', selector: 'text=Ready' });
    expect(primaryFor('text=/^Ready$/')).toEqual({ kind: 'css', selector: 'text=/^Ready$/' });
    expect(primaryFor('#ticket-rows tr')).toEqual({ kind: 'css', selector: '#ticket-rows tr' });
    expect(primaryFor('button:has-text("Save")')).toEqual({ kind: 'css', selector: 'button:has-text("Save")' });
  });
});

describe('fatal leaks', () => {
  const at = (where: string, kind: 'identifier' | 'name' | 'text') => ({
    where, kind, value: 'x', binding: { from: 'input' } as const, context: 'x',
  });
  it('is an identifier in a LOCATOR, and nothing else', () => {
    expect(fatal(at('s.steps[0].locators.target[1].text', 'identifier'))).toBe(true);
    // A precondition is loud: a stale urlPattern or requireText makes the
    // skill refuse and the step says so. Grafana puts a minted uid in almost
    // every precondition, so treating those as fatal refused whole recordings
    // for a defect that announces itself.
    expect(fatal(at('s.preconditions.urlPattern', 'identifier'))).toBe(false);
    expect(fatal(at('s.preconditions.requireText[0]', 'identifier'))).toBe(false);
    // Text the run OBSERVED rather than made: a locator matching the app's own
    // copy is doing its job, and refusing an export over it trains people to
    // force past the gate.
    expect(fatal(at('s.steps[0].locators.target[1].text', 'text'))).toBe(false);
    // Announces itself at replay, so it warns rather than blocks.
    expect(fatal(at('s.reportTemplate.summary', 'identifier'))).toBe(false);
    expect(fatal(at('s.steps[0].expect.urlPattern', 'identifier'))).toBe(false);
  });

  it('is NOT a navigation target, which one run cannot judge', () => {
    // This was fatal for one release cycle, on sound reasoning: fwgr11 went to
    // /d/<run-1-uid>/{{runid}}-bench-dashboard and a url is a locator for a
    // page. As a gate it then refused fwod19, a clean 6/6 recording, over
    // `action=123` in `#action=123&cids=1&menu_id=81` — Odoo's Discuss MENU
    // id, identical every run, and looksLikeId("123") is true.
    //
    // Telling an app constant from a minted uid needs a SECOND run. A gate may
    // only enforce what one run can establish, so the check moved to
    // bench/verify-artifacts.mjs where being wrong costs a look, not a sweep.
    // See PLAN-evidence-over-shape.md.
    expect(fatal(at('s.steps[0].args.url', 'identifier'))).toBe(false);
  });
});

describe('id-position url parts', () => {
  it('a q.id part is an identifier by position, whatever its length', async () => {
    const { idPositionPart, RunLedger } = await import('../src/skills/ledger.js');
    expect(idPositionPart({ label: 'q.id', value: '44' })).toBe(true);
    // Exactly `id` — a `<thing>_id` param addresses app chrome, not a record.
    // fwod29 banked odoo's menu_id=181 (identical every run) under the wider
    // `.*_id` match and flunked the navigation check on a clean 8/8 sweep.
    expect(idPositionPart({ label: 'q.res_id', value: '7' })).toBe(false);
    expect(idPositionPart({ label: 'q.menu_id', value: '181' })).toBe(false);
    // shape still matters when the label is not an id slot
    expect(idPositionPart({ label: 'q.view_type', value: '44' })).toBe(false);
    // and an id-named param carrying a word is routing, not a record number
    expect(idPositionPart({ label: 'q.id', value: 'form' })).toBe(false);
    // odoo's contact id 44 must reach the ledger — every guard downstream of
    // it missed fwod27's stale-record leak because this value never banked
    const ledger = new RunLedger();
    const banked = ledger.addUrlIds('http://x/#id=44&model=res.partner', 'i2', [
      { label: 'q.id', value: '44' },
      { label: 'q.model', value: 'res.partner' },
    ]);
    expect(banked.map((b) => b.value)).toEqual(['44']);
  });

  it('does not bank a pure-digit query param the app names something other than id', async () => {
    const { RunLedger } = await import('../src/skills/ledger.js');
    // fwod29's false alarm: odoo's window-action and menu numbers are routing
    // constants shared by every run, but `action=315` passed identifierLike
    // and banked as a run-made identifier. The app's own vocabulary decides:
    // a numeric QUERY param not named `id` is chrome; a digit run in a PATH
    // position (/tickets/315) is still the record it points at.
    const ledger = new RunLedger();
    const banked = ledger.addUrlIds('http://x/web#cids=1&menu_id=181&action=315', 'i1', [
      { label: 'q.cids', value: '1' },
      { label: 'q.menu_id', value: '181' },
      { label: 'q.action', value: '315' },
    ]);
    expect(banked).toEqual([]);
    const pathBanked = ledger.addUrlIds('http://x/tickets/315', 'i2', [{ label: 'p1', value: '315' }]);
    expect(pathBanked.map((b) => b.value)).toEqual(['315']);
  });
});

describe('what earlier runs settled outranks what the characters say', () => {
  const load = () => import('../src/skills/ledger.js');

  it('banks a value a run watched change, however ordinary it looks', async () => {
    const { RunLedger } = await load();
    // The case shape.ts exists for and cannot reach: a record reference with
    // no digit and no separator. `looksLikeId("Order Alpha")` is false, so
    // before this the ledger kinded it `text`, fatal() declined to call its
    // leak fatal, and the compiled locator carried the recording's record
    // into every replay while every check passed.
    const blind = new RunLedger();
    expect(blind.add('Order Alpha', { from: 'output', step: 'i1', name: 'ref' })!.kind).toBe('text');

    const taught = new RunLedger();
    taught.seedVariance(['Order Alpha']);
    const e = taught.add('Order Alpha', { from: 'output', step: 'i1', name: 'ref' })!;
    expect(e.kind).toBe('identifier');
    // ...and says WHY, which is what lets fatal() act on it: `shape` is a
    // warning, `variance` refuses.
    expect(e.basis).toBe('variance');
  });

  it('does NOT let agreement across runs demote an identifier', () => {
    // The trap this API is shaped to make unspellable. A bench app reset
    // between runs reproduces a minted record id exactly — every repair-desk
    // recording in bench/results creates ticket `t15` — so "every run
    // produced the same value" is not evidence the app owns it.
    //
    // An earlier cut of this carried verdicts both ways and would have
    // stopped banking t15 from run 2 on: no leak guard could see it, and the
    // recording's ticket would ride into every replay silently. Evidence may
    // only ADD, so there is no way to seed "this is furniture".
    const l = new RunLedger();
    l.seedVariance([]); // however many runs agreed, nothing is recorded
    expect(l.add('t15', { from: 'output', step: 'i1', name: 'ref' })!.kind).toBe('identifier');
  });

  it('sees a record id in a position that has no name to read', async () => {
    const { RunLedger } = await load();
    // A grafana uid at `p1`: no `q.id` to vouch for it, so position cannot
    // help and shape was the only arm left. The fwod29 digit patch and the
    // shape floor both stand aside for a value a run demonstrated changes.
    const l = new RunLedger();
    l.seedVariance(['7']);
    const banked = l.addUrlIds('http://x/web#menu=7', 'i1', [{ label: 'q.menu', value: '7' }]);
    expect(banked.map((b) => [b.value, b.basis])).toEqual([['7', 'variance']]);
  });

  it('is empty on a first recording, so run 1 still proposes with shape', async () => {
    const { RunLedger } = await load();
    const l = new RunLedger();
    expect(l.runSpecific('t15')).toBe(false);
    expect(l.add('t15', { from: 'output', step: 'i1', name: 'ref' })!.basis).toBe('shape');
  });

  it('leaves the run-1 arms exactly as they were when there is no evidence', () => {
    // The whole mechanism is additive, so a first recording must behave
    // identically to before it existed — including fwod29's digit patch,
    // which still refuses odoo's routing numbers.
    const l = new RunLedger();
    expect(l.addUrlIds('http://x/web#cids=1&menu_id=181&action=315', 'i1', [
      { label: 'q.cids', value: '1' },
      { label: 'q.menu_id', value: '181' },
      { label: 'q.action', value: '315' },
    ])).toEqual([]);
    // ...and a run that WATCHED action=315 change banks it, patch and all.
    const taught = new RunLedger();
    taught.seedVariance(['315']);
    expect(taught.addUrlIds('http://x/web#action=315', 'i1', [{ label: 'q.action', value: '315' }])
      .map((b) => [b.value, b.basis])).toEqual([['315', 'variance']]);
  });
});

describe('evidenced leaks', () => {
  it('separates a value known to be this run from one judged by shape', () => {
    // fwrd45: 183 unslotted values, the first ten printed, all page copy — and
    // the runid baked into 06-change's expectations was not among them.
    const l = new RunLedger();
    l.add('fwrd45-n1', { from: 'var', name: 'runid' }, { vouched: true });
    l.add('Ready', { from: 'output', step: 'i5', name: 'status' });
    l.addUrlIds('http://h/#id=44&model=sale.order', 'i2', [{ label: 'q.id', value: '44' }]);
    const skill = {
      template: 'x',
      steps: [{ tool: 'click', args: {}, locators: {}, expect: { addedContains: ['- row "fwrd45-n1 RD Part B"', '- button "Ready"', '- cell "44"'] } }],
    };
    const leaks = scanForLeaks(skill, l, 's');
    const byValue = (v: string) => leaks.find((x) => x.value === v)!;
    expect(evidenced(byValue('fwrd45-n1'))).toBe(true);
    expect(evidenced(byValue('44'))).toBe(true);
    expect(evidenced(byValue('Ready'))).toBe(false);
  });
});
