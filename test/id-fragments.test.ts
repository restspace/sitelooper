import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LocatorCandidate, RecordedEntry } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { anchorEvidencedIds, shownBy, slotIdFragments } from '../src/skills/id-fragments.js';

/**
 * gitea fwgt35-luna: the converged spec's readiness run logged five locator
 * fallbacks, every one a read-back whose primary was a structural path rooted
 * at a gitea database id — `#issuecomment-11 > …` (s_6733ad/7-8, n3 04-set),
 * `#issue-4 > …` (s_2b3ae7/5, n1 07-add), `#issuecomment-3 > …` (s_76d091/10,
 * s_2b3ae7/7). Fixtures are the n1 and n3 scripts' own entries (n1 69-84 =
 * 03-create and 169-189 = 07-add; n3 84-107 = 04-set), less fingerprints,
 * timings and journals.
 *
 * Narrowed after the rebuild survey of every published n1 recording (bench/
 * rebuild-survey.mjs): an unshown id goes only while the chain keeps another
 * non-point candidate (the read-backs above keep their css: a report-only
 * read's fallback is a readiness warning, fix 5b), and an id is slotted only
 * where the segment already uses the param, so no url gate changes.
 */
const load = (name: string): RecordedEntry[] =>
  fs
    .readFileSync(path.join(__dirname, 'fixture', name), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

/** Compile the instruction starting at `from` (an index into `all`), with everything before it as the session so far. */
function compileAt(all: RecordedEntry[], from: number, knownValues: Record<string, string>) {
  const rest = all.slice(from);
  const end = rest.findIndex((e, i) => i > 0 && e.k === 'instruction');
  const own = end < 0 ? rest : rest.slice(0, end);
  const head = own[0] as Extract<RecordedEntry, { k: 'instruction' }>;
  const report = own.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report');
  return compileSkills({
    entries: own.filter((e) => e.k !== 'report'),
    before: all.slice(0, from),
    instruction: head.text,
    report: { status: 'success', summary: report?.summary ?? '', evidence: { values: (report as { values?: Record<string, unknown> } | undefined)?.values ?? {} } },
    session: 't',
    knownValues,
  });
}

const reads = (skills: ReturnType<typeof compileSkills>) =>
  new Map(skills.flatMap((s) => s.steps.filter((st) => st.label).map((st) => [st.label!, st.locators.target ?? []] as const)));

const css = (chain: readonly LocatorCandidate[]) => chain.filter((c) => c.kind === 'css' || c.kind === 'id').map((c) => (c as { selector: string }).selector);

describe('id fragments: evidence decides, never at the cost of a chain or a url gate (gitea fwgt35-luna)', () => {
  it('n3 04-set: the label read-backs keep `#issuecomment-11` (nothing but their point beside it); the body read slots `#issue-6` (the segment already uses v2)', () => {
    const all = load('fwgt35-luna-n3-04-set.jsonl');
    const skills = compileAt(all, 0, { 'url:i3:p3': '6', 'var:runid': 'fwgt35-luna-n3' });
    const r = reads(skills);
    for (const label of ['sidebar_labels_1', 'sidebar_labels_2']) {
      const chain = r.get(label)!;
      expect(chain.map((c) => c.kind)).toEqual(['css', 'point']);
      expect(css(chain)[0]).toMatch(/^#issuecomment-11 > /);
    }
    expect(css(r.get('ref')!)).toEqual(['#issue-{{v2}} > div > div:nth-of-type(2) > div:nth-of-type(1) > p']);
    // The gate it had without the rule: v2 was already the segment's.
    expect(skills.some((s) => s.preconditions.urlPattern === 'http://127.0.0.1:8095/bench/bench-repo/issues/{{v2}}')).toBe(true);
  });

  it('n1 07-add: the comment editor loses its render-counter id beside its role; `#issue-4` stays literal and the gates stay `:id`', () => {
    const all = load('fwgt35-luna-n1-07-add.jsonl');
    const at = all.findIndex((e) => e.k === 'instruction' && e.text.startsWith('Add a comment'));
    const skills = compileAt(all, at, { 'url:i3:p3': '4', 'var:runid': 'fwgt35-luna-n1' });
    const fill = skills.flatMap((s) => s.steps).find((s) => s.tool === 'fill')!;
    expect(JSON.stringify(fill.locators.target)).not.toContain('_combo_markdown_editor_76');
    expect(fill.locators.target!.some((c) => c.kind === 'role')).toBe(true);
    const notes = skills.flatMap((s) => s.provenance.transforms ?? []).filter((n) => n.name === 'anchorEvidencedIds');
    expect(notes.some((n) => /_combo_markdown_editor_76/.test(n.reason))).toBe(true);
    const r = reads(skills);
    // v2 ("4") is used nowhere else in the segment: slotting it would keep the param and gate on it.
    expect(css(r.get('comment_count_bodies_1')!)).toEqual(['#issue-4 > div > div:nth-of-type(2) > div:nth-of-type(1) > p']);
    expect(css(r.get('comment_count_bodies_2')!)).toEqual(['#{{d1}} > div > div:nth-of-type(2) > div:nth-of-type(1) > p']);
    expect(css(r.get('sidebar_assignees')!)).toEqual(['#issuecomment-3 > span:nth-of-type(2) > a']);
    for (const s of skills) expect(s.preconditions.urlPattern).toMatch(/\/issues\/:id/);
    expect(skills.every((s) => !s.params.v2)).toBe(true);
  });

  it('n1 03-create: the minted issue number already slots as `#issue-{{d1}}`, unchanged', () => {
    const all = load('fwgt35-luna-n1-07-add.jsonl');
    const r = reads(compileAt(all.slice(0, all.findIndex((e, i) => i > 0 && e.k === 'instruction')), 0, { 'var:runid': 'fwgt35-luna-n1' }));
    expect(css(r.get('runid')!)).toEqual(['#issue-{{d1}} > div > div:nth-of-type(2) > div:nth-of-type(1) > p']);
  });
});

describe('anchorEvidencedIds', () => {
  const point: LocatorCandidate = { kind: 'point', x: 1, y: 1, w: 1, h: 1, role: 'link', tag: 'a', vw: 1280, vh: 900 };
  const role: LocatorCandidate = { kind: 'role', role: 'link', name: 'bench-assignee' };
  const nothing = shownBy([]);

  it('keeps an id with no number, and one whose number the recording put in a url or the ledger banked', () => {
    const shown = shownBy([{ k: 'step', tool: 'click', args: {}, locators: {}, diff: { url: 'http://h/r/issues/12', alerts: [], added: [] } }]);
    const chain: LocatorCandidate[] = [role, { kind: 'css', selector: '#sidebar-delete-issue > form > button' }, { kind: 'css', selector: '#issue-12 > p' }, point];
    expect(anchorEvidencedIds(chain, shown).chain).toEqual(chain);
    expect(anchorEvidencedIds([role, { kind: 'css', selector: '#row-77 > a' }, point], shownBy([], ['77'])).chain[1]).toEqual({ kind: 'css', selector: '#row-77 > a' });
  });

  it('keeps an id the recording showed whole (a url fragment)', () => {
    const shown = shownBy([{ k: 'step', tool: 'click', args: {}, locators: {}, diff: { url: 'http://h/i/4#issuecomment-15', alerts: [], added: [] } }]);
    const chain: LocatorCandidate[] = [role, { kind: 'css', selector: '#issuecomment-15 > div' }, point];
    expect(anchorEvidencedIds(chain, shown).chain).toEqual(chain);
  });

  it('a bare number in page text is not the id’s evidence', () => {
    const shown = shownBy([{ k: 'step', tool: 'click', args: {}, locators: {}, diff: { url: 'http://h/i/4', alerts: [], added: ['- link "#3"', '- link "Issues 3"'] } }]);
    expect(anchorEvidencedIds([role, { kind: 'css', selector: '#issuecomment-3 > span:nth-of-type(2) > a' }, point], shown).chain).toEqual([role, point]);
  });

  it('never counts a selector, an eval or a gesture target as shown', () => {
    const shown = shownBy([
      { k: 'step', tool: 'eval', args: { expression: "document.querySelector('#issuecomment-11')" }, locators: {}, result: 'issuecomment-11', evalResult: 'issuecomment-11' },
      { k: 'step', tool: 'click', args: { target: '#issuecomment-11 a' }, locators: { target: { expr: '', verified: true, raw: '', chain: [{ kind: 'css', selector: '#issuecomment-11 a' }] } } },
    ]);
    expect(anchorEvidencedIds([role, { kind: 'id', selector: '#issuecomment-11' }, point], shown).chain).toEqual([role, point]);
  });

  it('never leaves a chain with only its point, or with only candidates a later pass strips', () => {
    const only: LocatorCandidate[] = [{ kind: 'css', selector: '#issuecomment-11 > span' }, point];
    expect(anchorEvidencedIds(only, nothing)).toEqual({ chain: only, notes: [] });
    const withRole: LocatorCandidate[] = [role, ...only];
    expect(anchorEvidencedIds(withRole, nothing, (c) => c !== role)).toEqual({ chain: withRole, notes: [] });
    expect(anchorEvidencedIds(withRole, nothing).chain).toEqual([role, point]);
  });

  it('drops an unshown id from the middle of a path, standing `*` where it was the whole compound', () => {
    const out = anchorEvidencedIds([{ kind: 'css', selector: '#timeline > #issuecomment-11 > span' }, { kind: 'css', selector: '#timeline div#issuecomment-11.event a' }, point], nothing);
    expect(out.chain.slice(0, 2)).toEqual([
      { kind: 'css', selector: '#timeline > * > span' },
      { kind: 'css', selector: '#timeline div.event a' },
    ]);
  });

  it('an id opening a later member of a selector list is that member’s root', () => {
    expect(anchorEvidencedIds([role, { kind: 'css', selector: '.labels a, #issuecomment-11 > span' }, point], nothing).chain).toEqual([role, point]);
  });

  it('reads `[id=…]` attributes and ignores an href that carries the id', () => {
    expect(anchorEvidencedIds([role, { kind: 'id', selector: '[id="_combo_markdown_editor_76"]' }, point], nothing).chain).toEqual([role, point]);
    const href: LocatorCandidate = { kind: 'css', selector: 'a[href="#issuecomment-11"]' };
    expect(anchorEvidencedIds([href, point], nothing).chain).toEqual([href, point]);
  });
});

describe('slotIdFragments', () => {
  it('writes a url-position value below the text floor, in the id only', () => {
    const out = slotIdFragments([{ kind: 'css', selector: '#issue-6 > div:nth-of-type(6) > p' }], [{ name: 'v6', value: '6', at: 'p3' }]);
    expect(out.chain).toEqual([{ kind: 'css', selector: '#issue-{{v6}} > div:nth-of-type(6) > p' }]);
  });

  it('returns the very chain when nothing is written (no query-state slot, no match)', () => {
    const chain: LocatorCandidate[] = [{ kind: 'css', selector: '#issue-6 > p' }];
    expect(slotIdFragments(chain, [{ name: 'v1', value: '6', at: 'q.id' }]).chain).toBe(chain);
    expect(slotIdFragments(chain, [{ name: 'v1', value: '7', at: 'p3' }]).chain).toBe(chain);
  });
});

