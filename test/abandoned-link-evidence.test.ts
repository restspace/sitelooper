/**
 * Round 61, openproject fwop15 01-open (n1 lines 10-22, in
 * test/fixture/fwop15-n1-01-open.jsonl with the rest of that instruction).
 *
 * The recording clicked the Bench Project link three times (lines 10, 15, 21).
 * Each went out as a FORCED click after the actionable tier gave up, and each
 * went nowhere: `obs.settle.link {from: /projects, href: /projects/bench-project}`,
 * the url still /projects, `obs.totals` 0 added and 0 removed. Between them:
 * two waits that failed (`failed: true`, never gestures), url reads, a tab
 * listing, a `scroll_into_view` and a `hover` on the same link; then
 * `goto /projects/bench-project` — the link's own href. abandonedLinkClick
 * stepped over observations only, so the scroll and hover ended its scan and
 * s_bab182 kept two of the clicks: on replay the first navigated, and step 5
 * was stranded on the project page (n2 20 turns, n3 24, demoted, compile
 * refused).
 *
 * With the recording's own evidence (obs): a link click that went nowhere is
 * abandoned for a goto to ITS href, stepping over further such clicks and
 * over scroll/hover/focus on the same control, which go with it. Without obs,
 * exactly today's rule.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry, type RecordedStep } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import type { Skill, SkillStep } from '../src/skills/store.js';

const RAW = fs.readFileSync(path.join(__dirname, 'fixture', 'fwop15-n1-01-open.jsonl'), 'utf8');
const P = 'http://127.0.0.1:8090/projects';
const HREF = `${P}/bench-project`;

function compile(entries: RecordedEntry[]): Skill[] {
  const head = entries[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const report = entries.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report');
  return compileSkills({
    entries: entries.filter((e) => e.k !== 'report'),
    instruction: head.text,
    report: { status: 'success', summary: report?.summary ?? '', evidence: { values: report?.values ?? {} } },
    session: 'fwop15-n1',
    knownValues: { 'var:runid': 'fwop15-n1' },
  });
}
const projectsSegment = (skills: Skill[]) => skills.find((s) => s.preconditions.urlPattern === P)!;
const linkClick = (s: SkillStep) => s.tool === 'click' && JSON.stringify(s.locators.target ?? []).includes('Bench Project');

describe('the published recording, read as the daemon reads it (parseScript)', () => {
  it('leaves out every failed step, so an offline rebuild compiles what the live run compiled', () => {
    const lines = RAW.split('\n').filter(Boolean).map((l) => JSON.parse(l) as RecordedEntry & { failed?: true });
    expect(lines.filter((e) => e.failed)).toHaveLength(3);
    const { entries } = parseScript(RAW);
    expect(entries.some((e) => (e as RecordedStep).failed)).toBe(false);
    expect(entries).toHaveLength(lines.length - 3);
  });

  it('the base compile of it is s_bab182 as published (the live run), before this rule', () => {
    // guards the fixture: the same entries give the published procedure's shape
    const published = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture', 'fwop15-s_bab182.json'), 'utf8')) as Skill;
    expect(published.steps.map((s) => s.tool)).toEqual(['click', 'read', 'wait_for', 'read', 'click', 'read', 'scroll_into_view', 'hover', 'goto']);
  });

  it('bench/rebuild-flow.mjs reads a script through parseScript, the only bench path that compiles one', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'bench', 'rebuild-flow.mjs'), 'utf8');
    expect(src).toContain("return parseScript(fs.readFileSync(file, 'utf8')");
  });
});

describe('abandoned link clicks decided by the recording’s evidence (fwop15 lines 10-22)', () => {
  it('drops every click that went nowhere, and the scroll and hover that prepared them, for the goto to the link’s href', () => {
    const seg = projectsSegment(compile(parseScript(RAW).entries));
    expect(seg.steps.filter(linkClick)).toEqual([]);
    expect(seg.steps.some((s) => s.tool === 'scroll_into_view' || s.tool === 'hover')).toBe(false);
    expect(seg.steps.filter((s) => s.tool === 'goto').map((s) => s.args.url)).toEqual([HREF]);
  });

  it('control: a goto somewhere else keeps the clicks', () => {
    const entries = parseScript(RAW).entries.map((e) =>
      (e as RecordedStep).tool === 'goto' && (e as RecordedStep).args.url === HREF
        ? ({ ...e, args: { url: `${P}/other-project` }, diff: { ...(e as RecordedStep).diff!, url: `${P}/other-project` } } as RecordedEntry)
        : e,
    );
    const seg = compile(entries).find((s) => s.preconditions.urlPattern === P)!;
    expect(seg.steps.filter(linkClick).length).toBeGreaterThan(0);
  });

  it('control: a hover whose effect the procedure then used (a menu item clicked) is kept, and so are the clicks', () => {
    const entries = parseScript(RAW).entries.slice();
    const hoverAt = entries.findIndex((e) => (e as RecordedStep).tool === 'hover');
    const menuItem: RecordedStep = {
      k: 'step',
      tool: 'click',
      args: { target: '@e900' },
      locators: { target: { expr: 'x', verified: true, raw: '@e900', chain: [{ kind: 'role', role: 'menuitem', name: 'Open in new view' }] } },
      diff: { url: P, alerts: [], added: ['- dialog "Bench Project"'], dialect: 2 },
    };
    entries.splice(hoverAt + 1, 0, menuItem);
    const seg = compile(entries).find((s) => s.preconditions.urlPattern === P)!;
    expect(seg.steps.some((s) => s.tool === 'hover')).toBe(true);
    expect(seg.steps.filter(linkClick).length).toBeGreaterThan(0);
  });

  it('without obs, today’s rule exactly: the scroll and hover end the scan', () => {
    const entries = parseScript(RAW).entries.map((e) => {
      if (e.k !== 'step') return e;
      const { obs: _obs, ...rest } = e as RecordedStep;
      void _obs;
      return rest as RecordedEntry;
    });
    const seg = compile(entries).find((s) => s.preconditions.urlPattern === P)!;
    expect(seg.steps.map((s) => s.tool)).toEqual(['click', 'read', 'wait_for', 'read', 'click', 'read', 'scroll_into_view', 'hover', 'goto']);
  });
});
