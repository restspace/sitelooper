/**
 * A PICK MADE BY COMMITTING THE HIGHLIGHT, as a pick by name (round 62).
 *
 * snipeit fwsi13-n1 03-create chose the model in a select2 widget in two
 * gestures. #52 typed "Bench Laptop Model" into its search: the results
 * request returned and its one option was highlighted (the journal:
 * `state option "Bench Laptops - Bench Manufacturer Bench Laptop Model"
 * +select2-results__option--highlighted`; the diff: `- option "…"`). #53
 * clicked the widget's own combobox, which closed it, and select2's
 * selectOnClose committed the highlighted option — #53's diff shows the
 * widget now named by it (`- combobox "×Bench Laptops - … Bench Laptop
 * Model"`). Compiled as a click on `#model_select_id` (the hidden native
 * select), it picked whatever was highlighted when it ran; on n2 the results
 * had not arrived and it picked nothing ("after step 8 the page did not show
 * "- combobox "×{{*}} - {{*}} Bench Laptop Model"" …"), and the recovery spent
 * 73 turns.
 *
 * The same class as gitea fwgt13's keyboard picks (key-pick.ts): the pick is
 * the highlighted item, and the option's NAME is the fact while the highlight
 * is timing or position. Here there is no key: a click that commits by
 * closing. Read from the recording's own diffs, so it holds for a store
 * recorded before the journal: the step right before the click ADDED an
 * option named N (`- option "N"`), and the click's own diff shows a control
 * now carrying N as its whole displayed value (`- combobox "×N"`,
 * `- textbox "N"`, or `: N`). A click whose target already names an option is
 * a pick by name already, and is left alone.
 */
import type { LocatorCandidate, RecordedStep } from '../daemon/recorder.js';

const OPTION_LINE = /^-\s*option "((?:[^"\\]|\\.)*)"/;
/** A line naming a control by what it now shows: `- combobox "×N"`, `- textbox "N"`, `- combobox "…": N`. */
const SHOWN_LINE = /^-\s*(combobox|textbox|button|listbox) "((?:[^"\\]|\\.)*)"(?::\s*(.*))?$/;

const unquote = (s: string): string => {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
};

/** The option names the step's diff added. */
function optionsAdded(step: RecordedStep): string[] {
  return (step.diff?.added ?? []).flatMap((l) => {
    const m = OPTION_LINE.exec(l.trim());
    return m ? [unquote(m[1]).trim()] : [];
  });
}

/** Whether the click's diff shows a control now carrying `name` as its whole value. */
function committed(step: RecordedStep, name: string): boolean {
  return (step.diff?.added ?? []).some((l) => {
    const m = SHOWN_LINE.exec(l.trim());
    if (!m) return false;
    const shown = unquote(m[2]).replace(/^[×✕✖]\s*/, '').trim();
    return shown === name || (m[3] !== undefined && m[3].trim() === name);
  });
}

/** Whether the step's own target already names an option (a pick by name). */
function namesOption(step: RecordedStep): boolean {
  if (/role=option\b/.test(String(step.args.target ?? ''))) return true;
  return (step.locators?.target?.chain ?? []).some((c) => c.kind === 'role' && c.role === 'option');
}

/** By step index: the option each highlight-committing click picked. */
export function highlightPicks(steps: readonly RecordedStep[]): Map<number, string> {
  const out = new Map<number, string>();
  steps.forEach((s, i) => {
    if (s.tool !== 'click' || i === 0 || namesOption(s)) return;
    const offered = optionsAdded(steps[i - 1]);
    const picked = offered.filter((n) => committed(s, n));
    if (picked.length === 1) out.set(i, picked[0]);
  });
  return out;
}

/**
 * The recording with each highlight-committing click rewritten as a click on
 * the option it picked, by role and name — the form the recorder gives a click
 * on the option itself (fwsi13's status and location picks). The diff stays:
 * it is what the pick did.
 */
export function namedHighlightPicks<T extends RecordedStep>(steps: readonly T[]): T[] {
  const picks = highlightPicks(steps);
  if (!picks.size) return [...steps];
  return steps.map((s, i) => {
    const name = picks.get(i);
    if (name === undefined) return s;
    const chain: LocatorCandidate[] = [{ kind: 'role', role: 'option', name }];
    return {
      ...s,
      args: { ...s.args, target: `role=option[name=${JSON.stringify(name)}]` },
      locators: { ...s.locators, target: { expr: `page.getByRole('option', { name: ${JSON.stringify(name)} })`, verified: true, raw: String(s.args.target ?? ''), chain } },
    };
  });
}
