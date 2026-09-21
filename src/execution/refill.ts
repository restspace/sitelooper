import type { Locator, Page } from 'playwright-core';
import { reactSafeFill } from './browser.js';

/**
 * STANDING FILLS, the rule both execution targets share: the values a
 * procedure filled must still be in their inputs when the action that submits
 * them goes.
 *
 * A fill is checked once, when it is typed — its own effect gate sees the
 * textbox show the value. Nothing looked again before the click that submits
 * it, and a page may rebuild its form in between. fwvk1 n3 01-open: both of
 * s_9f7dc9's login fills passed their checks, then the app, still starting up,
 * reloaded /login (its service worker took control of the page) and the Login
 * click submitted an empty form — "expected url http://127.0.0.1:8096/ but
 * browser is at http://127.0.0.1:8096/login", 4 recovery turns, which found
 * the fills had not landed.
 *
 * So each runner keeps a ledger per replayed segment (the daemon per
 * replaySkill, the artifact per emitted segment): a fill that ran is noted
 * with the page url it ran on, and before a click, a double click or a key
 * press — the actions that submit what was filled — every noted input on that
 * same url that is EMPTY again is filled once more. Then the action goes, and
 * its own gates judge it. The ledger is emptied by that action, and by any
 * other action that sets something (a select, a check, a navigation): those
 * may legitimately change other fields, and a field the app emptied after
 * them is the app's doing, not a lost fill.
 *
 * Deliberately narrow. Only a plain input or textarea is asked (a recipe-driven
 * editor has no value to compare); only an input that is now empty is refilled
 * — a value the app rewrote (a formatted phone number, an autocompleted name)
 * is the app's, never overwritten; only on the url the fill ran on; only once
 * per action; and a locator that no longer names exactly one element is left
 * alone. The values are never reported — a login's password is one of them.
 *
 * Self-contained: sibling shared modules and Playwright types only.
 */

/** One fill this segment made, as the ledger remembers it. */
export interface StandingFill {
  locator: Locator;
  value: string;
  /** The page url the fill ran on: a refill is only ever asked on the same one. */
  url: string;
}

/** What part a step of this tool plays for the ledger. */
export type StandingFillRole = 'fill' | 'submit' | 'retire' | 'none';

const SUBMIT_TOOLS = new Set(['click', 'dblclick', 'press']);
/** Actions that may legitimately change other fields, or leave the page: they empty the ledger without asking it. */
const RETIRE_TOOLS = new Set(['right_click', 'modifier_click', 'select', 'check', 'drag', 'upload', 'goto', 'back', 'tabs']);

export function standingFillRole(tool: string): StandingFillRole {
  if (tool === 'fill') return 'fill';
  if (SUBMIT_TOOLS.has(tool)) return 'submit';
  if (RETIRE_TOOLS.has(tool)) return 'retire';
  return 'none';
}

/** How long one ledger entry may take to answer before it is left alone. */
export const STANDING_FILL_PROBE_MS = 1_000;

/** Note a fill that ran: its locator, its value, and the url it ran on. An empty fill is a clear — nothing to keep. */
export function noteFill(ledger: StandingFill[], locator: Locator, value: string, url: string): void {
  if (!value) return;
  const key = String(locator);
  const at = ledger.findIndex((f) => String(f.locator) === key);
  if (at >= 0) ledger.splice(at, 1);
  ledger.push({ locator, value, url });
}

/** The value a plain input or textarea holds now; null when the locator does not name exactly one, or it is not one. */
async function inputValueNow(locator: Locator): Promise<string | null> {
  try {
    if ((await locator.count()) !== 1) return null;
    return await locator.evaluate(
      (el) => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : null),
      undefined,
      { timeout: STANDING_FILL_PROBE_MS },
    );
  } catch {
    return null;
  }
}

/**
 * Ahead of a step of `tool`: for a submitting action, refill every input the
 * ledger holds on this url that is empty again; then, for a submitting or a
 * retiring action, empty the ledger. Returns one warning per step that
 * refilled anything (never the values), for the runner to report.
 */
export async function restoreStandingFills(page: Page, ledger: StandingFill[], tool: string, where: string): Promise<string[]> {
  const role = standingFillRole(tool);
  if (role !== 'submit' && role !== 'retire') return [];
  const standing = ledger.splice(0);
  if (role !== 'submit' || !standing.length) return [];
  const url = page.url();
  let refilled = 0;
  let failed = 0;
  for (const fill of standing) {
    if (fill.url !== url) continue;
    const now = await inputValueNow(fill.locator);
    if (now !== '') continue;
    try {
      await reactSafeFill(fill.locator, fill.value);
      if ((await inputValueNow(fill.locator)) === fill.value) refilled++;
      else failed++;
    } catch {
      failed++;
    }
  }
  if (!refilled && !failed) return [];
  const what = `${refilled + failed} field(s) this procedure filled were empty again before this ${tool} (the page rebuilt its form after the fills were checked)`;
  return [`${where}: ${what} — ${failed ? `${refilled} refilled, ${failed} could not be` : 'refilled once'}`];
}
