/**
 * Observations both execution targets take of a live page, so that a shared
 * verdict (./gates.ts) is asked the same question in the same dialect by the
 * daemon and by a compiled `.flow.ts` artifact. Self-contained: this module is
 * embedded verbatim in the artifact (spec/runtime-source.ts), so nothing but
 * a sibling shared module or a Playwright type may be imported.
 */
import type { Page } from 'playwright-core';
import { capturePage } from './snapshot.js';

/**
 * The visible live-region texts on the page right now — the alerts half of
 * the ONE page capture the daemon diffs (describeInPage under SNAPSHOT_LIMITS,
 * src/execution/snapshot.ts): the same elements, visibility rule, caps and
 * whitespace cleaning by construction, not by a second copy kept in step. An
 * alert the daemon would diff is one the artifact sees. These are toasts and
 * status lines, not native `window.alert` dialogs. Null when the page cannot
 * be read (navigating, closed, not answering): "unobserved", never "no alert".
 */
export async function liveAlerts(page: Page): Promise<string[] | null> {
  const captured = await capturePage(page);
  return captured ? captured.alerts : null;
}
