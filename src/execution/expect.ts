import type { Page } from 'playwright-core';
import { WILDCARD, escapeRe, maskCounters, maskVolatile } from './text.js';
import { fillParams } from './url.js';
import { captureLines, describeCoverage, lineShows, NAME_CAP, type FullNameLook, type LineDialect, type ObservationCoverage } from './snapshot.js';

/**
 * The content-expectation verdict both execution targets share: given what a
 * step recorded, what the run's params are, and what the page shows now, did
 * the step have its recorded effect? The daemon imports this (skills/replay.ts
 * calls it from its effect gate); a compiled `.flow.ts` artifact embeds its
 * exact source (spec/runtime-source.ts) and calls it from each step's verify
 * phase. One function, so the two runners cannot disagree about what a
 * recorded line means — an earlier emitter rebuilt each line as a Playwright
 * locator and never looked past the name, so `- combobox "Project": {{v1}}`
 * passed on any visible Project combobox whatever it showed. Self-contained:
 * nothing but a sibling shared module may be imported.
 */

/**
 * Page lines that describe the page in transit — spinners, progress bars,
 * and toasts (an alert that happened to be on screen, such as fwgr25's
 * "Error loading RSS feed", is not what the step did; a step's own alert is
 * carried by alertContains, which stays soft). Never a lasting effect.
 */
export const TRANSIENT_LINE = /^-?\s*(status|progressbar|alert)\b/;

/** A recorded line carrying a `{{vN}}` slot: this run's own value, the HARD half of an expectation. */
export const SLOT_LINE = /\{\{v\d+\}\}/;

/** A recorded line naming a dialog, whose absence is conditional UI rather than a failed effect. */
export const DIALOG_LINE = /^-\s*dialog\s+"([^"]*)"/;

/** A popup container, whose opening is itself the effect whether or not it carries a name (replay's OPENER_LINE roles). */
const POPUP_ROLE = /^(dialog|alertdialog|menu|menubar|listbox|tooltip)$/;

/**
 * A popup's ITEMS: the entries a listbox or menu lists while it is open. The
 * container's appearance is the event (POPUP_ROLE above, which stays exempt
 * from identifiesNothing); what it happens to be listing at that instant is
 * not. An item list is the application answering the keystrokes so far — odoo's
 * product autocomplete re-queries on every character and returns whatever the
 * catalogue holds now — so an item is momentary evidence about the ENVIRONMENT,
 * never proof that the step acted on the right element. fwod49-n2's 02-open
 * recorded `- option "{{v4}}"` as its type step's hard effect and stopped every
 * replay whose catalogue answered differently.
 */
const POPUP_ITEM_ROLE = /^(option|menuitem|menuitemcheckbox|menuitemradio)$/;

/** Whether a recorded line describes an item inside an open popup (see POPUP_ITEM_ROLE). */
export function popupItem(line: string): boolean {
  const m = LINE_PARTS.exec(line.trim());
  return m ? POPUP_ITEM_ROLE.test(m[1]) : false;
}

/** Any `{{…}}` marker that is not the wildcard — a slot no one filled. */
const UNFILLED_MARKER = /\{\{(?!\*\}\})[^{}]*\}\}/;

/**
 * A recorded line that this run could not fill: after params are substituted
 * it still carries a `{{…}}` marker — a `{{vN}}` the caller never bound, or a
 * param whose own value is an unresolved reference to another step's output
 * (`{{02-open.product_name}}`). The `{{*}}` wildcard is not one: that marker is
 * deliberate, and lineShows matches it against anything.
 *
 * Such a line says nothing about THIS run, exactly as identifiesNothing's do,
 * so it is dropped with a warning rather than searched for: no page has ever
 * shown the literal text of a marker, so looking for it can only stop the run.
 * fwod49-n2: an unresolved `{{02-open.product_name}}` reached the gate as a
 * param value, every replay of s_78eaaf and s_32409f stopped on "the page did
 * not show `- option \"{{02-open.product_name}}\"`", and the skills were
 * demoted for it. Judged at CHECK time in both runners, so a store compiled
 * before this rule existed is fixed without re-recording.
 */
export function unfilledSlot(line: string): boolean {
  return UNFILLED_MARKER.test(line);
}

/**
 * Can a missing value in this slot change what the procedure DOES?
 *
 * Yes when some segment of the chain types or locates by it (`usedIn`, the
 * steps whose args or locators carry it), or when it names the record the
 * procedure must find (a `{{vN}}` inside `preconditions.requireText`).
 * Otherwise only the template, the report and recorded expectations carry it
 * — and a line this run cannot fill is dropped with a warning (unfilledSlot),
 * so its absence is no reason to refuse the procedure.
 *
 * ONE predicate for three readers that used to disagree: replay's refusal of
 * missing params (replay.ts), the daemon's consumption gate (flow.ts
 * ignorableRefs) and the compile's `usedSlot` (emit.ts). odoo fwod85: s_6a1629
 * declared v10 only for the Save step's `- cell "{{v10}}"`; the flow bound
 * nothing to it, the artifact ran and dropped the line, and both daemon
 * replays refused the pin outright ("missing params: v10").
 */
export function slotActs(
  chain: ReadonlyArray<{
    params: Readonly<Record<string, { usedIn?: readonly number[] } | undefined>>;
    preconditions?: { requireText?: readonly string[] } | null;
  }>,
  slot: string,
): boolean {
  const marker = `{{${slot}}}`;
  return chain.some(
    (seg) => (seg.params[slot]?.usedIn?.length ?? 0) > 0 || (seg.preconditions?.requireText ?? []).some((text) => text.includes(marker)),
  );
}

/**
 * A recorded line whose slot this run bound to NOTHING. The compiled artifact
 * spells an unpublished reference as '' (`outputs[ref] ?? ''`, emit.ts), where
 * the daemon leaves the param absent — and url.ts's `unfilled`, gates.ts's
 * markersBound and urlRecordParts all read '' as "no value". This gate did not:
 * fwod67's 04-open expectation `- row "20% £ {{v9}}"` filled to
 * `- row "20% £ "` in the artifact and was searched for as literal text, while
 * the daemon (v9 absent, so unfilledSlot) dropped the line and passed. Judged
 * on the RECORDED line, before filling erases the marker.
 */
export function boundToNothing(line: string, params: Record<string, string>): boolean {
  return [...line.matchAll(/\{\{([vd]\d+)\}\}/g)].some((m) => m[1] in params && params[m[1]] === '');
}

/** `- role "name" [state]…: value` — the name may be cut short by the 120-char stored-line cap, so its closing quote is optional. */
const LINE_PARTS = /^-?\s*([A-Za-z][\w-]*)(?:\s+"((?:[^"\\]|\\.)*)"?)?((?:\s+\[[^\]]*\])*)(?::\s*(.*))?$/;

/** No content once wildcards are removed: empty, or a stringified absent value ("null", "undefined") a slot was filled with. */
function blankContent(s: string | undefined): boolean {
  const rest = (s ?? '').split(WILDCARD).join('').trim();
  return !rest || /^(null|undefined)$/i.test(rest);
}

/**
 * A page line that says nothing about WHICH element appeared: no accessible
 * name (a label is part of it — dialect 2 names a control by its <label>), no
 * value, or only a wildcard or blank one. `- textbox "": {{*}}`, `- cell ""`,
 * `- generic ""`, `- checkbox [checked]`: some element of that role is on the
 * page for reasons of its own. odoo's inline list editor puts unnamed
 * textboxes in and out of the form as rows gain and lose focus, and fwod47-n3's
 * 04-open stopped on `- textbox "": null` — a click that did exactly what it
 * was recorded doing, failed on a line that could never have proved it. The
 * role alone never identifies (any role: a named row does, an unnamed one does
 * not), except a popup container, whose appearance IS the event.
 *
 * Judged on the line as it will be matched: at compile after substitution and
 * masking, at run time after params are filled — so a slot that fills to
 * nothing identifies nothing either. A line this cannot parse is kept.
 */
export function identifiesNothing(line: string): boolean {
  const m = LINE_PARTS.exec(line.trim());
  if (!m) return false;
  const [, role, name, , value] = m;
  if (POPUP_ROLE.test(role)) return false;
  return blankContent(name) && blankContent(value);
}

/**
 * An effect expectation asserts what the PROCEDURE put on the page, and the
 * procedure only ever puts values there through its own fills and choices —
 * which are slots (`{{vN}}`, or a `{{dN}}` the app minted and a url showed)
 * by the time this runs, because substitute() went first. A control's
 * displayed value that is NOT a slot is therefore the app's: a default, a
 * computed figure, the id of the record the recording happened to make.
 * atelyr's project picker recorded `- combobox "…": 13f9pv52yozr` — the
 * recording's own project id — and every replay's project had another, so
 * both add-item steps stopped at "did not show … as it did when recorded".
 *
 * Provenance, not shape: no attempt is made to recognise an identifier by
 * how it looks, which breaks on the next app. The role and name still have
 * to match; only the value after the colon is wildcarded.
 */
export function maskMinted(line: string): string {
  // `- role "name" [state]: value` — the value colon is the one after the
  // (quoted) name and any state markers, never one inside the name.
  return line.replace(/^(-?\s*\S+(?:\s+"(?:[^"\\]|\\.)*")?(?:\s+\[[^\]]*\])*)(:\s*)(\S.*?)\s*$/, (whole, head: string, sep: string, value: string) =>
    value.includes('{{') ? whole : `${head}${sep}${WILDCARD}`,
  );
}

/** The roles whose displayed value a PROCEDURE can put there by typing or choosing. */
const EDITABLE_ROLE = /^(textbox|searchbox|spinbutton|combobox)$/;

/**
 * The second half of maskMinted's provenance rule, for values that ARE slots.
 *
 * maskMinted wildcards a control's value when it is a literal, because the
 * procedure only ever puts a value on the page through its own fills and
 * choices, and a literal is therefore the app's. A slot is not automatically
 * the procedure's either: a skill's params carry values from ANOTHER step's
 * output (`output:i2:product_name`), and a step that merely double-clicks a
 * row is not what put that product's name in the row's combobox — the app
 * did, and on the next run it may hold whatever record the run actually
 * opened. fwod49-n2's 04-open recorded its dblclick's effect as
 * `- combobox "Type to find a product...": {{v4}}` / `- textbox "": {{v4}}`
 * and could only ever pass on the recording's own quotation.
 *
 * So a value is firm evidence only when it is one of `own` — the values this
 * step itself put on the page (its own fill/type/select args). Everything
 * else at an editable role becomes the wildcard. Provenance, not shape: no
 * attempt is made to tell an id from a title. Role, name and state are
 * untouched and still have to match, and the wildcard already in a value
 * (`{{*}}`) is left alone.
 */
export function maskForeignValue(line: string, own: readonly string[]): string {
  return line.replace(
    /^(-?\s*(\S+)(?:\s+"(?:[^"\\]|\\.)*")?(?:\s+\[[^\]]*\])*)(:\s*)(\S.*?)\s*$/,
    (whole, head: string, role: string, sep: string, value: string) => {
      if (!EDITABLE_ROLE.test(role) || value === WILDCARD) return whole;
      return own.some((v) => v.trim() === value.trim()) ? whole : `${head}${sep}${WILDCARD}`;
    },
  );
}

/**
 * A popup item is never PARAMETERISED: the slots in an open menu's or
 * listbox's entry become the wildcard, which leaves `- option "{{v4}}"` as
 * `- option "{{*}}"` — a line identifying nothing, dropped by the same rule
 * that drops `- cell ""`. The popup's own container line survives to carry the
 * evidence that it opened. See POPUP_ITEM_ROLE for why (fwod49-n2 02-open).
 */
export function maskPopupItem(line: string): string {
  return popupItem(line) ? line.replace(/\{\{[vd]\d+\}\}/g, WILDCARD) : line;
}

/**
 * A recorded line as it is looked for on a LIVE page: the recording's clock
 * and calendar tokens masked (a store compiled before masking existed still
 * carries them), the recording's own minted values masked, and this run's
 * params filled in. Both runners fill at run time, from the same map.
 *
 * A secret marker (`{{env:NAME}}`, `{{totp:NAME}}`) — recorded where the page
 * echoed a scrubbed value, or arriving through a param bound to one — is the
 * wildcard: the value is never written into a line, and a line cannot be
 * checked against a marker the page never shows (fwgh9: "recorded page change
 * … {{env:APP_PASSWORD}} … not checked").
 */
export function liveLines(lines: readonly string[], params: Record<string, string>): string[] {
  // A value goes into a line as a snapshot would render it — whitespace runs
  // collapsed, edges trimmed (snapshot.ts `clean`) — never as it was read:
  // kanboard fwkb39's read published "Backlog ", and `- link "{{v5}}"` became
  // `- link "Backlog "`, which no snapshot name ever shows.
  const rendered = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v]));
  return lines.map((l) => fillParams(maskMinted(maskCounters(maskVolatile(l))), rendered).replace(/\{\{(?:env|totp):\w+\}\}/g, WILDCARD));
}

/**
 * The expectation lines that could tell a right-element fill from a
 * wrong-element one. A recorded added-line that merely restates the fill in a
 * same-role element — `textbox "": {{v4}}` — is an ECHO: the WRONG textbox
 * produces it too, so it is no evidence at all. fwgr17-n3's 03-open passed
 * its effect gate on exactly that line after a positional fallback took the
 * step. When consequential lines exist (the heading that renders the typed
 * title, the menu button named after it), only those count; when the echo is
 * all the recording has, it is returned unchanged — a lone search-box fill
 * legitimately shows nothing else, and the caller warns instead.
 */
export function isEchoLine(line: string, filledValue: string): boolean {
  return new RegExp(`^-?\\s*(textbox|searchbox|spinbutton|combobox)\\b[^:]*:\\s*${escapeRe(filledValue)}\\s*$`).test(line.trim());
}

export function consequentialExpectations(lines: string[], filledValue: string | undefined): string[] {
  if (!filledValue) return lines;
  const rest = lines.filter((l) => !isEchoLine(l, filledValue));
  return rest.length ? rest : lines;
}

/** A fresh look at the live page, in the step's line dialect (see snapshot.ts captureLines). */
export interface LiveLines {
  lines: string[];
  /** The look covered enough of the page for a missing line to mean absent (coverageComplete). */
  complete: boolean;
  coverage?: ObservationCoverage;
}

/** What a runner observed after the step: its diff, and a way to look again. */
export interface ChangeObservation {
  /** The lines the step added (the diff), or null when that capture failed — never [] for "unavailable". */
  added: string[] | null;
  /**
   * A fresh look at the live page; null when the page cannot be read. Both
   * are rendered in the dialect the step's recorded lines are in — a diff in
   * one dialect judged against lines in another would miss by construction.
   */
  live: (look?: FullNameLook) => Promise<LiveLines | null>;
}

/** The roles recorded lines name (`- row "…"` → row): what a FullNameLook names in full. */
export function lineRoles(lines: readonly string[]): string[] {
  const roles = new Set<string>();
  for (const l of lines) {
    const m = /^-?\s*([A-Za-z][\w-]*)\s+"/.exec(l.trim());
    if (m) roles.add(m[1]);
  }
  return [...roles];
}

/** The step, as the verdict needs to know it. */
export interface ChangeContext {
  /** Human step tag, e.g. "5", "9.2.1", or the artifact's "<stepId> <segmentId>/<index>". */
  tag: string;
  tool: string;
  /** The value a fill/type step put on the page, params filled. */
  value?: string;
  /** Some target of this step resolved through a structural (positional) candidate. */
  positionalResolution: boolean;
}

export interface ChangeVerdict {
  /** The step ran but did not have its recorded effect: the reason, and the run stops. */
  stop?: string;
  /** Always applied, whatever else the verdict says. */
  warnings: string[];
  /**
   * Part of the evidence was missing: the diff leg (a failed capture, the
   * live page decided), or a live look that could not cover the page, so a
   * stop could not be confirmed as a real absence.
   */
  unobserved?: true;
  /**
   * The recorded effect was a dialog opening and no dialog opened. A dialog
   * is conditional UI — "Discard changes?" appears only when there are
   * changes — so its absence is a legitimate state, not a failed effect; the
   * steps that were going to act inside it are skipped (see namesDialogControl).
   *
   * `lines` is the dialog's own recorded subtree — the controls it listed.
   * Membership is PROVEN against it, never inferred from a target simply
   * being missing: a step whose locator names nothing the dialog contained
   * is a step of the procedure's own, and its absence is a failure.
   */
  absentDialog?: { name: string; lines: string[] };
  /**
   * The step's recorded page changes were seen in what the action ADDED — the
   * diff, not merely the live page, where a line may simply have been there
   * already — and nothing weakened that (a positional fill proven only by its
   * own echo is not confirmation). This is the evidence that lets an alert the
   * recording never saw be reported instead of stopping the run (gates.ts
   * alertVerdict): the step demonstrably did what it was recorded doing.
   */
  confirmed?: true;
  /**
   * The recorded lines (markers intact) whose filled form THIS run's diff
   * added: what the action itself put on the page, not what the page already
   * showed. The evidence a commit is judged on (phase B provenance, stage 1):
   * a Save whose recorded row line this run's diff never added committed
   * nothing, however the live page looks. Absent when the diff was not captured.
   */
  inDiff?: string[];
}

/**
 * Page-change expectations. Lines that carry a parameter are HARD: they are
 * what distinguishes this run from the recorded one (the new title appearing
 * as a heading), so their absence means the step acted on the wrong thing
 * even though it "worked". Everything else stays soft until data says it is
 * reliable — but a plain change absent from the diff AND the live page means
 * the action did not have its recorded effect, and failing there is what
 * turns a rejected state change into a clean recovery instead of a false
 * success (the fwrd4l-n3 Ready click).
 *
 * Both halves are matched by lineShows over WHOLE snapshot lines — role,
 * name, state and the value after the colon — in the diff first and then on
 * the live page. Empty `warnings` and nothing else set means the step passed
 * with nothing to say.
 */
export async function expectedChangesVerdict(
  recorded: readonly string[] | undefined,
  params: Record<string, string>,
  ctx: ChangeContext,
  obs: ChangeObservation,
): Promise<ChangeVerdict> {
  const verdict = await changesVerdict(recorded, params, ctx, obs);
  if (verdict.stop || obs.added === null || !recorded?.length) return verdict;
  const inDiff = linesInDiff(recorded, params, obs.added);
  return inDiff.length ? { ...verdict, inDiff } : verdict;
}

/**
 * The recorded lines whose filled form is in `added`, the lines this step's
 * own action added — transient lines, lines identifying nothing and lines this
 * run could not fill left out, as the verdict leaves them out.
 */
export function linesInDiff(recorded: readonly string[], params: Record<string, string>, added: readonly string[]): string[] {
  return recorded.filter((line) => {
    if (TRANSIENT_LINE.test(line) || boundToNothing(line, params)) return false;
    const [filled] = liveLines([line], params);
    return !identifiesNothing(filled) && !unfilledSlot(filled) && lineShows(added as string[], [filled]);
  });
}

/**
 * A control's own line: the field showing what was typed into it, a picked
 * option, a ticked box. The line an input renders is the input, not something
 * the app did with the value.
 */
const CONTROL_LINE = /^-?\s*(textbox|searchbox|spinbutton|combobox|listbox|option|checkbox|radio|switch|slider|menuitem\w*)\b/;

/**
 * The `{{vN}}` slots a commit showed (phase B provenance, stage 1): named in a
 * line this run's diff added (ChangeVerdict.inDiff) after a click or press,
 * where the line is neither a popup item (the environment answering
 * keystrokes) nor a control's own line (the field still holding what was
 * typed). Such a slot's value is on the page because the app took it — the
 * saved row, the heading that renders the new title — so a report value made
 * of it is COMMITTED, not merely typed. Both runners collect it after the
 * action, from the same verdict.
 */
export function committedSlots(tool: string, inDiff: readonly string[] | undefined): string[] {
  if (!inDiff?.length || !['click', 'dblclick', 'press'].includes(tool)) return [];
  const out = new Set<string>();
  for (const line of inDiff) {
    if (popupItem(line) || CONTROL_LINE.test(line.trim())) continue;
    for (const m of line.matchAll(/\{\{(v\d+)\}\}/g)) out.add(m[1]);
  }
  return [...out];
}

async function changesVerdict(
  recorded: readonly string[] | undefined,
  params: Record<string, string>,
  ctx: ChangeContext,
  obs: ChangeObservation,
): Promise<ChangeVerdict> {
  const warnings: string[] = [];
  if (!recorded?.length) return { warnings };
  const { tag } = ctx;
  // Confirmation (ChangeVerdict.confirmed) holds only while every recorded
  // group was found in the diff; any fallback below clears it.
  let confirmed = true;
  // The step diff is ONE source of evidence, not the authority. When the
  // capture failed there are no added lines to search — which must not read
  // as "the expected line was absent but harmlessly so", nor as a pass. The
  // checks below fall through to a fresh look at the live page, and a
  // required effect that cannot be found there still stops the run.
  // `added === null` means unavailable; `[]` means observed-empty.
  const added = obs.added;
  if (added === null) warnings.push(`step ${tag}: the page could not be captured after the action — its recorded effects were checked against the live page instead`);
  // A live look answers three ways. Shown is evidence. Not shown on a look
  // that covered the page is absence. Not shown on a look that could not
  // (the page unreadable, a cap reached, a visible frame unread, a
  // virtualised list) is NOT absence: the stop below still stands — nothing
  // established the effect — but it is marked unobserved and says why, and a
  // conditional branch (the absent dialog) is never taken on it.
  const look = async (lines: string[]): Promise<{ shown: boolean; complete: boolean; why: string }> => {
    const live = await obs.live();
    if (!live) return { shown: false, complete: false, why: 'the page could not be read' };
    if (lineShows(live.lines, lines)) return { shown: true, complete: live.complete, why: '' };
    // A NAME PAST THE CAP (round 63, openproject fwop17 04-create): an
    // element named by its text is observed with no name once that text is
    // longer than NAME_CAP, and an attribute name is cut there, so a line
    // whose value this run made longer than the recording's can be on the
    // page and never in a capped look. Looked for once more, with the
    // elements of the roles the lines name named in full; said when that is
    // what found it.
    const roles = lineRoles(lines);
    if (roles.length) {
      const full = await obs.live({ fullNameRoles: roles });
      if (full && lineShows(full.lines, lines)) {
        warnings.push(`step ${tag}: its recorded page change was found only by its full name, which is longer than the ${NAME_CAP} characters a look names an element by`);
        return { shown: true, complete: full.complete, why: '' };
      }
    }
    return { shown: false, complete: live.complete, why: live.complete ? '' : live.coverage ? describeCoverage(live.coverage) || 'coverage unknown' : 'coverage unknown' };
  };
  // A line carrying a {{vN}} slot is HARD (below). A {{dN}} derived marker
  // is filled like any other param but stays soft — the app minted it. An item
  // inside an open popup is never HARD whatever it carries: the list is the
  // environment's answer to the keystrokes so far, not proof this step acted
  // on the right element (POPUP_ITEM_ROLE; fwod49-n2 02-open stopped on
  // `- option "{{v4}}"`). A store compiled before maskPopupItem existed is
  // fixed here, without re-recording.
  const isParam = (l: string) => SLOT_LINE.test(l) && !popupItem(l);
  // Transient lines (spinners, progress bars) are dropped here too, so a
  // store compiled before TRANSIENT_LINE existed stops failing on them.
  const lines = recorded.filter((l) => !TRANSIENT_LINE.test(l));
  if (!lines.length) return { warnings: [] };
  // A line that identifies no element proves nothing either way, so it is not
  // looked for — filled first, so a store minted before compile dropped such
  // lines (fwod47-n3 04-open's `- textbox "": {{v5}}`) is fixed without
  // re-recording. All of them gone means the step has no expectation.
  // ...and a line this run could not fill (unfilledSlot) is dropped the same
  // way, with a warning: an unbound `{{vN}}`, or a param whose value is itself
  // an unresolved reference, would otherwise be searched for as literal text
  // and stop a step that did exactly what it was recorded doing (fwod49-n2).
  const unfilled: string[] = [];
  const usable = (group: string[]): string[] =>
    group.filter((l) => {
      if (identifiesNothing(l)) return false;
      if (unfilledSlot(l)) {
        unfilled.push(l);
        return false;
      }
      return true;
    });
  // A slot bound to '' is unfilled too (boundToNothing) — judged on the
  // recorded line, since filling would erase the marker it is judged by.
  // A line that would identify nothing once filled is dropped silently, as
  // identifiesNothing drops it (`- textbox "": {{v5}}` with v5 = '').
  const fillable = (group: string[]): string[] =>
    group.filter((l) => {
      if (!boundToNothing(l, params)) return true;
      if (!identifiesNothing(liveLines([l], params)[0])) unfilled.push(l);
      return false;
    });
  let parameterised = usable(liveLines(fillable(lines.filter(isParam)), params));
  const plain = usable(liveLines(fillable(lines.filter((l) => !isParam(l))), params));
  if (unfilled.length) {
    warnings.push(
      `step ${tag}: ${unfilled.length} recorded page change(s) carry a value this run could not fill (e.g. ${JSON.stringify(unfilled[0])}) — not checked`,
    );
  }
  if (!parameterised.length && !plain.length) return { warnings };
  // A positionally-resolved fill must prove itself with a CONSEQUENTIAL
  // change: its own echo in a same-role element is what the wrong element
  // produces too (see consequentialExpectations). When the echo is all the
  // recording has, the old gate stands and we say so.
  if (ctx.positionalResolution && parameterised.length && typeof ctx.value === 'string' && ctx.value) {
    const value = ctx.value;
    const consequential = parameterised.filter((l) => !isEchoLine(l, value));
    if (consequential.length) parameterised = consequential;
    else {
      confirmed = false;
      warnings.push(`step ${tag}: resolved positionally and its only recorded effect is the fill's own echo — the effect gate cannot tell right element from wrong here`);
    }
  }
  if (parameterised.length && !(added !== null && lineShows(added, parameterised))) {
    confirmed = false;
    const seen = await look(parameterised);
    if (!seen.shown) {
      const shown = parameterised.map((w) => JSON.stringify(w)).join(' / ');
      if (!seen.complete) {
        return { warnings, unobserved: true, stop: `after step ${tag} the page did not show ${shown} as it did when recorded, and that could not be confirmed: capture incomplete (${seen.why}) — the step ran but its effect was not established` };
      }
      return { warnings, stop: `after step ${tag} the page did not show ${shown} as it did when recorded — the step ran but probably acted on the wrong element` };
    }
  }
  if (plain.length && !(added !== null && lineShows(added, plain))) {
    confirmed = false;
    // None of the recorded effects in the step diff — check the live page
    // before judging (a change can land outside the diff window).
    const seen = await look(plain);
    if (!seen.shown) {
      // The recorded effect was a dialog opening. A dialog is conditional
      // UI: fwgr24's create step recorded "Exit edit" → "Discard changes to
      // dashboard?" because the RECORDING had unsaved edits at that moment;
      // a replay whose earlier steps saved cleanly has none, no dialog
      // opens, and that is the app working — not the step failing. The
      // steps that would have acted inside the dialog are skipped instead.
      const dialog = plain.map((l) => DIALOG_LINE.exec(l)?.[1]).find((n) => n !== undefined);
      // ...but only on a real observation. Concluding "the dialog did not
      // open" from a capture that failed is inferring a branch from missing
      // evidence, and it would go on to skip the steps inside it.
      if (dialog !== undefined && added === null) {
        return { warnings, unobserved: true, stop: `after step ${tag} the page could not be captured, so whether the dialog ${JSON.stringify(dialog)} opened is unknown — its absence cannot be assumed` };
      }
      // The same for a live look that could not cover the page: a dialog in
      // an unread frame, or past a cap, is not a dialog that did not open.
      if (dialog !== undefined && !seen.complete) {
        return { warnings, unobserved: true, stop: `after step ${tag} the recorded dialog ${JSON.stringify(dialog)} was not seen, but the page could not be observed in full (${seen.why}) — its absence cannot be assumed` };
      }
      if (dialog !== undefined) {
        warnings.push(`step ${tag}: the recorded dialog ${JSON.stringify(dialog)} did not open — conditional UI, treated as absent; steps that name one of its controls will be skipped`);
        return { warnings, absentDialog: { name: dialog, lines: plain } };
      }
      if (!seen.complete) {
        return { warnings, unobserved: true, stop: `after step ${tag} none of the ${plain.length} recorded page change(s) appeared (e.g. ${JSON.stringify(plain[0])}), and that could not be confirmed: capture incomplete (${seen.why}) — the step ran but its effect was not established` };
      }
      return { warnings, stop: `after step ${tag} none of the ${plain.length} recorded page change(s) appeared (e.g. ${JSON.stringify(plain[0])}) — the step ran but did not have its recorded effect` };
    }
    warnings.push(`step ${tag}: none of the ${plain.length} expected page change(s) appeared in the step diff (found on the page instead)`);
  }
  if (added === null) return { warnings, unobserved: true };
  return confirmed ? { warnings, confirmed: true } : { warnings };
}

/** The locator candidates of a step, as far as the dialog-membership rule reads them. */
export interface DialogControlStep {
  locators: Record<string, readonly { kind: string; name?: string; text?: string; label?: string; hasText?: string }[] | undefined>;
}

/**
 * The name a step's target candidates put on the element, for membership
 * tests against a dialog's recorded subtree. Only NAMED candidates count: a
 * css/point/testid target says where an element was, not what it was called,
 * and a positional match against a dialog's line list would be a coincidence.
 */
function targetNames(step: DialogControlStep, params: Record<string, string>): string[] {
  const out: string[] = [];
  for (const c of [...(step.locators.target ?? []), ...(step.locators.source ?? [])]) {
    const name = c.kind === 'role' ? c.name : c.kind === 'text' ? c.text : c.kind === 'label' ? c.label : c.kind === 'scoped' ? c.hasText : undefined;
    if (name) out.push(fillParams(name, params).trim());
  }
  return out.filter((n) => n.length > 0);
}

/**
 * Whether a step acts on a control the absent dialog itself listed — the
 * control's name when it does, null when it does not. The dialog's recorded
 * effect lines carry its subtree — `- button "Confirm"`, `- textbox "Reason"`
 * — so a step naming one of them was inside it. This is the evidence
 * `dropDismissedDialogs` uses at compile time, applied at run time by both
 * runners.
 */
export function namesDialogControl(step: DialogControlStep, dialogLines: readonly string[], params: Record<string, string>): string | null {
  for (const name of targetNames(step, params)) {
    if (dialogLines.some((l) => l.includes(`"${name}"`))) return name;
  }
  return null;
}

/**
 * Is this step a dismissal whose work is already done — the dialog it was
 * recorded closing is not on the page?
 *
 * A step is an action taken to reach a state, and a replay should act only
 * when the state is not already there. The toggle skip applies that to what a
 * step ADDS (a popup already open is not clicked again), `absentDialog` to a
 * dialog an earlier step of the same segment recorded opening. Neither covers
 * a dialog nothing in the procedure opened. fwop1's sign-in landed on
 * OpenProject's first-login "Welcome to OpenProject" dialog, the procedure's
 * next segment began by clicking its Close, and every later run — the admin
 * no longer a first-time user — had no dialog: both replays fell to the model
 * for 16-17 turns and the compiled spec failed 0/7 at its first action. The
 * same shape is every cookie banner, onboarding tour and what's-new dialog.
 *
 * So the evidence is the step's OWN recorded removal (StepExpectation.
 * removedContains), and the step is conditional on it. Called only once the
 * target has failed to resolve in the runner's full resolve window, so a
 * dialog that appears late has had the time to appear; and all of these must
 * hold, or it is an ordinary miss:
 *   - the recorded removals include a dialog, and the target names one of the
 *     controls they listed (namesDialogControl — membership proven, never
 *     inferred from the target being missing), by a DISMISSAL name. Compile
 *     records removals only for a step whose whole effect was the dialog
 *     going (no added line, alert, navigation, page effect or read), and the
 *     name is the second, independent guard against skipping a confirm;
 *   - the step mints nothing (a skipped mutation cannot be undone);
 *   - a live look that COVERED the page does not show the dialog. A look that
 *     could not cover it proves nothing absent, and a dialog that IS there
 *     with its control missing is a real failure.
 * Frame steps are excluded by the callers, as for `absentDialog`.
 */
/**
 * Button names that dismiss a dialog without acting — UI convention, not app
 * knowledge. A confirm ("Delete", "Save", "OK", "Accept") never matches: it
 * also closes its dialog, but skipping it when the dialog did not appear
 * would hide exactly the regression a missing confirm dialog is.
 */
export const DISMISSAL = /^(cancel|close|dismiss|no|no,? thanks|not now|later|maybe later|skip|got it|back|keep editing|[×✕✖])$/i;

export function dismissalAlreadyInEffect(
  step: DialogControlStep & { mints?: unknown; expect?: { removedContains?: readonly string[] } },
  live: LiveLines | null,
  params: Record<string, string>,
): { dialog: string; control: string } | null {
  const removed = step.expect?.removedContains;
  if (!removed?.length || step.mints) return null;
  const dialogLine = removed.find((l) => DIALOG_LINE.test(l));
  if (dialogLine === undefined) return null;
  const control = namesDialogControl(step, liveLines(removed, params), params);
  if (control === null || !DISMISSAL.test(control.trim()) || !live?.complete) return null;
  if (lineShows(live.lines, liveLines([dialogLine], params))) return null;
  return { dialog: DIALOG_LINE.exec(dialogLine)![1], control };
}

/**
 * What an action's observation (src/execution/action.ts `beginAction`) polls
 * for as the step's completion: the HARD half of its recorded page changes —
 * the lines carrying this run's own `{{vN}}` values, filled — in the step's
 * line dialect. It holds when any of them shows, as the effect gate
 * (expectedChangesVerdict) accepts any of them; it does not hold when none
 * shows on a look that covered the page; and it could not be observed (null)
 * otherwise. Undefined when the step has no such line: quiet is then all the
 * observation waits for, and it never calls that an effect.
 *
 * The recorded url is not part of it. Both runners' url gates already wait on
 * the url with their own window, and a url the gate would accept as volatile
 * would never strictly match here, so every such step would sit out the whole
 * effect window first.
 */
export function effectExpectation(
  page: Page,
  recorded: readonly string[] | undefined,
  params: Record<string, string>,
  d: LineDialect = 1,
): { holds(): Promise<boolean | null> } | undefined {
  // The same three exclusions the effect gate makes, for the same reasons: a
  // popup item is never the hard half, and a line identifying nothing or one
  // this run could not fill is not something to wait for (fwod49-n2 — the
  // observation would have polled for the literal "{{02-open.product_name}}"
  // for the whole action window before the gate stopped on it).
  const hard = liveLines((recorded ?? []).filter((l) => SLOT_LINE.test(l) && !TRANSIENT_LINE.test(l) && !popupItem(l)), params).filter(
    (l) => !identifiesNothing(l) && !unfilledSlot(l),
  );
  if (!hard.length) return undefined;
  return {
    holds: async () => {
      const live = await captureLines(page, d);
      if (!live) return null;
      if (lineShows(live.lines, hard)) return true;
      return live.complete ? false : null;
    },
  };
}
