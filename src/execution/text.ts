/**
 * Text rules both execution targets share: the volatile-token mask, the
 * bounded identity matcher, and the regex escape they are built on. The
 * daemon imports this module; a compiled `.flow.ts` artifact embeds its exact
 * source (spec/runtime-source.ts), so it must stay self-contained — no imports
 * beyond a sibling shared module or a Playwright type.
 */

/** `text` cut to `max` characters with an ellipsis, or unchanged when it fits. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '…';
}

/**
 * Whether an element's RENDERED text (`innerText`) satisfies a recorded text
 * wait — `text_equals` or `text_contains` — with whitespace runs collapsed and
 * trimmed on both sides, as Playwright's toHaveText / toContainText compare.
 * One definition for every tier: the daemon's wait_for, the held-elsewhere
 * rung (recover.ts textHeldElsewhere) and the artifact's assertions, which
 * are emitted with `useInnerText: true`. openproject fwop10: the daemon
 * compared innerText ("OVERVIEW", CSS text-transform: uppercase) and the
 * artifact textContent ("Overview"), so the compiled run failed a wait
 * replay passed.
 */
export function textHolds(shown: string, state: unknown, want: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  return state === 'text_equals' ? norm(shown) === norm(want) : norm(shown).includes(norm(want));
}

/**
 * Clock, calendar and relative-time tokens are the RECORDING's moment, not part of what a
 * page element IS: kanboard names its due-date textbox after the current
 * minute ("09/03/2026 07:22") and labels a summary row "Due date:
 * 12/31/2026 07:40". Recorded verbatim, such a name matches nothing nine
 * minutes later. maskVolatile() turns each token into the `{{*}}` wildcard
 * for stored expectations; volatileMatcher() turns a recorded locator name
 * into a RegExp that treats the same tokens as wildcards.
 */
export const WILDCARD = '{{*}}';

/**
 * The volatile tokens, as regex SOURCE: a clock time, a numeric date, and a
 * relative time — anything whose value is how much wall-clock time has passed
 * since the recording, however it is spelled. ghost lists a seed post as
 * "… Bench Guides - 1 minute ago"; fwgh3's 01-signin stored that phrase in an
 * expectation, the post had aged by the replays, and n2, n3 and the compiled
 * spec all stopped on "the recorded page change did not appear".
 *
 * Only a leading capital is tolerated ("Just now", "A minute ago"), not a
 * case-insensitive flag: the same source builds the MATCHER
 * (VOLATILE_TOKEN_SHAPE, spliced into patterns whose flags it does not
 * choose), and a mask wider than its matcher turns a recorded name into one
 * nothing matches. The count may be a slot marker: compile substitutes before
 * it masks, and a run value "5" must not freeze "5 minutes ago" into
 * `{{v2}} minutes ago`. `today` is left out: it is a date picker's button as
 * often as it is a time.
 */
const CLOCK = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
const NUMERIC_DATE = String.raw`\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}`;
const TIME_COUNT = String.raw`(?:\d+|\{\{[vd]\d+\}\}|[Aa] few|[Aa]n?|[Oo]ne|[Ff]ew)`;
const TIME_UNIT = String.raw`(?:[Ss]ec(?:ond)?|[Mm]in(?:ute)?|[Hh](?:ou)?r|[Dd]ay|[Ww]eek|[Mm]onth|[Yy]ear)s?`;
const RELATIVE_TIME = String.raw`(?:${TIME_COUNT}\s+${TIME_UNIT}\s+ago|\d+\s?(?:mo|[smhdwy])\s+ago|[Ii]n\s+${TIME_COUNT}\s+${TIME_UNIT}|[Jj]ust now|[Yy]esterday|[Tt]omorrow)`;
const VOLATILE_SOURCE = `(?:${CLOCK}|${NUMERIC_DATE}|${RELATIVE_TIME})`;
const VOLATILE_TOKEN = new RegExp(String.raw`(?<!\w)${VOLATILE_SOURCE}(?!\w)`, 'g');

export function maskVolatile(line: string): string {
  return line.replace(VOLATILE_TOKEN, WILDCARD);
}

/**
 * Counters at the head of a control's name: odoo's user menu is
 * `- menu "6 3 YourCompany"` — the activity and message counts, then the
 * company. The counts are how much has happened since the recording, not the
 * control; the artifact insisted on "6 3" and failed a sign-in the daemon
 * had replayed clean (fwod88-cv3). Only a leading run of short integers that
 * a word follows, on a named control, is masked — `- cell "3"` and a bare
 * number stay what they are. Applied to expectation lines beside maskVolatile
 * (expect.ts), in both runners.
 */
const LEADING_COUNTERS = /^(- (?:menu|menuitem|button|link|tab|treeitem) ")(\d{1,3}(?: \d{1,3})*) (?=[\p{L}])/u;

export function maskCounters(line: string): string {
  return line.replace(LEADING_COUNTERS, `$1${WILDCARD} `);
}

/** A value interpolated into a pattern is DATA: its own metacharacters must not become pattern. */
export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The recorded string itself when it carries no volatile token, else an
 * anchored RegExp in which each token matches any token of the same shape —
 * another time, another date — and nothing else, so the rest of the name is
 * still matched exactly.
 */
/**
 * What one masked token stood for, as regex SOURCE. Exported because a
 * compiled spec has to rebuild the same matcher from a line the store already
 * masked (see spec/locators.ts, maskedMatcherSource) and a second copy of this
 * shape would be free to drift away from this one.
 */
export const VOLATILE_TOKEN_SHAPE = VOLATILE_SOURCE;

/**
 * What may NOT sit against an identity marker: a letter or a digit.
 *
 * An identity marker is the only thing in the system that can tell ticket t15
 * from ticket t14 — a url pattern and a page fingerprint match every record of
 * a template, so when the url gate proceeds optimistically on a disagreeing
 * segment, this is the gate the decision falls to. Matched by plain substring
 * it does not decide anything: `fwgr25-n1` is satisfied by a page showing
 * `fwgr25-n10`, `RD-1015` by `RD-10150`, and a bare runid is the commonest
 * marker shape there is.
 *
 * So a marker matches only where neither edge is glued to another letter or
 * digit. BOTH lookarounds, unconditionally — not "when the marker looks like
 * an identifier". The shape is not a property of the MARKER but of what the
 * page may put beside it: `fwod28-n1 Bench Customer` is prose-shaped and
 * `…Bench Customers` is a different record. Punctuation is not a letter or a
 * digit, so `(INV-2024/17)` still matches while `INV-2024/170` does not, and
 * `\p{L}` (with `u`) keeps `Ångström` and `田中` right.
 *
 * Exported as SOURCE because a compiled spec must rebuild the same rule inside
 * the emitted artifact, and a second copy of the class would be free to drift
 * away from this one — the same reason VOLATILE_TOKEN_SHAPE is exported.
 */
export const IDENTITY_EDGE = '[\\p{L}\\p{N}]';

/**
 * `marker` as regex SOURCE for the bounded identity rule: whitespace-normalised,
 * every literal run of spaces matching any whitespace (the daemon's snapshot and
 * a DOM's textContent space things differently), `{{*}}` matching anything
 * within one line, and both edges guarded by IDENTITY_EDGE.
 */
export function identitySource(marker: string): string {
  const body = marker
    .replace(/\s+/g, ' ')
    .trim()
    .split(WILDCARD)
    .map((part) => escapeRe(part).replace(/ /g, '\\s+'))
    .join('[^\\n]*?');
  return `(?<!${IDENTITY_EDGE})${body}(?!${IDENTITY_EDGE})`;
}

/**
 * identitySource as a RegExp. Case-INSENSITIVE: the daemon was case-sensitive
 * here and the emitted artifact was not, and a case-insensitive BOUNDED match
 * is strictly tighter than the case-sensitive SUBSTRING it replaces — so
 * unifying on `i` is not a loosening, and it settles a real parity gap (a
 * rendered value is not always cased as it was typed).
 */
export function identityRe(marker: string): RegExp {
  return new RegExp(identitySource(marker), 'iu');
}
export function volatileMatcher(text: string): string | RegExp {
  const masked = maskVolatile(text);
  if (masked === text) return text;
  return new RegExp(`^${masked.split(WILDCARD).map(escapeRe).join(VOLATILE_TOKEN_SHAPE)}$`);
}

/**
 * A scoped candidate's `hasText`, as both runners pass it to
 * `locator(container, { hasText })`: the recorded text itself when it carries
 * no volatile token — Playwright's own substring match, case- and
 * whitespace-insensitive, unchanged — else a RegExp keeping those three
 * properties (unanchored, `i`, any whitespace run) with each volatile token
 * wildcarded as volatileMatcher does. fwgh4's s_17f69b scoped every read to
 * `li.gh-list-row` with hasText "{{v2}} By Bench Admin - a few seconds ago
 * Draft", which only held because the replay came seconds after the
 * recording. Called on the text with its slots already filled, in both
 * runners, so they cannot disagree about what a slot value contributes.
 */
export function hasTextMatcher(text: string): string | RegExp {
  const masked = maskVolatile(text);
  if (masked === text) return text;
  const body = masked
    .replace(/\s+/g, ' ')
    .trim()
    .split(WILDCARD)
    .map((part) => escapeRe(part).replace(/ /g, '\\s+'))
    .join(VOLATILE_TOKEN_SHAPE);
  return new RegExp(body, 'i');
}

/**
 * What an ACCESSIBLE NAME may carry that a recorded name never does.
 *
 * A recorded role name comes from this project's own DOM walk (execution/
 * snapshot.ts), which names an element by its text and collapses whitespace.
 * The browser's accessible name, which a role query compares against, is
 * computed from the rendered tree — including CSS-generated content. Kanboard's
 * column header is `<a>Ready <i class="fa fa-caret-down"></i></a>`: the walk
 * says `link "Ready"`, Chromium says "Ready " (the icon font's glyph,
 * a private-use code point), and `exact: true` on 'Ready' finds nothing. Every
 * synthesized column read of fwkb24 missed that way, on both replays, on the
 * very page the recording had seen them on.
 *
 * So the edges of a name may carry whitespace, private-use glyphs (icon
 * fonts), other symbols (a check mark, an emoji — \p{So}; not a math or
 * currency sign, which can be the name's own) and format characters, and every
 * run of whitespace inside it matches any run. Nothing else: a letter, a digit
 * or punctuation beside the name is a different name ("Ready?" is not
 * "Ready"), and two elements the tolerance makes indistinguishable are
 * refused by the resolver's own uniqueness rule, never picked. Exported as
 * SOURCE for the same reason VOLATILE_TOKEN_SHAPE is: the artifact rebuilds
 * the matcher from it.
 */
export const NAME_NOISE_SHAPE = '[\\s\\p{Co}\\p{So}\\p{Cf}]*';

/**
 * The matcher for a recorded ROLE name: volatileMatcher's wildcards for clock
 * and calendar tokens, with the accessible-name tolerance above at both edges
 * and across whitespace. Always a RegExp, so `exact: true` is moot — the
 * anchors carry the whole-string rule and the case stays as recorded.
 * One function for both runners: makeLocator (daemon/recorder.ts) calls it
 * and the compiled artifact calls the embedded copy (spec/locators.ts).
 */
export function roleName(text: string): RegExp {
  const masked = maskVolatile(text.replace(/\s+/g, ' ').trim());
  const body = masked
    .split(WILDCARD)
    .map((part) => escapeRe(part).replace(/ /g, '\\s+'))
    .join(VOLATILE_TOKEN_SHAPE);
  return new RegExp(`^${NAME_NOISE_SHAPE}${body}${NAME_NOISE_SHAPE}$`, 'u');
}

/** Roles a <label> names. */
const LABELLED_ROLES = new Set(['textbox', 'searchbox', 'spinbutton', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'slider']);

/**
 * A selector naming a labelled field as `role=textbox[name="Part name *"]`,
 * optionally as the last link of a scoped chain (`dialog >> role=…`): the
 * scope, role and name, or null for any other selector.
 *
 * WHY IT IS SHARED. A label's text is not always the field's accessible name:
 * "Part name <span aria-hidden>*</span>" reads `Part name *` in our snapshot
 * and `Part name` to Playwright's role engine, so this selector matches
 * nothing as written. The daemon's live target resolution (daemon/refs.ts)
 * already accepted the field by its label's exact text; a STORED candidate of
 * this shape did not, in either runner. fwrd79's 03-open stored exactly this
 * as its fill's only candidate, and the compiled spec failed there with
 * "none of 1 recorded locators resolved". One parse, used by live resolution,
 * makeLocator and the emitted artifact alike.
 */
export function fieldByName(selector: string): { scope: string | null; role: string; name: string } | null {
  const cut = selector.lastIndexOf(' >> ');
  const last = (cut < 0 ? selector : selector.slice(cut + 4)).trim();
  const m = /^role=([a-z]+)\[name="((?:[^"\\]|\\.)*)"\]$/.exec(last);
  if (!m || !LABELLED_ROLES.has(m[1])) return null;
  return { scope: cut < 0 ? null : selector.slice(0, cut), role: m[1], name: m[2].replace(/\\(.)/g, '$1') };
}

/**
 * WHERE A READ'S VALUE SAT ON ITS LINE.
 *
 * A read-back the model pinned to a wrapper is accepted by CONTAINMENT
 * (recorder.ts captureReadBackAt): the element's line carries the value and a
 * label or sibling beside it. The read then published the element's whole
 * text on every replay — fwvk3's runid "fwvk3-n1" was pinned to the <h1>
 * "fwvk3-n1 Bench Task", and n2 published "fwvk3-n2 Bench Task"; fwgh5
 * s_5ee393's `ref` published "fwgh5-n2 Bench Post" — and the summary rewrite
 * that swaps each recorded value for the replayed one garbled the report.
 *
 * So a contained read records its FRAME: the value's line with the value cut
 * out and FRAME_MARK in its place ("{{=}} Bench Task"), and both runners
 * publish only the text at the mark (extractFramed). Not a `{{vN}}` slot:
 * compile fills the run's slots into the frame's literal text like any other
 * arg, and the mark must survive that.
 */
export const FRAME_MARK = '{{=}}';

/** One rendered line as a frame compares it: whitespace runs collapsed, trimmed. */
function frameLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

/**
 * `text`'s frame for `value` — see FRAME_MARK — or null when no line of
 * `text` carries the value. The line is the SHORTEST carrying it (the value's
 * own line, the one captureReadBackAt's own-line rule accepted); within it,
 * an occurrence bounded by IDENTITY_EDGE is preferred to a bare substring.
 * A line that IS the value names no position by itself inside a multi-line
 * element, so the neighbouring line (the one before, else the one after) is
 * kept with it: "Folder\n{{=}}".
 */
export function frameValue(text: string, value: string): string | null {
  const v = frameLine(value);
  if (!v) return null;
  const lines = text.split(/\r?\n/).map(frameLine).filter(Boolean);
  const body = escapeRe(v).replace(/ /g, '\\s+');
  const bounded = new RegExp(`(?<!${IDENTITY_EDGE})${body}(?!${IDENTITY_EDGE})`, 'iu');
  const loose = new RegExp(body, 'iu');
  let at = -1;
  for (let i = 0; i < lines.length; i++) {
    if (loose.test(lines[i]) && (at < 0 || lines[i].length < lines[at].length)) at = i;
  }
  if (at < 0) return null;
  const line = lines[at];
  const hit = bounded.exec(line) ?? loose.exec(line)!;
  const framed = line.slice(0, hit.index) + FRAME_MARK + line.slice(hit.index + hit[0].length);
  if (framed !== FRAME_MARK || lines.length < 2) return framed;
  return at > 0 ? `${lines[at - 1]}\n${framed}` : `${framed}\n${lines[at + 1]}`;
}

/**
 * `frame` — a mark-less frame, its slots already filled with this run's
 * values — with FRAME_MARK put where `value` sits in it, or null when the
 * value is not there exactly once (bounded by IDENTITY_EDGE, whitespace runs
 * matching any whitespace). The run-time half of a slot-scoped frame
 * (skills/readscope.ts): repairdesk fwrd87 s_9e190d pinned the runid to Part
 * A's name cell as "{{=}} RD Part A", and replaying for Part B the element no
 * longer showed that line; the frame stored as `{{v4}}`, marked at `{{v3}}`,
 * is this run's line.
 */
export function markFrame(frame: string, value: string): string | null {
  const v = frameLine(value);
  if (!v || frame.includes(FRAME_MARK)) return null;
  const re = new RegExp(`(?<!${IDENTITY_EDGE})${escapeRe(v).replace(/ /g, '\\s+')}(?!${IDENTITY_EDGE})`, 'giu');
  const hits = [...frame.matchAll(re)];
  if (hits.length !== 1 || hits[0].index === undefined) return null;
  return frame.slice(0, hits[0].index) + FRAME_MARK + frame.slice(hits[0].index + hits[0][0].length);
}

/** Any `{{…}}` in a frame but the mark: a masked volatile token, or a slot the run left unfilled ("asks for no particular value"). */
const FRAME_HOLE = /\{\{[^{}]*\}\}/;

/** One frame line as an anchored RegExp: the mark captures, each hole matches anything within the line. */
function frameLineRe(line: string): RegExp {
  const lit = (part: string) =>
    part
      .split(FRAME_HOLE)
      .map((p) => escapeRe(p).replace(/ /g, '\\s+'))
      .join('.*?');
  const body = maskVolatile(line).split(FRAME_MARK).map(lit).join('(.+?)');
  return new RegExp(`^${body}$`, 'iu');
}

/**
 * The text at `frame`'s mark in `text` (an element's rendered text), or null
 * when the element no longer shows the frame. Compared the way foldValue
 * compares a displayed value — whitespace collapsed, case folded — with
 * clock, date and relative-time tokens wildcarded (maskVolatile), line by
 * line: the frame's lines must match consecutive lines of `text`, whole.
 * Every window that matches must capture the same text; two different
 * captures are two candidates, and a read that has to guess publishes
 * nothing. Null is a failed read, never a wrong value.
 */
export function extractFramed(text: string, frame: string): string | null {
  const want = frame.split(/\r?\n/).map(frameLine).filter(Boolean);
  if (want.filter((l) => l.includes(FRAME_MARK)).length !== 1) return null;
  const res = want.map(frameLineRe);
  const lines = text.split(/\r?\n/).map(frameLine).filter(Boolean);
  let got: string | null = null;
  for (let i = 0; i + want.length <= lines.length; i++) {
    let captured: string | null = null;
    let ok = true;
    for (let j = 0; j < want.length && ok; j++) {
      const m = res[j].exec(lines[i + j]);
      if (!m) ok = false;
      else if (m[1] !== undefined) captured = m[1].trim();
    }
    if (!ok || !captured) continue;
    if (got !== null && got !== captured) return null;
    got = captured;
  }
  return got;
}

/**
 * `frame` with each whole-token occurrence of a value THIS RUN produced in its
 * literal text replaced by the wildcard, the mark left alone. A frame's
 * residue is the line around the value as the recording saw it, and whatever
 * in it the run made is a different value on the next run: fwgt4 s_4580f2
 * pinned the runid to gitea's heading as "{{=}} Bench Issue #4", and every
 * replay's "#5" missed the frame, so the read was skipped each time. Whole
 * tokens only (IDENTITY_EDGE), so a record id "4" frees the "4" of "#4" and
 * not the one in "x4". extractFramed reads every `{{…}}` as a wildcard.
 */
export function unfreezeFrame(frame: string, runValues: readonly string[]): string {
  const values = [...new Set(runValues.map((v) => v.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!values.length) return frame;
  const re = new RegExp(`(?<!${IDENTITY_EDGE})(?:${values.map(escapeRe).join('|')})(?!${IDENTITY_EDGE})`, 'gu');
  return frame
    .split(FRAME_MARK)
    .map((part) => part.replace(re, WILDCARD))
    .join(FRAME_MARK);
}

/**
 * `[role=dialog]` as a whole chain segment means "the dialog", and the agent
 * writes it because the snapshot and the diff both SAY `dialog`. But as CSS it
 * matches only an explicit role attribute: a native <dialog>, <nav> or <main>
 * has the role and no attribute, so the scope matched nothing. fxon1-n1 lost
 * five batches (3s each, plus the snapshot turn after) to `[role=dialog] >> …`
 * on an app that uses <dialog>. The role engine matches both kinds, and is a
 * strict superset, so the segment is handed to it instead.
 *
 * Shared (fwrd82): the live action resolved `[role=dialog] >> role=textbox[…]`
 * through this rewrite, but the recorder probed the raw text, matched nothing,
 * and stored the unrewritten selector as the step's only candidate; the daemon
 * healed it by testid on every replay and the compiled artifact could not.
 * So describeTarget probes as resolveTarget does, and makeLocator and the
 * artifact's candidateSource rewrite a stored selector the same way.
 */
export function implicitRoles(selector: string): string {
  return selector
    .split(' >> ')
    .map((segment) => segment.trim().replace(/^\[role=["']?([a-z]+)["']?\]$/, 'role=$1'))
    .join(' >> ');
}
