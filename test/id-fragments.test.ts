import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LocatorCandidate, RecordedEntry } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';
import { anchorEvidencedIds, shownBy } from '../src/skills/id-fragments.js';

/**
 * gitea fwgt35-luna: the converged spec's readiness run logged five locator
 * fallbacks, every one a read-back whose primary was a structural path rooted
 * at a gitea database id — `#issuecomment-11 > …` (s_6733ad/7-8, n3 04-set),
 * `#issue-4 > …` (s_2b3ae7/5, n1 07-add), `#issuecomment-3 > …` (s_76d091/10,
 * s_2b3ae7/7). Fixtures are the n1 and n3 scripts' own entries (n1 69-84 =
 * 03-create and 169-189 = 07-add; n3 84-107 = 04-set), less fingerprints,
 * timings and journals.
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

describe('id fragments: evidence decides (gitea fwgt35-luna)', () => {
  it('n3 04-set: the label read-backs lose `#issuecomment-11` (shown nowhere); the body read slots `#issue-6` to the url value', () => {
    const all = load('fwgt35-luna-n3-04-set.jsonl');
    const r = reads(compileAt(all, 0, { 'url:i3:p3': '6', 'var:runid': 'fwgt35-luna-n3' }));
    for (const label of ['sidebar_labels_1', 'sidebar_labels_2']) {
      const chain = r.get(label)!;
      expect(chain.length).toBeGreaterThan(0);
      expect(JSON.stringify(chain)).not.toMatch(/issuecomment/);
      expect(chain.map((c) => c.kind)).toEqual(['point']);
    }
    const ref = css(r.get('ref')!);
    expect(ref).toContain('#issue-{{v2}} > div > div:nth-of-type(2) > div:nth-of-type(1) > p');
    expect(JSON.stringify(r.get('ref'))).not.toMatch(/#issue-6\b/);
  });

  it('n1 07-add: `#issue-4` is slotted, `#{{d1}}` (the url fragment showed issuecomment-5) stands, `#issuecomment-3` goes though the session showed "3" as other records', () => {
    const all = load('fwgt35-luna-n1-07-add.jsonl');
    const at = all.findIndex((e) => e.k === 'instruction' && e.text.startsWith('Add a comment'));
    // The session showed a bare "3" — issue #3, a seed — before this instruction.
    expect(JSON.stringify(all.slice(0, at))).toContain('link \\"#3\\"');
    const skills = compileAt(all, at, { 'url:i3:p3': '4', 'var:runid': 'fwgt35-luna-n1' });
    const r = reads(skills);
    expect(css(r.get('comment_count_bodies_1')!)).toEqual(['#issue-{{v2}} > div > div:nth-of-type(2) > div:nth-of-type(1) > p']);
    expect(css(r.get('comment_count_bodies_2')!)).toEqual(['#{{d1}} > div > div:nth-of-type(2) > div:nth-of-type(1) > p']);
    expect(r.get('sidebar_assignees')!.map((c) => c.kind)).toEqual(['point']);
    const v2 = skills.find((s) => JSON.stringify(s.steps).includes('#issue-{{v2}}'))!;
    expect(v2.params.v2?.example).toBe('4');
    const notes = skills.flatMap((s) => s.provenance.transforms ?? []).filter((n) => n.name === 'anchorEvidencedIds');
    expect(notes.some((n) => /issuecomment-3/.test(n.reason) && /removed/.test(n.reason))).toBe(true);
  });

  it('n1 03-create: the minted issue number already slots as `#issue-{{d1}}`, unchanged', () => {
    const all = load('fwgt35-luna-n1-07-add.jsonl');
    const r = reads(compileAt(all.slice(0, all.findIndex((e, i) => i > 0 && e.k === 'instruction')), 0, { 'var:runid': 'fwgt35-luna-n1' }));
    expect(css(r.get('runid')!)).toEqual(['#issue-{{d1}} > div > div:nth-of-type(2) > div:nth-of-type(1) > p']);
  });
});

describe('anchorEvidencedIds', () => {
  const point: LocatorCandidate = { kind: 'point', x: 1, y: 1, w: 1, h: 1, role: 'link', tag: 'a', vw: 1280, vh: 900 };
  const nothing = shownBy([]);

  it('keeps an id with no number, and one whose number the recording put in a url or the ledger banked', () => {
    const shown = shownBy([{ k: 'step', tool: 'click', args: {}, locators: {}, diff: { url: 'http://h/r/issues/12', alerts: [], added: [] } }]);
    const chain: LocatorCandidate[] = [{ kind: 'css', selector: '#sidebar-delete-issue > form > button' }, { kind: 'css', selector: '#issue-12 > p' }, point];
    expect(anchorEvidencedIds(chain, [], shown).chain).toEqual(chain);
    expect(anchorEvidencedIds([{ kind: 'css', selector: '#row-77 > a' }, point], [], shownBy([], ['77'])).chain[0]).toEqual({ kind: 'css', selector: '#row-77 > a' });
  });

  it('keeps an id the recording showed whole (a url fragment)', () => {
    const shown = shownBy([{ k: 'step', tool: 'click', args: {}, locators: {}, diff: { url: 'http://h/i/4#issuecomment-15', alerts: [], added: [] } }]);
    const c: LocatorCandidate = { kind: 'css', selector: '#issuecomment-15 > div' };
    expect(anchorEvidencedIds([c, point], [], shown).chain).toEqual([c, point]);
  });

  it('a bare number in page text is not the id’s evidence', () => {
    const shown = shownBy([{ k: 'step', tool: 'click', args: {}, locators: {}, diff: { url: 'http://h/i/4', alerts: [], added: ['- link "#3"', '- link "Issues 3"'] } }]);
    expect(anchorEvidencedIds([{ kind: 'css', selector: '#issuecomment-3 > span:nth-of-type(2) > a' }, point], [], shown).chain).toEqual([point]);
  });

  it('never counts a selector, an eval or a gesture target as shown', () => {
    const shown = shownBy([
      { k: 'step', tool: 'eval', args: { expression: "document.querySelector('#issuecomment-11')" }, locators: {}, result: 'issuecomment-11', evalResult: 'issuecomment-11' },
      { k: 'step', tool: 'click', args: { target: '#issuecomment-11 a' }, locators: { target: { expr: '', verified: true, raw: '', chain: [{ kind: 'css', selector: '#issuecomment-11 a' }] } } },
    ]);
    expect(anchorEvidencedIds([{ kind: 'id', selector: '#issuecomment-11' }, point], [], shown).chain).toEqual([point]);
  });

  it('slots a url-position value below the text floor, in the id only', () => {
    const out = anchorEvidencedIds([{ kind: 'css', selector: '#issue-6 > div:nth-of-type(6) > p' }], [{ name: 'v6', value: '6', at: 'p3' }], nothing);
    expect(out.chain).toEqual([{ kind: 'css', selector: '#issue-{{v6}} > div:nth-of-type(6) > p' }]);
  });

  it('drops an unshown id from the middle of a path, standing `*` where it was the whole compound', () => {
    const out = anchorEvidencedIds([{ kind: 'css', selector: '#timeline > #issuecomment-11 > span' }, { kind: 'css', selector: '#timeline div#issuecomment-11.event a' }, point], [], nothing);
    expect(out.chain.slice(0, 2)).toEqual([
      { kind: 'css', selector: '#timeline > * > span' },
      { kind: 'css', selector: '#timeline div.event a' },
    ]);
  });

  it('an id opening a later member of a selector list is that member’s root', () => {
    expect(anchorEvidencedIds([{ kind: 'css', selector: '.labels a, #issuecomment-11 > span' }, point], [], nothing).chain).toEqual([point]);
  });

  it('reads `[id=…]` attributes, ignores an href that carries the id, never empties a chain', () => {
    expect(anchorEvidencedIds([{ kind: 'id', selector: '[id="_combo_markdown_editor_76"]' }, point], [], nothing).chain).toEqual([point]);
    const href: LocatorCandidate = { kind: 'css', selector: 'a[href="#issuecomment-11"]' };
    expect(anchorEvidencedIds([href], [], nothing).chain).toEqual([href]);
    const only: LocatorCandidate = { kind: 'css', selector: '#issuecomment-11 > span' };
    expect(anchorEvidencedIds([only], [], nothing)).toEqual({ chain: [only], notes: [] });
  });
});
