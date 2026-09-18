import { candidateExpr, isStableId, type LocatorCandidate } from '../daemon/recorder.js';
import { cascade, jevDecider, type DecideCtx, type DecisionSink, type JevSite, type Reading } from '../agent/decide.js';
import {
  agreement,
  choice,
  mapReduce,
  minConfidence,
  noul,
  shardByTokens,
  type ChoiceAnswer,
  type Entry,
  type NoulAnswer,
  type SystemOne,
} from '../agent/system-one.js';
import { kindFamily, renderSnapshotRow, type DiagnosticProposer, type ProposeContext, type ProposeLocator, type SnapshotRow } from './repair.js';

/**
 * Site A of PLAN-jev.md: the locator-repair proposer, as a System One choice.
 *
 * `llmProposer` is already a choice problem wearing a generation costume — it
 * shows a strong model a flat list of the page's interactive elements and asks
 * it to WRITE a selector, which is then parsed out of a fenced JSON reply,
 * checked for resolution, and checked for kind. Everything generative about
 * that round trip is ceremony: the answer is one of the lines it was shown.
 *
 * So: code enumerates the rows (and pre-filters them to the kind the
 * recording named), Jev picks one, and code BUILDS the locator from the row it
 * picked, in the recorder's own candidate order. No selector here was ever
 * written by a model, which removes the whole class of proposal that parses,
 * resolves, and names something the page does not have.
 *
 * Everything that guarded the model's proposal still guards this one:
 * `patchSegment` re-reads the live element's role and refuses a proposal of
 * the wrong kind, the locator must resolve to exactly one element, and the
 * patched chain is stored as a provisional variant that has to earn adoption.
 */

/** Names the gate (decide.ts GATES) and the rows in system-one.jsonl. */
export const REPAIR_PROPOSE_SITE = 'repair.propose';

/**
 * How many rows go into one state. Jev's accuracy falls with large irrelevant
 * state, so the cap is about relevance, not the 32k token ceiling — the whole
 * 120-row snapshot is ~4k characters and would fit, and rank worse. Past the
 * cap the site runs a tournament instead of truncating: a truncated list is
 * indistinguishable from a page that does not have the control, and that is
 * the one answer a proposer must never give wrongly.
 */
export const MAX_ROWS_PER_STATE = 40;

/**
 * Rows per tournament shard. Deliberately not one-per-shard: the step-0 probe
 * scored elements one to a shard for "Save the quotation" and ranked
 * `button "Confirm"` (1.78) above `button "Save record"` (1.55), while the
 * same elements in ONE state were picked correctly at 0.98. An element in
 * isolation has no page to be judged against, so shards keep DOM neighbours
 * together (`shardByTokens` preserves order) and the final is one `choice`
 * over the shortlist.
 */
export const ROWS_PER_SHARD = 12;

// --- the row, as a candidate -------------------------------------------------

/**
 * The role and tag a row would report if it were read off the live page —
 * mirroring `liveKind`'s implicit-role table, which cannot be imported because
 * it lives inside a `page.evaluate` body. This is only used to PRE-FILTER; the
 * authority on a proposal's kind remains `patchSegment`, which asks the real
 * element.
 */
export function rowKind(row: SnapshotRow): { role: string | null; tag: string } {
  if (row.role) return { role: row.role, tag: row.tag };
  const t = row.type ?? '';
  let role: string | null = null;
  if (row.tag === 'button') role = 'button';
  else if (row.tag === 'a') role = 'link';
  else if (row.tag === 'select') role = 'combobox';
  else if (row.tag === 'textarea') role = 'textbox';
  else if (/^h[1-6]$/.test(row.tag)) role = 'heading';
  else if (row.tag === 'input') {
    if (t === 'checkbox') role = 'checkbox';
    else if (t === 'radio') role = 'radio';
    else if (t === 'submit' || t === 'button' || t === 'reset') role = 'button';
    else if (t === 'search') role = 'searchbox';
    else if (t === 'number') role = 'spinbutton';
    else if (['text', 'email', 'tel', 'url', 'password', ''].includes(t)) role = 'textbox';
  }
  return { role, tag: row.tag };
}

/** The accessible-name-ish text of a row: what `getByRole(..., { name })` would match. */
function rowName(row: SnapshotRow): string | undefined {
  return row.label ?? row.text;
}

/**
 * A locator for the chosen row, built by CODE in the recorder's own candidate
 * order (`candidatesFor`: testid, role+name, label, placeholder, stable id,
 * text-when-roleless). Same order as recording, so a repaired chain is headed
 * by the candidate the recorder itself would have put first — a proposer with
 * its own taste in selectors is a second opinion nobody calibrated.
 *
 * Null when the row offers nothing nameable (an unlabelled div with a
 * tabindex): picked or not, there is no locator to propose.
 */
export function locatorFromRow(row: SnapshotRow): LocatorCandidate | null {
  if (row.testid) return { kind: 'testid', attr: 'data-testid', value: row.testid };
  const { role } = rowKind(row);
  const name = rowName(row);
  if (role && name) return { kind: 'role', role, name };
  if (row.label) return { kind: 'label', label: row.label };
  if (row.placeholder) return { kind: 'placeholder', placeholder: row.placeholder };
  if (row.id && isStableId(row.id)) {
    return { kind: 'id', selector: /^[A-Za-z][\w-]*$/.test(row.id) ? `#${row.id}` : `[id=${JSON.stringify(row.id)}]` };
  }
  if (row.text && !role) return { kind: 'text', text: row.text };
  return null;
}

/**
 * The rows worth offering: the same KIND as the recording named, and nameable
 * enough to build a locator from. Filtering in code is not an optimisation —
 * it is the rule the whole tier rests on. A textbox's repair is not allowed to
 * be a button, so a button must never be on the ballot; `patchSegment` would
 * reject it afterwards anyway, having spent the request.
 */
export function candidateRows(input: ProposeContext): SnapshotRow[] {
  const families = input.recordedFamilies?.length
    ? input.recordedFamilies
    : input.recordedKind
      ? [kindFamily({ role: input.recordedKind })].filter((f): f is string => !!f)
      : [];
  // A modal dialog makes everything behind it inert, so while one is open the
  // ballot is the dialog. The store-drift calibration (bench/jev-drift-store.mjs,
  // rdcal c36/c37) found the two wrong picks of 29: the step pressed the confirm
  // dialog's "Delete part", and Jev chose the part row's own "Delete" on the
  // page BEHIND the dialog — at 0.81 and 0.94, unique, right kind, right verb,
  // so neither the gate nor the resolves-to-one check could see it. Only the
  // step's own expectations caught it. Code can see it outright.
  const all = input.rows ?? [];
  const open = all.some((row) => row.modal);
  return all.filter((row) => {
    if (open && !row.modal) return false;
    if (!locatorFromRow(row)) return false;
    if (!families.length) return true;
    const family = kindFamily(rowKind(row));
    return !!family && families.includes(family);
  });
}

// --- the questions -----------------------------------------------------------

const NONE = 'none';

/** What the dead chain was about, small and relevant — nothing else from the skill. */
function stateFor(input: ProposeContext, rows: readonly SnapshotRow[]): Entry {
  return {
    procedure: input.skill.template,
    step: `${input.ticket.atStep ?? '?'} — the procedure ${input.tool ?? 'uses'}s this control`,
    control: input.recordedKind ?? 'unknown kind',
    // The dead chain IS the description of what is wanted: these expressions
    // named the control when the procedure was recorded, and none of them
    // resolves now.
    deadLocators: input.chain.map((c) => candidateExpr(c)),
    elements: Object.fromEntries(rows.map((row, i) => [`e${i}`, renderSnapshotRow(row)])),
  };
}

const ASK =
  'One step of a stored browser procedure has stopped working: the locators listed under `deadLocators` all named ONE control, and none of them finds it on the page any more. The elements currently on the page are listed under `elements`. Which of them is that same control, renamed or moved?';

/**
 * The same question with the options in the opposite order. Position bias is
 * the cheap failure at this price point and agreement is the cheap defence:
 * two orders, one request, free latency (the probe measured 1 → 286ms and 40 →
 * 276ms). Disagreement defers rather than picking a winner, because a pick
 * that depends on where it sat in the list is not a reading of the page.
 */
const ASK_REVERSED =
  'The elements under `elements` are what the page offers now. The expressions under `deadLocators` are how one control used to be found, and all of them fail now. Identify the element that now serves that control\'s purpose, or answer none if the page no longer offers it.';

const GONE =
  'Is the control described by `deadLocators` gone from this page entirely — deleted, or moved to another screen — rather than still present here under a new name, label or position?';

/**
 * How sure the gone-noul must be before it vetoes a pick.
 *
 * It is a VETO with its own threshold, and its probability does NOT join the
 * min-confidence of the choice. Measured (bench/jev-repair-probe.mjs, 15
 * cases): a confident, correct pick — `Save dashboard` → `Save changes`, both
 * orders agreeing at 0.95/0.83 — sits beside a gone-noul of 0.47. Folding
 * that in as `noulConfidence` (0.06) collapsed every reading to a deferral and
 * made the site dead code. The docs say why outright: thresholds do not
 * transfer between primitives, and this noul is a question about the page's
 * history that the page alone cannot settle. So: undecided means nothing, and
 * only a noul that actively disagrees with the choice — over this line — is
 * allowed to refuse it.
 */
export const GONE_VETO = 0.8;

function questionsFor(rows: readonly SnapshotRow[]) {
  const options: Record<string, Entry> = {};
  for (let i = 0; i < rows.length; i++) options[`e${i}`] = renderSnapshotRow(rows[i]);
  options[NONE] = 'none of the elements on this page is that control';
  const reversed: Record<string, Entry> = {};
  for (const key of Object.keys(options).reverse()) reversed[key] = options[key];
  return {
    pick: choice(ASK, options),
    pickReversed: choice(ASK_REVERSED, reversed),
    gone: noul(GONE),
  };
}

/** A shard's own ballot: one question, no agreement check — the final round does that. */
function shardQuestions(rows: readonly SnapshotRow[], offset: number) {
  const options: Record<string, Entry> = {};
  for (let i = 0; i < rows.length; i++) options[`e${offset + i}`] = renderSnapshotRow(rows[i]);
  options[NONE] = 'none of the elements in this group is that control';
  return { pick: choice(ASK, options) };
}

// --- reading the answers -----------------------------------------------------

/**
 * Turn one round's three answers into a Reading. Null value — a deferral — for
 * every way the answers fail to agree with themselves:
 *
 * - `none` won: the page does not have it, and today's model path is still
 *   entitled to disagree (a `none` here has never been verified by anything).
 * - the two option orders picked different rows: position bias, not a reading.
 * - the gone-noul says the control is gone while the choice names a row: two
 *   answers about the same page contradicting each other.
 *
 * Confidence is the WEAKEST answer used, never their product: one wrong
 * argument spoils the call.
 */
function readRound(
  rows: readonly SnapshotRow[],
  labels: readonly string[],
  answers: { pick: ChoiceAnswer; pickReversed: ChoiceAnswer; gone: NoulAnswer },
  extraConfidence: readonly number[] = [],
): Reading<LocatorCandidate> {
  const options = labels.length + 1;
  const agreed = agreement([answers.pick.choice, answers.pickReversed.choice]);
  const detail = {
    pick: answers.pick.choice,
    pickConfidence: answers.pick.confidence,
    reversed: answers.pickReversed.choice,
    reversedConfidence: answers.pickReversed.confidence,
    gone: answers.gone.noul,
    // What the label MEANT: without it a deferred row says "e7 at 0.83" and
    // nobody can tell afterwards whether e7 was the right control (the first
    // replay.heal rows, fwrdj2heal-on, were exactly that).
    pickedRow: labels.includes(answers.pick.choice) ? renderSnapshotRow(rows[labels.indexOf(answers.pick.choice)]) : answers.pick.choice,
  };
  const base = { chosen: answers.pick.choice, options, detail };
  if (!agreed) {
    return { ...base, value: null, confidence: 0, why: `the two option orders disagreed (${answers.pick.choice} vs ${answers.pickReversed.choice})` };
  }
  if (agreed === NONE) {
    return { ...base, chosen: NONE, value: null, confidence: answers.pick.confidence, why: 'none' };
  }
  const index = labels.indexOf(agreed);
  const row = index >= 0 ? rows[index] : undefined;
  const locator = row ? locatorFromRow(row) : null;
  if (!locator) return { ...base, value: null, confidence: 0, why: `chose ${agreed}, which offers nothing to build a locator from` };
  // The noul is a veto, not a vote (see GONE_VETO): a CONFIDENT "it is gone"
  // beside "it is e7" is two readings of one page contradicting each other,
  // and a contradiction defers. An undecided one says nothing and is ignored.
  if (answers.gone.noul >= GONE_VETO) {
    return { ...base, value: null, confidence: 0, why: `chose ${agreed} but judged the control gone from the page (${answers.gone.noul.toFixed(2)})` };
  }
  return {
    ...base,
    value: locator,
    confidence: minConfidence([answers.pick.confidence, answers.pickReversed.confidence, ...extraConfidence]),
  };
}

// --- the site ----------------------------------------------------------------

/**
 * `JevSite` for 'repair.propose'. Returns null — "nothing to ask", which is
 * not a decision and is not logged — when the caller gave no structured rows
 * or the page offers no candidate of the recorded kind. Throws when a
 * tournament shard failed: a reduce over a partial map is a guess, and the
 * missing shard may have held the answer.
 */
export const repairProposeSite: JevSite<ProposeContext, LocatorCandidate> = {
  site: REPAIR_PROPOSE_SITE,

  async run(client: SystemOne, input: ProposeContext, ctx: DecideCtx): Promise<Reading<LocatorCandidate> | null> {
    const rows = candidateRows(input);
    if (!rows.length) return null;

    if (rows.length <= MAX_ROWS_PER_STATE) {
      const labels = rows.map((_, i) => `e${i}`);
      const res = await client.ask(stateFor(input, rows), questionsFor(rows), { signal: ctx.signal });
      return readRound(rows, labels, res.answers);
    }

    // Tournament: a choice per shard of DOM-adjacent rows, then ONE choice
    // over the winners. Wall-clock is about one call (the probe measured
    // ~1.2s for 200 shards at 64 concurrent), and no shard ever sees a list
    // long enough for the ranking to degrade.
    const shards = shardByTokens(rows, undefined, ROWS_PER_SHARD);
    const offsets: number[] = [];
    let at = 0;
    for (const shard of shards) {
      offsets.push(at);
      at += shard.length;
    }
    const mapped = await mapReduce(
      client,
      shards,
      (shard, i) => ({ state: stateFor(input, shard), questions: shardQuestions(shard, offsets[i]) }),
      { signal: ctx.signal },
    );
    // All-or-nothing, per mapReduce's contract: defer to the model path.
    if (!mapped) throw new Error('repair.propose: a tournament shard failed, so the shortlist is incomplete');

    // The shortlist, with the confidence its own shard gave it — that number
    // joins the final min, so a finalist that barely won its group cannot be
    // laundered into a confident answer by winning a small final.
    const finalists: Array<{ row: SnapshotRow; confidence: number }> = [];
    mapped.shards.forEach((s, i) => {
      const label = s.answers.pick.choice;
      if (label === NONE) return;
      const index = Number(label.slice(1)) - offsets[i];
      const row = shards[i][index];
      if (row) finalists.push({ row, confidence: s.answers.pick.confidence });
    });
    if (!finalists.length) {
      return { value: null, chosen: NONE, confidence: 0, options: rows.length + 1, why: 'every group of elements answered none' };
    }
    const shortlist = finalists.slice(0, MAX_ROWS_PER_STATE);
    const labels = shortlist.map((_, i) => `e${i}`);
    const finalRows = shortlist.map((f) => f.row);
    const res = await client.ask(stateFor(input, finalRows), questionsFor(finalRows), { signal: ctx.signal });
    const reading = readRound(finalRows, labels, res.answers);
    if (reading.value === null) return { ...reading, options: rows.length + 1 };
    const winner = shortlist[labels.indexOf(reading.chosen!)];
    return {
      ...reading,
      // Report the size of the field it actually ranged over, not the final.
      options: rows.length + 1,
      confidence: minConfidence([reading.confidence, winner?.confidence ?? 0]),
    };
  },
};

// --- the proposers -----------------------------------------------------------

/**
 * `ProposeLocator` backed by Jev. Adapts the site's single-object argument to
 * a `Decider` and keeps a `ProposalDiagnostic`, so a drain report explains an
 * empty Jev proposal in the same terms it explains an empty model one — "40
 * rows and it said none" and "6 rows" are different failures, and telling them
 * apart is why the diagnostic exists.
 */
export function jevProposer(client: SystemOne, log?: DecisionSink): DiagnosticProposer {
  // A box rather than a `let`: the reading is written inside the site's `run`
  // and read after `jevDecider` has swallowed whatever happened to it.
  const seen: { last: Reading<LocatorCandidate> | null; clear(): void } = {
    last: null,
    clear() {
      this.last = null;
    },
  };
  const site: JevSite<ProposeContext, LocatorCandidate> = {
    site: repairProposeSite.site,
    async run(c, input, ctx) {
      seen.last = await repairProposeSite.run(c, input, ctx);
      return seen.last;
    },
  };
  const decide = jevDecider(client, site, log);
  const propose: DiagnosticProposer = async (input, ctx) => {
    seen.clear();
    const rows = candidateRows(input);
    const out = await decide(input, ctx).catch(() => null);
    const last = seen.last;
    propose.last = {
      snapshotRows: rows.length,
      snapshotBytes: input.snapshot.length,
      reply: out
        ? `jev: ${last?.chosen} (${last?.confidence.toFixed(2)}) → ${candidateExpr(out)}`
        : last
          ? `jev: ${last.chosen} (${last.confidence.toFixed(2)}) deferred${last.why ? `: ${last.why}` : ''}`
          : rows.length
            ? 'jev: no answer (the ask failed or timed out)'
            : 'jev: no candidate element of the recorded kind on the page',
    };
    return out;
  };
  return propose;
}

/**
 * The composed proposer: Jev first, the model behind it. With no System One
 * tier this IS `llm`, the same object — not a wrapper around it — so an
 * install with no TypeSafe key runs the code path that existed before this
 * file did, object identity included.
 *
 * `client` is passed in rather than resolved here: only the composition root
 * (the daemon, the repair CLI) asks whether the tier exists.
 */
export function cascadeProposer(client: SystemOne | null | undefined, llm: DiagnosticProposer, log?: DecisionSink): DiagnosticProposer {
  if (!client) return llm;
  const jev = jevProposer(client, log);
  const chain: ProposeLocator = cascade<ProposeContext, LocatorCandidate>(jev, llm);
  const propose: DiagnosticProposer = async (input, ctx) => {
    // Cleared first so "which diagnostic is fresh" is answered by which
    // proposer actually ran, not by which one ran last time.
    jev.last = undefined;
    llm.last = undefined;
    const out = await chain(input, ctx);
    // The model only runs when Jev deferred, so its diagnostic — when it has
    // one — is the one that explains this outcome.
    propose.last = llm.last ?? jev.last;
    return out;
  };
  return propose;
}
