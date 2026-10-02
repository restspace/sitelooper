/**
 * Assertions: what `sitelooper assert` records, and how both execution targets
 * report one that does not hold. The daemon imports this module; a compiled
 * `.flow.ts` artifact embeds its exact source (spec/runtime-source.ts), so it
 * must stay self-contained — no imports beyond a sibling shared module.
 *
 * An assertion is a recorded `wait_for` step carrying `assert` (store.ts
 * SkillStep.assert). It resolves and waits exactly as a wait does; what differs
 * is what a miss MEANS. A wait that times out is a step that drifted, and the
 * recovery ladder may find another way. An assertion that times out is the
 * answer the caller asked for: the run stops there, no model is consulted, and
 * nothing may skip it. See notes/PLAN-assert-command.md.
 */

import { textHolds } from './text.js';

/** The conditions an assertion can state: wait_for's five, a field's value, and the page url. */
export type AssertState = 'visible' | 'hidden' | 'text_equals' | 'text_contains' | 'count' | 'value_equals' | 'url_contains';

export const ASSERT_STATES: readonly AssertState[] = ['visible', 'hidden', 'text_equals', 'text_contains', 'count', 'value_equals', 'url_contains'];

/** The states only an assertion may record: an ordinary instruction's wait_for is never offered them. */
export const ASSERT_ONLY_STATES: readonly AssertState[] = ['value_equals', 'url_contains'];

/** States that compare against `args.text`, and so fall under the stated-source rule (statedIn). */
export const ASSERT_TEXT_STATES: readonly AssertState[] = ['text_equals', 'text_contains', 'value_equals', 'url_contains'];

/**
 * How an assertion missed. `failed`: the page was read and the condition does
 * not hold. `unlocatable`: no recorded way of finding the target resolved, so
 * the condition could not be read at all. Both stop the run; they are told
 * apart because the second may be drift in the locator rather than in the app.
 */
export type AssertFailureKind = 'failed' | 'unlocatable';

const PREFIX: Record<AssertFailureKind, string> = {
  failed: 'assertion failed',
  unlocatable: 'assertion could not be checked',
};

/**
 * The one message both runners raise for a missed assertion: the prefix names
 * the kind (assertFailureKind reads it back from a thrown Error), `message` is
 * the caller's own sentence with this run's values filled in, `detail` is what
 * the runner saw (the underlying wait's own error text).
 */
export function assertFailure(kind: AssertFailureKind, message: string, detail: string): string {
  const shown = plainDetail(detail);
  return `${PREFIX[kind]}: ${message}${shown ? ` — ${shown}` : ''}`;
}

/** The longest detail a failure carries: the daemon's replay already clipped its own to this. */
const DETAIL_MAX = 300;

/**
 * A runner's error text as one plain line. Playwright's `expect` errors — what
 * the artifact catches — are multi-line and coloured for a terminal; the
 * daemon's wait raises one plain sentence. Normalised here, in the one place
 * both pass through, so the same miss reads the same in a flow run's report
 * and in a test report.
 */
function plainDetail(detail: string): string {
  const ESC = String.fromCharCode(27);
  let plain = '';
  for (let i = 0; i < detail.length; i++) {
    // A terminal colour sequence: ESC [ … m.
    if (detail[i] === ESC && detail[i + 1] === '[') {
      const end = detail.indexOf('m', i);
      if (end > 0) {
        i = end;
        continue;
      }
    }
    plain += detail[i];
  }
  const line = plain.replace(/\s+/g, ' ').trim();
  return line.length <= DETAIL_MAX ? line : line.slice(0, DETAIL_MAX) + '…';
}

/** The kind an error message produced by assertFailure carries, or null for any other error. */
export function assertFailureKind(errorMessage: string): AssertFailureKind | null {
  if (errorMessage.startsWith(`${PREFIX.failed}: `)) return 'failed';
  if (errorMessage.startsWith(`${PREFIX.unlocatable}: `)) return 'unlocatable';
  return null;
}

/** Whether a field's current value satisfies `value_equals`: compared as textHolds compares text_equals. */
export function valueHolds(shown: string, want: string): boolean {
  return textHolds(shown, 'text_equals', want);
}

/** Whether the page url satisfies `url_contains`: plain containment, no normalisation of either side. */
export function urlHolds(url: string, want: string): boolean {
  return want !== '' && url.includes(want);
}

/**
 * THE STATED-SOURCE RULE. An assertion's expected text must come from the
 * caller: it has to be written in the assertion's own sentence (where a
 * declared var or an earlier step's output has already been substituted in).
 * A value the agent only read off the page while locating the element is not
 * an expectation, it is the page agreeing with itself — "verify the total is
 * correct" compiled to "the total equals whatever it shows" passes for ever.
 *
 * Compared with whitespace runs collapsed and case folded, as a rendered
 * value is compared everywhere else. This is a rule about where the value
 * came from, never about what it looks like.
 */
export function statedIn(instruction: string, expected: string): boolean {
  const fold = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const want = fold(expected);
  return want !== '' && fold(instruction).includes(want);
}
