/**
 * The RunLedger and its leak scanner, checked against the artifacts that
 * exposed each defect. Phase 1 of notes/PLAN-provenance.md: before the ledger is
 * allowed to replace anyone's recognition logic, it has to reproduce every
 * leak we found the slow way — by reading drift files after a two-hour cloud
 * sweep. If a case here does not fire, the ledger is incomplete, and that is
 * the finding.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RunLedger, bindingKey, evidenced, fatal, inLocator, navigationLeaks, occursAsToken, scanForLeaks, slotKnownRunValues, urlVarianceValues, withoutOwnOutputs } from '../src/skills/ledger.js';
import { remapParams, varyingValues, type Flow } from '../src/skills/flow.js';
import { compileSkill } from '../src/skills/compile.js';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import type { Skill } from '../src/skills/store.js';
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

describe('navigationLeaks: a recovery skill that would navigate to a record this run made (fwod45)', () => {
  const skillWithGoto = (url: string) => ({ steps: [{ tool: 'goto', args: { url }, locators: {} }] });

  it('refuses an `id=` record an EARLIER step minted, not only one this step minted', () => {
    const l = new RunLedger();
    l.addUrlIds('http://odoo/web#menu_id=194&action=316&model=sale.order&view_type=form&id=22', 'i2', [
      { label: 'q.menu_id', value: '194' },
      { label: 'q.id', value: '22' },
    ]);
    const leaks = scanForLeaks(skillWithGoto('http://odoo/web#menu_id=194&action=316&model=sale.order&view_type=form&id=22'), l, 's_f7e29f');
    expect(navigationLeaks(leaks, 'i4')).toEqual(['22']);
  });

  it('refuses a uid an EARLIER instruction banked from a path position, whatever the basis (fwgr41)', () => {
    // fwgr41-n2's recovery welded its own dashboard uid into `goto /d/<uid>/…`.
    // The uid was banked on SHAPE under an earlier instruction (the run had
    // landed on the dashboard at 02-create), so the basis test filtered the
    // leak out, n3 pinned the skill, and it navigated to a dashboard that no
    // longer existed. A url POSITION identifier is the record whoever minted it.
    const l = new RunLedger();
    l.addUrlIds('http://app/d/afwfbbc2of6rkf', 'i2', [{ label: 'p1', value: 'afwfbbc2of6rkf' }]);
    expect(l.all().map((e) => e.basis)).toEqual(['shape']);
    const leaks = scanForLeaks(skillWithGoto('http://app/d/afwfbbc2of6rkf'), l, 's_x');
    expect(navigationLeaks(leaks, 'i4')).toEqual(['afwfbbc2of6rkf']);
    expect(navigationLeaks(leaks, 'i2')).toEqual(['afwfbbc2of6rkf']);
  });

  it('leaves odoo’s menu/action constants alone — they never reach a leak at all (fwod19)', () => {
    // The counter-example the basis test used to buy: `#action=123&menu_id=81`
    // is odoo's Discuss menu, identical on every run, and demoting a skill over
    // it refused a clean 6/6 recording. It stays out upstream now — addUrlIds
    // does not bank a digit run at a query/state key the app does not call
    // `id` — so navigationLeaks never sees it and needs no exemption.
    const url = 'http://127.0.0.1:8069/web#action=123&cids=1&menu_id=81';
    const l = new RunLedger();
    l.addUrlIds(url, 'i1', [
      { label: 'q.action', value: '123' },
      { label: 'q.cids', value: '1' },
      { label: 'q.menu_id', value: '81' },
    ]);
    expect(l.all()).toEqual([]);
    expect(navigationLeaks(scanForLeaks(skillWithGoto(url), l, 's_y'), 'i4')).toEqual([]);
  });
});

describe('urlVarianceValues: what a run WATCHED a url position hold (fwgr41)', () => {
  it('banks both sides of a path segment the run saw differ', () => {
    // fwgr41-n2, one step before it stopped on the recorded uid being gone.
    expect(
      urlVarianceValues([{ where: 'path', index: 1, expected: 'afyd7g0300dfkc', actual: 'bfyd7wj0ceolcf' }]),
    ).toEqual(['afyd7g0300dfkc', 'bfyd7wj0ceolcf']);
  });

  it('banks a hash-path segment and an `id=` position, which the url itself calls the record', () => {
    expect(urlVarianceValues([{ where: 'hashPath', index: 1, expected: 't15', actual: 't19' }])).toEqual(['t15', 't19']);
    expect(urlVarianceValues([{ where: 'hashState', key: 'id', expected: '22', actual: '23' }])).toEqual(['22', '23']);
    expect(urlVarianceValues([{ where: 'query', key: 'id', expected: '22', actual: '23' }])).toEqual(['22', '23']);
  });

  it('ignores a view/state key: those two runs were looking at different pages (fwod20, rpod1)', () => {
    // rpod1 printed exactly this pair as a volatile-segment warning. Banking
    // `form` as an identifier would make every locator naming it a fatal leak,
    // and fwod20 showed that this is what "21 parts varied" was made of.
    expect(
      urlVarianceValues([
        { where: 'hashState', key: 'model', expected: 'res.partner', actual: 'sale.order' },
        { where: 'hashState', key: 'view_type', expected: 'form', actual: 'list' },
        { where: 'hashState', key: 'menu_id', expected: '194', actual: '181' },
      ]),
    ).toEqual([]);
  });

  it('feeds the ledger, so the value banks by evidence instead of by its characters', () => {
    // The point of the whole path: "abcd" is not an id to any regex, and a run
    // that watched it change is not guessing.
    const l = new RunLedger();
    l.seedVariance(urlVarianceValues([{ where: 'path', index: 2, expected: 'abcd', actual: 'efgh' }]));
    l.addUrlIds('http://app/x/y/efgh', 'i7', [{ label: 'p2', value: 'efgh' }]);
    expect(l.all().map((e) => [e.value, e.kind, e.basis])).toEqual([['efgh', 'identifier', 'variance']]);
  });

  it('survives a stopped run: the flow banks it and the next run seeds from it', () => {
    // FlowStep.urlVariance is written whether or not the step completed, which
    // is what `varyingValues` — the next run's seed — reads.
    const flow: Flow = {
      name: 'fwgr41', origin: 'http://app', startUrl: 'http://app/', vars: [],
      provenance: { session: 's', created: '' },
      steps: [
        { id: '06-find', instruction: 'open the dashboard', outputs: [], recorded: {}, urlVariance: ['afyd7g0300dfkc', 'bfyd7wj0ceolcf'] },
      ],
    };
    expect([...varyingValues(flow)]).toEqual(['afyd7g0300dfkc', 'bfyd7wj0ceolcf']);
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
    // See notes/PLAN-evidence-over-shape.md.
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

describe('a short record id in a path position (fwop2 06-open)', () => {
  // OpenProject addresses a work package as `/work_packages/details/41/…`.
  // 02-create minted 41 at `p4`; the length floor kept it out of the ledger,
  // so 06-open's compile had no origin to slot its `goto …/details/41/activity`
  // against and s_71f332 step 7 sent every replay to a deleted work package.
  const created = 'http://127.0.0.1:8090/projects/bench-project/work_packages/details/41/overview';
  const parts = [
    { label: 'p0', value: 'projects' },
    { label: 'p1', value: 'bench-project' },
    { label: 'p2', value: 'work_packages' },
    { label: 'p3', value: 'details' },
    { label: 'p4', value: '41' },
    { label: 'p5', value: 'overview' },
  ];

  it('banks a two-digit path id at its position', async () => {
    const { pathIdPart } = await import('../src/skills/ledger.js');
    expect(pathIdPart({ label: 'p4', value: '41' })).toBe(true);
    expect(pathIdPart({ label: 'h1', value: '41' })).toBe(true);
    const l = new RunLedger();
    const banked = l.addUrlIds(created, 'i2', parts);
    expect(banked.map((e) => [bindingKey(e.binding), e.value, e.kind])).toEqual([['url:i2:p4', '41', 'identifier']]);
  });

  it('vouches past the floor only — shape basis, so it never refuses a recording on its own', () => {
    // A path digit run can be an app constant a click revealed (fwod19's
    // lesson for query params), so banking it must not quarantine a step
    // whose locator happens to carry the same digits.
    const l = new RunLedger();
    const [entry] = l.addUrlIds(created, 'i2', parts);
    expect(entry.basis).toBe('shape');
    const [leak] = scanForLeaks({ steps: [{ locators: { target: [{ kind: 'role', role: 'heading', name: 'Task (#41)' }] } }] }, l, 's');
    expect(leak.value).toBe('41');
    expect(fatal(leak)).toBe(false);
    // ...while a recovery that NAVIGATES to it is still the recording's record.
    expect(navigationLeaks(scanForLeaks({ steps: [{ args: { url: 'http://127.0.0.1:8090/projects/bench-project/work_packages/41/activity' } }] }, l, 's'))).toEqual(['41']);
  });

  it('leaves single digits and non-id query params where they were', async () => {
    const { pathIdPart } = await import('../src/skills/ledger.js');
    // One digit is a page number or a tab index as often as a record.
    expect(pathIdPart({ label: 'p1', value: '7' })).toBe(false);
    // Query/state keys keep their own rule (idPositionPart; fwod29's patch).
    expect(pathIdPart({ label: 'q.menu_id', value: '81' })).toBe(false);
    // A word or a mixed token below the floor is not a digit run.
    expect(pathIdPart({ label: 'p2', value: 'v2' })).toBe(false);
    const l = new RunLedger();
    expect(l.addUrlIds('http://x/projects/7', 'i1', [{ label: 'p0', value: 'projects' }, { label: 'p1', value: '7' }])).toEqual([]);
    expect(l.addUrlIds('http://x/web#menu_id=81', 'i1', [{ label: 'q.menu_id', value: '81' }])).toEqual([]);
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

describe('slotKnownRunValues (fwod47 goal/report leaks)', () => {
  const orderUrl = 'http://app/web#model=sale.order&view_type=form&id=21';
  const skill = (): Skill => ({
    id: 's_cancel',
    origin: 'http://app',
    template: 'cancel order {{v1}} for {{v3}}',
    params: {
      v1: { example: 'S00021', usedIn: [1], known: true, binding: 'output:i2:quotation_reference' },
      v3: { example: 'fwod47-n1', usedIn: [], known: true, binding: 'var:runid' },
    },
    preconditions: { urlPattern: 'http://app/web' },
    steps: [],
    goal: { requireText: ['Cancelled', orderUrl, 'fwod47-n1 Bench Customer'] },
    reportTemplate: {
      summary: 'Cancelled order {{v1}} (record id=21).',
      values: { order_reference: '{{v1}}', url_after_cancel: orderUrl, customer: 'fwod47-n1 Bench Customer', status: 'Cancelled' },
    },
    stats: { uses: 1, successes: 1, partial: 0, created: 'now', failedAtStep: {}, fallthroughs: 0 },
    status: 'provisional',
    provenance: { session: 's', instruction: 'cancel', created: 'now' },
  });
  const ledger = (): RunLedger => {
    const l = new RunLedger();
    l.add('fwod47-n1', { from: 'var', name: 'runid' });
    l.addUrlIds(orderUrl, '02-create', [{ label: 'q.id', value: '21' }]);
    return l;
  };

  it('drops a carrier of an id with no bound param, slots a var-bound value, leaves the rest', () => {
    const out = slotKnownRunValues(skill(), ledger())!;
    expect(out.skill.goal).toEqual({ requireText: ['Cancelled', '{{v3}} Bench Customer'] });
    expect(out.skill.reportTemplate).toEqual({
      summary: '',
      values: { order_reference: '{{v1}}', customer: '{{v3}} Bench Customer', status: 'Cancelled' },
    });
    expect(out.changes).toContain('goal.requireText[1] dropped (names a value this run made, with no slot to bind it)');
    expect(scanForLeaks(out.skill, ledger(), 's').filter(evidenced)).toEqual([]);
  });

  it('slots an id when a bound param carries it, removes an emptied goal, and ignores shape-only values', () => {
    const sk = skill();
    sk.params.v2 = { example: '21', usedIn: [], known: true, binding: 'url:02-create:q.id' };
    const out = slotKnownRunValues(sk, ledger())!;
    expect(out.skill.reportTemplate!.summary).toBe('Cancelled order {{v1}} (record id={{v2}}).');
    expect(out.skill.reportTemplate!.values.url_after_cancel).toBe('http://app/web#model=sale.order&view_type=form&id={{v2}}');

    const bare = skill();
    bare.goal = { requireText: [orderUrl] };
    bare.reportTemplate = undefined;
    expect(slotKnownRunValues(bare, ledger())!.skill.goal).toBeUndefined();

    const shapeOnly = new RunLedger();
    shapeOnly.add('S00021', { from: 'output', step: 'i2', name: 'quotation_reference' });
    const plain = skill();
    plain.goal = { requireText: ['S00021'] };
    plain.reportTemplate = undefined;
    expect(slotKnownRunValues(plain, shapeOnly)).toBeNull();
  });
});

/**
 * fwod60's 02-create and fwod61's 03-create: an adopted step whose recovery
 * ran clean, whose `decideRepin` said graduate, and whose pin was refused
 * anyway — every run, forever — because compile had bound one of its slots to
 * a LEDGER instruction index.
 *
 * The daemon banks a recovery's reported values under `i${instructionIndex}`
 * (noteMintedIds) BEFORE it compiles that same instruction, and then hands the
 * whole ledger to compile as `knownValues`. A value the instruction itself
 * reported therefore comes back as an origin — `output:i2:record_heading` —
 * that no flow step id can ever name, so remapParams falls through to the
 * recorded literal and refuses the re-pin for identifying the record.
 * fwod60's refused slot was `v1`, example `"New"`: the heading of the
 * not-yet-saved quotation, `usedIn: []`, identifying nothing.
 */
describe('a value the compiling instruction itself reported is an output, not an input (fwod60 02-create)', () => {
  const ORIGIN = 'http://127.0.0.1:8069';
  const TEXT =
    "Dismiss the leftover modal, then save the existing quotation for customer 'fwod60-n2 Bench Customer'. " +
    "The heading must show a reference like S000xx instead of 'New'. Report the quotation reference.";
  const entries: RecordedEntry[] = [
    { k: 'instruction', text: TEXT, url: `${ORIGIN}/odoo/sales/new` } as RecordedEntry,
    {
      k: 'step',
      tool: 'click',
      args: { target: '@e9' },
      locators: { target: { expr: 'x', verified: true, raw: '@e9', chain: [{ kind: 'role', role: 'button', name: 'Save manually' }] } },
      diff: { url: `${ORIGIN}/odoo/sales/12`, alerts: [], added: ['- heading "S00042"'] },
    } as unknown as RecordedEntry,
  ];
  const report = {
    status: 'success' as const,
    summary: 'saved the quotation',
    evidence: { values: { record_heading: 'New', reference: 'S00042' } },
  };
  const compile = (knownValues: Record<string, string>): Skill =>
    compileSkill({ entries, instruction: TEXT, report, session: 's', model: 'm', now: '2026-09-17T00:00:00Z', knownValues })!;
  const stepIds = ['01-signin', '02-create'];

  /** The ledger as the daemon holds it while it compiles 02-create: the run's
   * declared var, 01-signin's output, and what THIS instruction just reported. */
  const ledgerValues = (): Record<string, string> => {
    const ledger = new RunLedger();
    ledger.add('fwod60-n2', { from: 'var', name: 'runid' }, { vouched: true });
    ledger.beginInstruction(1);
    ledger.add('fwod60-n2 Bench Customer', { from: 'output', step: 'i1', name: 'customer_name' });
    ledger.beginInstruction(2);
    ledger.add('New', { from: 'output', step: 'i2', name: 'record_heading' });
    const out: Record<string, string> = {};
    for (const e of ledger.all()) out[bindingKey(e.binding)] = e.value;
    return out;
  };

  it('is what refuses the re-pin: its origin is an instruction index, not a step of the flow', () => {
    const known = ledgerValues();
    expect(known['output:i2:record_heading']).toBe('New');
    const skill = compile(known);
    const slot = Object.entries(skill.params).find(([, p]) => p.binding === 'output:i2:record_heading');
    expect(slot, 'compile slots it and records the ledger origin').toBeTruthy();
    expect(slot![1].known).toBe(true);
    expect(slot![1].usedIn).toEqual([]); // it identifies no record and no step uses it
    expect(remapParams(skill, {}, stepIds).unbound).toContain(slot![0]);
  });

  it('never reaches compile, so the recovery graduates the step it earned', () => {
    const skill = compile(withoutOwnOutputs(ledgerValues(), 'i2'));
    expect(Object.values(skill.params).map((p) => p.binding)).not.toContain('output:i2:record_heading');
    expect(remapParams(skill, {}, stepIds).unbound).toEqual([]);
  });

  it("keeps an EARLIER instruction's output, and the guard that comes with it", () => {
    const known = withoutOwnOutputs(ledgerValues(), 'i2');
    // 01-signin's customer name is an INPUT to 02-create: still known, still
    // bound to its origin. It is not refused only because the runid inside it
    // templates it (`{{runid}} Bench Customer`) — the guard itself is untouched.
    expect(known['output:i1:customer_name']).toBe('fwod60-n2 Bench Customer');
    const skill = compile(known);
    const slot = Object.entries(skill.params).find(([, p]) => p.binding === 'output:i1:customer_name');
    expect(slot, "an earlier instruction's output still gets its origin").toBeTruthy();
    expect(remapParams(skill, {}, stepIds).params[slot![0]]).toBe('{{runid}} Bench Customer');
    // And with nothing to template it, that same earlier output still refuses.
    const bare = compile({ 'output:i1:customer_name': 'Northwind Trading' });
    const bareSlot = Object.entries(bare.params).find(([, p]) => p.binding === 'output:i1:customer_name');
    if (bareSlot) expect(remapParams(bare, {}, stepIds).unbound).toContain(bareSlot[0]);
  });

  /** The daemon is the only place that knows which ledger step it is compiling. */
  it('is applied where the daemon hands the ledger to learning', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/daemon/server.ts'), 'utf8');
    const call = source.slice(source.indexOf('const learned = learnFromInstruction'), source.indexOf('const outcome = learned?.outcome;'));
    expect(call).toMatch(/withoutOwnOutputs\(this\.knownValues\(\), ledgerStep\)/);
  });
});
