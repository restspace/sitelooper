import { WILDCARD, escapeRe, maskVolatile } from './text.js';
import { fillParams } from './url.js';
import { lineShows } from './snapshot.js';

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

/**
 * A recorded line as it is looked for on a LIVE page: the recording's clock
 * and calendar tokens masked (a store compiled before masking existed still
 * carries them), the recording's own minted values masked, and this run's
 * params filled in. Both runners fill at run time, from the same map.
 */
export function liveLines(lines: readonly string[], params: Record<string, string>): string[] {
  return lines.map((l) => fillParams(maskMinted(maskVolatile(l)), params));
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

/** What a runner observed after the step: its diff, and a way to look again. */
export interface ChangeObservation {
  /** The lines the step added (the diff), or null when that capture failed — never [] for "unavailable". */
  added: string[] | null;
  /** A fresh look at the live page; null when the page cannot be read. */
  live: () => Promise<string[] | null>;
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
  /** The diff leg of the evidence was missing (a failed capture); the live page decided. */
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
  const warnings: string[] = [];
  if (!recorded?.length) return { warnings };
  const { tag } = ctx;
  // The step diff is ONE source of evidence, not the authority. When the
  // capture failed there are no added lines to search — which must not read
  // as "the expected line was absent but harmlessly so", nor as a pass. The
  // checks below fall through to a fresh look at the live page, and a
  // required effect that cannot be found there still stops the run.
  // `added === null` means unavailable; `[]` means observed-empty.
  const added = obs.added;
  if (added === null) warnings.push(`step ${tag}: the page could not be captured after the action — its recorded effects were checked against the live page instead`);
  const showing = async (lines: string[]): Promise<boolean> => lineShows((await obs.live()) ?? [], lines);
  // A line carrying a {{vN}} slot is HARD (below). A {{dN}} derived marker
  // is filled like any other param but stays soft — the app minted it.
  const isParam = (l: string) => SLOT_LINE.test(l);
  // Transient lines (spinners, progress bars) are dropped here too, so a
  // store compiled before TRANSIENT_LINE existed stops failing on them.
  const lines = recorded.filter((l) => !TRANSIENT_LINE.test(l));
  if (!lines.length) return { warnings: [] };
  let parameterised = liveLines(lines.filter(isParam), params);
  const plain = liveLines(lines.filter((l) => !isParam(l)), params);
  // A positionally-resolved fill must prove itself with a CONSEQUENTIAL
  // change: its own echo in a same-role element is what the wrong element
  // produces too (see consequentialExpectations). When the echo is all the
  // recording has, the old gate stands and we say so.
  if (ctx.positionalResolution && parameterised.length && typeof ctx.value === 'string' && ctx.value) {
    const value = ctx.value;
    const consequential = parameterised.filter((l) => !isEchoLine(l, value));
    if (consequential.length) parameterised = consequential;
    else warnings.push(`step ${tag}: resolved positionally and its only recorded effect is the fill's own echo — the effect gate cannot tell right element from wrong here`);
  }
  if (parameterised.length && !(added !== null && lineShows(added, parameterised)) && !(await showing(parameterised))) {
    return { warnings, stop: `after step ${tag} the page did not show ${parameterised.map((w) => JSON.stringify(w)).join(' / ')} as it did when recorded — the step ran but probably acted on the wrong element` };
  }
  if (plain.length && !(added !== null && lineShows(added, plain))) {
    // None of the recorded effects in the step diff — check the live page
    // before judging (a change can land outside the diff window).
    if (!(await showing(plain))) {
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
      if (dialog !== undefined) {
        warnings.push(`step ${tag}: the recorded dialog ${JSON.stringify(dialog)} did not open — conditional UI, treated as absent; steps that name one of its controls will be skipped`);
        return { warnings, absentDialog: { name: dialog, lines: plain } };
      }
      return { warnings, stop: `after step ${tag} none of the ${plain.length} recorded page change(s) appeared (e.g. ${JSON.stringify(plain[0])}) — the step ran but did not have its recorded effect` };
    }
    warnings.push(`step ${tag}: none of the ${plain.length} expected page change(s) appeared in the step diff (found on the page instead)`);
  }
  if (added === null) return { warnings, unobserved: true };
  return { warnings };
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
