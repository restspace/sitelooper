import type { Locator, Page } from 'playwright-core';
import { reactSafeFill, settleDom } from './browser.js';

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
 * A REPLACED DOCUMENT (fwvk2 n2 01-open, the same login, still failing). The
 * reload is a new document at the SAME url, so the url alone cannot see it,
 * and a check made while the new document is still building its form found no
 * field (a locator naming nothing is "leave alone") and refilled nothing. So
 * each fill is noted with the identity of the document it ran in
 * (`performance.timeOrigin`). A fill whose document is gone was certainly
 * lost: the check waits (STANDING_FILL_ATTACH_MS, shared by the whole step)
 * for its field to be built again, then refills it if empty.
 *
 * And the reload can land AFTER the check — between the submit and the app's
 * answer to it, so the answer never arrives. The submit's own gates then stop
 * it on the page it started from. `standingFillsLost` says when that is this
 * failure and nothing else: the document the submit ran in was replaced, the
 * page is back on the url the fills ran on, and every field they filled is
 * there and EMPTY. Then — once per submit — the runner puts the fills back in
 * the ledger (`rearmStandingFills`) and runs the submit again, whose own check
 * refills them. A submit that went through leaves a page that fails at least
 * one of those three, and is never repeated.
 *
 * A VALUE DROPPED AT BLUR (fwec2 n1 03-create). A formatted-number widget
 * (the Amount box) keeps its own copy of the value, built from key events:
 * the native setter showed `textbox: 12500`, the fill's check passed, and the
 * widget rebuilt the field from its own, still-empty copy the moment focus
 * left it — the next fill wiped it, three times. Typed key by key it held
 * ("12,500.00"). So the submit check first takes focus off the field that
 * has it (what the submit does anyway, never on a field that drives a popup,
 * whose suggestions it would close), then refills an empty field natively,
 * blurs it, and when the value is gone again types it key by key instead.
 * A plain input keeps a native fill and is never typed into.
 *
 * A window after page load ("not settled until N ms without a same-url
 * reload") was considered and rejected: on the real app the service worker's
 * reload came anywhere from 2.5s to 7s after load, so no bound both catches it
 * and costs every other page nothing.
 *
 * Self-contained: sibling shared modules and Playwright types only.
 */

/** One fill this segment made, as the ledger remembers it. */
export interface StandingFill {
  locator: Locator;
  value: string;
  /** The page url the fill ran on: a refill is only ever asked on the same one. */
  url: string;
  /** The document it ran in (`performance.timeOrigin`); null when it could not be read. */
  doc: number | null;
}

/** The ledger: the fills standing now, and what the last submit took with it. */
export interface StandingFills {
  fills: StandingFill[];
  /** The fills the last submitting action consumed, with the document and url it went out from. */
  submitted?: { fills: StandingFill[]; doc: number | null; url: string };
}

export function standingFills(): StandingFills {
  return { fills: [] };
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
/** How long, in all, one step waits for the fields of a replaced document to be built again. */
export const STANDING_FILL_ATTACH_MS = 3_000;

/** The identity of the page's current document; null when it cannot be read (a navigation that will not settle). */
export async function documentOf(page: Page): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await page.evaluate(() => performance.timeOrigin);
    } catch {
      // the context went with a navigation: ask the document that replaced it
      await page.waitForLoadState('domcontentloaded', { timeout: STANDING_FILL_ATTACH_MS }).catch(() => {});
    }
  }
  return null;
}

/** Note a fill that ran: its locator, its value, and the url and document it ran in. An empty fill is a clear — nothing to keep. */
export async function noteFill(ledger: StandingFills, locator: Locator, value: string, page: Page): Promise<void> {
  if (!value) return;
  const key = String(locator);
  const at = ledger.fills.findIndex((f) => String(f.locator) === key);
  if (at >= 0) ledger.fills.splice(at, 1);
  ledger.fills.push({ locator, value, url: page.url(), doc: await documentOf(page) });
}

/** The value a plain input or textarea holds now; null when the locator does not name exactly one, or it is not one. */
async function inputValueNow(locator: Locator): Promise<string | null> {
  try {
    if ((await locator.count()) !== 1) return null;
    return await locator.evaluate(
      (el) => (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? (el as HTMLInputElement).value : null),
      undefined,
      { timeout: STANDING_FILL_PROBE_MS },
    );
  } catch {
    return null;
  }
}

/** inputValueNow, after waiting (to `deadline`) for the field to be attached — a replaced document builds its form anew. */
async function inputValueOnceBuilt(locator: Locator, deadline: number): Promise<string | null> {
  try {
    await locator.waitFor({ state: 'attached', timeout: Math.max(1, deadline - Date.now()) });
  } catch {
    return null;
  }
  return inputValueNow(locator);
}

/**
 * Take focus off the field if it has it — what the coming submit does anyway,
 * done first so a value the field drops at its blur is seen before the submit
 * sends it. Never a field that drives a popup (a combobox, an autocomplete, a
 * datalist, anything expanded): its blur closes the suggestions the submit may
 * be about to click. True when it blurred.
 */
async function blurIfPlain(locator: Locator): Promise<boolean> {
  try {
    if ((await locator.count()) !== 1) return false;
    const blurred = await locator.evaluate(
      (el) => {
        if (document.activeElement !== el) return false;
        const popup =
          el.getAttribute('role') === 'combobox' ||
          el.hasAttribute('aria-autocomplete') ||
          el.getAttribute('aria-expanded') === 'true' ||
          el.hasAttribute('list') ||
          el.closest('[role="combobox"]') !== null;
        if (popup) return false;
        (el as HTMLElement).blur();
        return true;
      },
      undefined,
      { timeout: STANDING_FILL_PROBE_MS },
    );
    if (blurred) await settleDom(locator.page());
    return blurred;
  } catch {
    return false;
  }
}

/** Clear the field and type the value key by key, as a person would: the one input a key-driven widget reads. */
async function typeInto(locator: Locator, value: string): Promise<void> {
  await locator.click({ timeout: STANDING_FILL_PROBE_MS * 5 });
  await locator.page().keyboard.press('ControlOrMeta+a');
  await locator.page().keyboard.press('Backspace');
  await locator.pressSequentially(value, { delay: 20 });
}

/**
 * Whether what the field holds is the value filled, as the page may format it:
 * the same text, or containing it (letters and digits only, case aside), or
 * the same number in the page's own formatting ("12500" shown "12,500.00").
 */
export function sameValue(held: string, filled: string): boolean {
  if (held === filled) return true;
  const alnum = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (alnum(filled) && alnum(held).includes(alnum(filled))) return true;
  const digits = (t: string) => t.replace(/\D+/g, '');
  const dh = digits(held);
  const df = digits(filled);
  return Boolean(df) && dh.startsWith(df) && /^0*$/.test(dh.slice(df.length));
}

const replaced = (fill: StandingFill, doc: number | null) => fill.doc !== null && doc !== null && fill.doc !== doc;

/**
 * Ahead of a step of `tool`: for a submitting action, refill every input the
 * ledger holds on this url that is empty again — waiting first for the fields
 * of a document that replaced the one the fill ran in — and remember what the
 * submit takes with it; then, for a submitting or a retiring action, empty
 * the ledger. Returns one warning per step that refilled anything (never the
 * values), for the runner to report.
 */
export async function restoreStandingFills(page: Page, ledger: StandingFills, tool: string, where: string): Promise<string[]> {
  const role = standingFillRole(tool);
  if (role !== 'submit' && role !== 'retire') return [];
  const standing = ledger.fills.splice(0);
  ledger.submitted = undefined;
  if (role !== 'submit' || !standing.length) return [];
  const url = page.url();
  const doc = await documentOf(page);
  const deadline = Date.now() + STANDING_FILL_ATTACH_MS;
  let refilled = 0;
  let failed = 0;
  let reloaded = false;
  let keyed = 0;
  // The submit is about to take focus off the field that has it; take it off
  // first, so a widget that rebuilds its value on blur (fwec2) has done so
  // before the fields are looked at.
  for (const fill of standing) if (fill.url === url) await blurIfPlain(fill.locator);
  for (const fill of standing) {
    if (fill.url !== url) continue;
    const gone = replaced(fill, doc);
    reloaded ||= gone;
    const now = gone ? await inputValueOnceBuilt(fill.locator, deadline) : await inputValueNow(fill.locator);
    if (now !== '') continue;
    try {
      await reactSafeFill(fill.locator, fill.value);
      await blurIfPlain(fill.locator);
      let held = await inputValueNow(fill.locator);
      // Set, and gone again at the blur: a widget that keeps its own copy of
      // the value, built from key events. Typed, as a person would.
      if (!held) {
        await typeInto(fill.locator, fill.value);
        await blurIfPlain(fill.locator);
        held = await inputValueNow(fill.locator);
        if (held) keyed++;
      }
      if (held !== null && sameValue(held, fill.value)) refilled++;
      else failed++;
    } catch {
      failed++;
    }
  }
  ledger.submitted = { fills: standing, doc: await documentOf(page), url: page.url() };
  if (!refilled && !failed) return [];
  const why = reloaded ? 'the page replaced its document after the fills ran' : 'the page rebuilt its form, or dropped the value when the field lost focus, after the fills were checked';
  const what = `${refilled + failed} field(s) this procedure filled were empty again before this ${tool} (${why})${keyed ? `; ${keyed} of them kept only a value typed key by key` : ''}`;
  return [`${where}: ${what} — ${failed ? `${refilled} refilled, ${failed} could not be` : 'refilled once'}`];
}

/**
 * After a submitting action whose step failed: was the submit lost to a
 * replaced document? True only when the document it went out from is gone,
 * the page is on the url the fills ran on, and every field they filled is
 * there again (waited for) and empty. The runner then rearms the ledger and
 * runs the step once more.
 */
export async function standingFillsLost(page: Page, ledger: StandingFills): Promise<boolean> {
  const sent = ledger.submitted;
  if (!sent?.fills.length || sent.doc === null) return false;
  if (page.url() !== sent.url) return false;
  const doc = await documentOf(page);
  if (doc === null || doc === sent.doc) return false;
  if (page.url() !== sent.url) return false;
  const deadline = Date.now() + STANDING_FILL_ATTACH_MS;
  for (const fill of sent.fills) {
    if (fill.url !== sent.url) return false;
    if ((await inputValueOnceBuilt(fill.locator, deadline)) !== '') return false;
  }
  return true;
}

/** Put the lost submit's fills back as standing, so the repeated step's own check refills them. Once: the record of the submit is consumed. */
export function rearmStandingFills(ledger: StandingFills): void {
  if (!ledger.submitted) return;
  ledger.fills = ledger.submitted.fills;
  ledger.submitted = undefined;
}
