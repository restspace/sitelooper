import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { actionFailure, NAVIGATING_ACTIONS, outcomeLabel, outcomeOfError, robustClick, type ActionOutcome } from '../execution/browser.js';
import { beginAction, type ActionExpectation, type ActionObservation, type LinkNavigation, type SettleVerdict } from '../execution/action.js';
import { CURRENT_DIALECT, addedLines, removedLines, type PageObservation } from '../execution/snapshot.js';
import { DIALOG_LINE } from '../execution/expect.js';
import { POPUP_WAIT_MS, type PageEffect } from '../execution/context.js';
import { isElementRead, readElements } from '../execution/observe.js';
import { textHolds } from '../execution/text.js';
export { fireWhenAttached, urlHeldStill } from '../execution/browser.js';
import { ACTION_DEADLINE_MS, type BrowserSession } from '../daemon/browser.js';
import { clip } from '../shared/text.js';
import { captureSignature, describeChange, type PageSignature } from '../daemon/diff.js';
import { html5DragDrop, selectedOption, syntheticHover } from '../daemon/inputs.js';
import { describeRecipeAttempt, fillWithRecipe, selectWithRecipe, typeWithRecipe } from '../execution/recipes.js';
import { ComponentStore, storeBook } from '../skills/components.js';
import { hasSecretMarker, markLiteralCredentialValue, mayHoldLiteralCredential, notePasswordFieldLine, resolveSecretsDeepAsync, scrubSecrets, scrubSecretsDeep } from '../shared/secrets.js';
import { isRefTarget, refHint, resolveTarget, snapshot, truncate } from '../daemon/refs.js';
import { controlFromTarget, siteModel } from '../skills/sitemap.js';
import { settleDom, settlePage } from '../daemon/settle.js';
import { fingerprintPage } from '../daemon/fingerprint.js';
import { isRecordable, type StepDiff } from '../daemon/recorder.js';
import { diffTotals, settleEvidence, stepFailure, type StepEvidence } from '../daemon/step-evidence.js';
import { splitForStep, windowKindOf, type StepJournal } from '../daemon/journal.js';
import { contractWeakening } from '../skills/contract.js';
import { urlPattern as compiledUrlPattern } from '../skills/compile.js';
import { renderReplay, replaySkill, type ReplayResult } from '../skills/replay.js';
import type { ToolDef } from './llm.js';

const TARGET = {
  type: 'string',
  description: 'Element target: an @ref from the latest snapshot (e.g. "@e12") or a CSS selector.',
} as const;

const TOOL_RESULT_BUDGET = 4000;

/**
 * Tools whose result gets a `[state: …]` summary of what the action changed on
 * the page, so the agent does not spend a turn observing what it just did.
 * goto/back already report the new url and title; read-only tools change
 * nothing worth diffing.
 */
const STATE_CHANGING = new Set([
  'click', 'dblclick', 'modifier_click', 'right_click', 'fill', 'type', 'press',
  'select', 'check', 'drag', 'upload',
]);

/**
 * Tools whose result already IS a new page, so it carries a fresh snapshot the
 * same way a substantial change does — the agent would otherwise spend its
 * next turn asking what it just navigated to.
 */
const NAVIGATED = new Set(['goto', 'back']);
/** Budget for a snapshot folded into an action result: enough to act from, not a whole page. */
const AUTO_SNAPSHOT_CHARS = 3_500;
/** The most lines kept of a removal that is a step's only evidence (it added nothing): enough to tell a toggle pair (collapseTogglePairs). */
const MAX_KEPT_REMOVALS = 60;
/** How long an action that has visibly done nothing gets to show its first effect. */
const REACTION_MS = 400;
/** Tools whose effect may be a navigation the app performs on the answer to a request (shared: src/execution/browser.ts). */
const NAVIGATING = new Set(NAVIGATING_ACTIONS);
/**
 * Inputs: the tools whose own save an app commonly debounces. Their action
 * observation gives a request the start grace from the dispatch itself — a
 * fill changes a value, not the DOM, so nothing else would announce the save
 * that starts 200ms later (src/execution/action.ts).
 */
const INPUT_TOOLS = new Set(['fill', 'type', 'press', 'select', 'check']);

const MAX_BATCH_STEPS = 10;

/**
 * Tools a batch may contain: mechanical actions and cheap checks whose outcome
 * the agent does not need to see before choosing the next step. Everything else
 * (navigation, snapshot/eval output, report, nested batch) either feeds a
 * decision or produces output that only makes sense on its own turn.
 *
 * screenshot IS allowed. It was not, and the model kept writing it anyway —
 * "fill the form, screenshot it, click save" is exactly what prompt rule 9a
 * asks for — so the whole batch was refused and re-issued: 15 refused batches
 * across five traced recordings (fwrdj13, fxoff1/2, fxon1/2), each a wasted
 * model turn. Its output is one short line and feeds no decision.
 */
const BATCHABLE = new Set([
  'click', 'dblclick', 'modifier_click', 'right_click', 'fill', 'type', 'press',
  'select', 'check', 'hover', 'scroll_into_view', 'wait_for', 'read', 'read_all',
  'upload', 'dialog_expect', 'screenshot',
]);

/** Per-step lines stay short so a long batch still reads at a glance. */
const BATCH_STEP_CHARS = 160;
const BATCH_STEP_ERROR_CHARS = 300;

/** A combined diff spans several actions, so it may list more churn than one action's. */
const BATCH_LINE_BUDGET = 20;

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'snapshot',
    description:
      'Accessibility snapshot of the current page with @ref handles for elements. Returns interactive/labelled elements only by default (what you need to pick something to act on); pass full:true for the complete tree including static text nodes. Call after navigation or DOM changes; refs from older snapshots go stale. For a specific value prefer read/read_all over a full tree.',
    parameters: {
      type: 'object',
      properties: {
        full: { type: 'boolean', description: 'Include non-interactive text nodes too (default false = interactive/labelled elements only).' },
        selector: { type: 'string', description: 'Scope the snapshot to this CSS selector.' },
      },
    },
  },
  {
    name: 'click',
    description: 'Click an element.',
    parameters: { type: 'object', required: ['target'], properties: { target: TARGET } },
  },
  {
    name: 'dblclick',
    description: 'Double-click an element.',
    parameters: { type: 'object', required: ['target'], properties: { target: TARGET } },
  },
  {
    name: 'modifier_click',
    description: 'Click while holding modifier keys (e.g. Shift/Control-click gestures).',
    parameters: {
      type: 'object',
      required: ['target', 'modifiers'],
      properties: {
        target: TARGET,
        modifiers: {
          type: 'array',
          items: { type: 'string', enum: ['Shift', 'Control', 'Alt', 'Meta'] },
        },
      },
    },
  },
  {
    name: 'right_click',
    description: 'Right-click (context menu) an element.',
    parameters: { type: 'object', required: ['target'], properties: { target: TARGET } },
  },
  {
    name: 'fill',
    description:
      'Set the full value of an input/textarea. React-safe: works on controlled components and number inputs (clears first). Use for text fields; use select for <select>. A {{env:NAME}} secret marker or a {{totp:NAME}} one-time-code marker in value is resolved at execution time — pass it through verbatim.',
    parameters: {
      type: 'object',
      required: ['target', 'value'],
      properties: { target: TARGET, value: { type: 'string' } },
    },
  },
  {
    name: 'type',
    description: 'Type text key-by-key into an element (triggers per-keystroke handlers, e.g. autocomplete). A {{env:NAME}} secret marker or a {{totp:NAME}} one-time-code marker in text is resolved at execution time — pass it through verbatim.',
    parameters: {
      type: 'object',
      required: ['target', 'text'],
      properties: {
        target: TARGET,
        text: { type: 'string' },
        delay_ms: { type: 'number', description: 'Delay between keystrokes (default 20).' },
      },
    },
  },
  {
    name: 'press',
    description: 'Press a key or chord (e.g. "Enter", "Escape", "Control+a") on an element or the page.',
    parameters: {
      type: 'object',
      required: ['key'],
      properties: { key: { type: 'string' }, target: { ...TARGET, description: TARGET.description + ' Optional; defaults to the focused element.' } },
    },
  },
  {
    name: 'select',
    description: 'Choose an option in a <select>, matching by visible label first, then by value.',
    parameters: {
      type: 'object',
      required: ['target', 'option'],
      properties: { target: TARGET, option: { type: 'string' } },
    },
  },
  {
    name: 'check',
    description: 'Set a checkbox/radio to checked or unchecked.',
    parameters: {
      type: 'object',
      required: ['target'],
      properties: { target: TARGET, checked: { type: 'boolean', description: 'Default true.' } },
    },
  },
  {
    name: 'hover',
    description: 'Hover an element (also dispatches synthetic mouseover/enter for JS-driven menus).',
    parameters: { type: 'object', required: ['target'], properties: { target: TARGET } },
  },
  {
    name: 'scroll_into_view',
    description: 'Scroll an element into view.',
    parameters: { type: 'object', required: ['target'], properties: { target: TARGET } },
  },
  {
    name: 'drag',
    description:
      'Drag one element onto another. Tries a real mouse drag, then falls back to synthetic HTML5 drag events (dragstart/dragover/drop with a DataTransfer).',
    parameters: {
      type: 'object',
      required: ['source', 'target'],
      properties: {
        source: { ...TARGET, description: 'Element to drag. ' + TARGET.description },
        target: { ...TARGET, description: 'Drop target. ' + TARGET.description },
      },
    },
  },
  {
    name: 'wait_for',
    description:
      'Wait for a condition on a selector: visible, hidden, text_equals, text_contains, or count. Use this instead of sleeping or polling. Returns immediately if the condition already holds. Use count/text only for a value you expect to CHANGE — counting rendered rows is unreliable on virtualised lists (only visible rows exist in the DOM), so wait on a stable indicator instead.',
    parameters: {
      type: 'object',
      required: ['target', 'state'],
      properties: {
        target: TARGET,
        state: { type: 'string', enum: ['visible', 'hidden', 'text_equals', 'text_contains', 'count'] },
        text: { type: 'string', description: 'Expected text for text_equals/text_contains.' },
        count: { type: 'number', description: 'Expected element count for count.' },
        timeout_ms: { type: 'number', description: 'Default 10000.' },
      },
    },
  },
  {
    name: 'read',
    description:
      'Read text/value/attribute from ONE element — much cheaper than a full snapshot for spot checks. ' +
      'The target must match exactly one element, or the read fails: a snapshot ref (@e123) always does, ' +
      'and a bare tag like "h1" usually does not. Use read_all to read every match, or what=count to count them. ' +
      'If the value matters beyond this glance — a reference, id, name, or total the task or a later step will use — ' +
      'pass `label` NOW: a labelled value is published under that name automatically; an unlabelled one stays anonymous. ' +
      'what=url reads the current page URL (no target) — the way to report where a record lives.',
    parameters: {
      type: 'object',
      required: ['what'],
      properties: {
        target: TARGET,
        what: { type: 'string', enum: ['text', 'value', 'attr', 'count', 'url'] },
        attr: { type: 'string', description: 'Attribute name when what=attr.' },
        label: {
          type: 'string',
          description:
            'Name for this value, the way a person would say it: order_reference, unit_price, customer_name. Later steps address the value by this name.',
        },
      },
    },
  },
  {
    name: 'read_all',
    description:
      'Like read, but returns a JSON array of the value across EVERY element matching the selector — read a whole list of rows/cells in one call instead of many. what: text (visible text of each), value (input value of each), attr (an attribute of each), or count.',
    parameters: {
      type: 'object',
      required: ['target', 'what'],
      properties: {
        target: TARGET,
        what: { type: 'string', enum: ['text', 'value', 'attr', 'count'] },
        attr: { type: 'string', description: 'Attribute name when what=attr.' },
      },
    },
  },
  {
    name: 'eval',
    description:
      'Escape hatch: run a read-only JavaScript expression in the page and return its JSON-serialised result. Prefer the dedicated tools. Nothing an eval does or returns is replayed: never act through it or give elements ids, and never report or navigate by a value only an eval returned: read it with read/read_all, or click its link.',
    parameters: {
      type: 'object',
      required: ['expression'],
      properties: { expression: { type: 'string', description: 'JS expression or IIFE body, e.g. "document.title".' } },
    },
  },
  {
    name: 'fetch_source',
    description:
      "Fetch the raw HTTP response body for a URL (default: the current page's URL) using the browser's cookies, WITHOUT executing JavaScript. This is the SERVER-RENDERED source — every other tool shows the live post-hydration DOM instead. Use it before making any claim about what the server sent, and to tell an SSR bug (element missing from the source) apart from a hydration bug (present in the source, absent live).",
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute or page-relative URL; defaults to the current page URL.' },
        contains: {
          type: 'string',
          description:
            'Return only the lines containing this substring (plus a match count) instead of the whole body — use it on large documents to check for a specific element.',
        },
      },
    },
  },
  {
    name: 'goto',
    description: 'Navigate the current tab to a URL and wait for load.',
    parameters: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
  },
  {
    name: 'back',
    description: 'Go back one history entry.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'tabs',
    description: 'List open tabs, or switch the active tab by index.',
    parameters: {
      type: 'object',
      properties: { switch_to: { type: 'number', description: 'Tab index to make active; omit to just list.' } },
    },
  },
  {
    name: 'upload',
    description: 'Set files on a file input.',
    parameters: {
      type: 'object',
      required: ['target', 'paths'],
      properties: { target: TARGET, paths: { type: 'array', items: { type: 'string' }, description: 'Absolute file paths.' } },
    },
  },
  {
    name: 'download',
    description: 'Click an element and capture the download it triggers; saves to the session downloads dir (or save_path).',
    parameters: {
      type: 'object',
      required: ['target'],
      properties: { target: TARGET, save_path: { type: 'string' } },
    },
  },
  {
    name: 'set_viewport',
    description: 'Resize the viewport.',
    parameters: {
      type: 'object',
      required: ['width', 'height'],
      properties: { width: { type: 'number' }, height: { type: 'number' } },
    },
  },
  {
    name: 'set_offline',
    description: 'Toggle network offline mode.',
    parameters: { type: 'object', required: ['offline'], properties: { offline: { type: 'boolean' } } },
  },
  {
    name: 'screenshot',
    description: 'Save a screenshot to disk and return its path (for evidence; you cannot see images).',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, full_page: { type: 'boolean' } },
    },
  },
  {
    name: 'dialog_expect',
    description:
      'Arm handling for native dialogs (alert/confirm/prompt) triggered by your NEXT action: accept or dismiss, with optional prompt text. Call BEFORE the click that opens the dialog. Captured dialog messages are returned in that action\'s result.',
    parameters: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['accept', 'dismiss'] },
        prompt_text: { type: 'string', description: 'Text to enter if the dialog is a prompt().' },
        count: { type: 'number', description: 'How many dialogs to cover (default 1).' },
      },
    },
  },
  {
    name: 'batch',
    description:
      'Execute several actions in ONE call when you already know each next step with certainty (e.g. filling a form you have just seen, then submitting it). Steps run in order and stop at the first error; the result lists each step\'s outcome, which steps did not run, and ONE combined [state: …] summary. Do not batch across a judgment point — anything whose outcome you must see before deciding the next action.',
    parameters: {
      type: 'object',
      required: ['steps'],
      properties: {
        steps: {
          type: 'array',
          minItems: 2,
          description: `Ordered steps, 2-${MAX_BATCH_STEPS}. A single-step batch is pointless — call the tool directly instead.`,
          items: {
            type: 'object',
            required: ['tool', 'args'],
            properties: {
              tool: { type: 'string', enum: [...BATCHABLE] },
              args: { type: 'object', description: "That tool's own arguments." },
            },
          },
        },
      },
    },
  },
  {
    name: 'run_skill',
    description:
      'Replay a stored procedure listed under [skills] in the instruction, deterministically and without further reasoning: every recorded step runs in order with its parameters filled in, stopping at the first step that no longer works. Returns each step\'s outcome and every value read back from the live page. If it stops part-way, the steps that ran HAVE changed the page — observe, then continue from there yourself. Call it as your FIRST action when a listed procedure matches the instruction.',
    parameters: {
      type: 'object',
      required: ['id', 'params'],
      properties: {
        id: { type: 'string', description: 'The skill id shown in the [skills] list, e.g. "s_9f2a1b".' },
        params: {
          type: 'object',
          description: 'Values for every {{vN}} slot in the skill template, taken from the instruction (e.g. {"v1": "x7 RD Part A", "v2": "100"}).',
        },
      },
    },
  },
  {
    name: 'report',
    description:
      'REQUIRED final call: report the outcome of the instruction. Nothing after this is executed. Keep summary to one short paragraph.',
    parameters: {
      type: 'object',
      required: ['status', 'summary'],
      properties: {
        status: { type: 'string', enum: ['success', 'failure', 'blocked'] },
        summary: { type: 'string', description: 'One concise paragraph: what happened and what was verified.' },
        details: { type: 'string', description: 'Optional extra detail (errors seen, workaround used).' },
        evidence: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            capturedDialogs: { type: 'array', items: { type: 'string' } },
            values: {
              type: 'object',
              description:
                'Every concrete value you read off the page, as name -> value. ' +
                'ALWAYS include any reference the APP assigned to a record you created or opened ' +
                '(an order number, ticket ref, uid, generated id) — later work addresses that record by it, ' +
                'and a value left only in the summary prose cannot be used. Names should be ones a person would ' +
                'write (order_reference, unit_price), not selector fragments.',
            },
          },
        },
      },
    },
  },
];

export interface ToolExecution {
  result: string;
  isError: boolean;
  /**
   * For `batch`: what each step cost, plus the closing page diff. A batch is up
   * to ten actions behind one number, and fwrdj3/fwrdj4 each had three batches
   * of almost exactly 13s whose turn row could not say which step stalled.
   */
  stepMs?: Array<{ tool: string; ms: number; ok: boolean }>;
  /** Present for run_skill: what the replay did, for the loop's accounting. */
  replay?: ReplayResult;
  /**
   * This result carries a `[page: …]` snapshot, so it IS the current view and
   * every earlier snapshot's @refs are now stale. The loop elides the older
   * ones and keeps this result, exactly as it does after an explicit snapshot.
   */
  snapshotIncluded?: boolean;
  /**
   * What is known about a state-changing action: from its observation when it
   * ran (src/execution/action.ts), from the error it threw when it did not.
   * A failed action's result also ends with `outcomeLabel`.
   */
  outcome?: ActionOutcome;
}

/** Tool definitions for a session: run_skill only exists when a skill store is attached. */
export function toolDefsFor(session: BrowserSession): ToolDef[] {
  return session.learn ? TOOL_DEFS : TOOL_DEFS.filter((t) => t.name !== 'run_skill');
}

/**
 * Execute one tool call against the live browser session. Always returns a
 * string result (errors included) so the loop can hand it back to the model.
 * Captured native dialogs are appended to whichever tool result follows them.
 */
export async function executeTool(
  session: BrowserSession,
  name: string,
  args: Record<string, unknown>,
  screenshotDir: string,
  /** Cancels cooperative waits (wait_for polling) when the caller's deadline expires. */
  signal?: AbortSignal,
  /** `deadlineMs`: the whole-action deadline of a state-changing tool (ACTION_DEADLINE_MS). */
  options: { deadlineMs?: number } = {},
): Promise<ToolExecution> {
  // The whole tool call is the daemon's window (journal.ts); the action inside
  // it opens its own, narrower one at dispatch (runStep).
  const toolWindow = session.journal?.open('daemon', `tool:${name}`);
  try {
    // Inside the guard: a dead browser (getPage throwing) must come back as
    // an error result the loop can report, never a rejection that ends the
    // instruction with no report and a dangling user message.
    if (name === 'batch') return await executeBatch(session, args, screenshotDir, signal);
    if (name === 'run_skill') return await executeSkill(session, args, screenshotDir, signal);
    const diffing = STATE_CHANGING.has(name) ? await session.getPage().catch(() => null) : null;
    const before: PageSignature | null = diffing ? await captureSignature(diffing) : null;
    const { result, outcome, settled } = await runStep(session, name, args, screenshotDir, signal, { before, deadlineMs: options.deadlineMs });
    const observed = diffing && before ? await stateDiff(diffing, before, undefined, Boolean(settled)) : EMPTY_OBSERVATION;
    // goto/back report a url and a title, which is the one thing the agent
    // already knew; what it needs is what is ON the page it asked for.
    const landed = NAVIGATED.has(name) ? await landingSnapshot(session) : '';
    // Site model: this action's own before-signature is a free observation of
    // the page, and a url change past it is an edge in the app's graph. Both
    // are best-effort — controlFromTarget yields null for a CSS selector,
    // whose accessible name cannot be known, and the edge is then skipped.
    if (diffing && before) {
      const site = siteModel();
      site.observe(before.url, before);
      const after = diffing.url();
      if (after !== before.url) {
        const target = String(args.target ?? '');
        site.transition(before.url, controlFromTarget(target, refHint(diffing, target)), after);
      }
    }
    return {
      result: truncate(withEmptyReadHint(name, args, result) + scrubSecrets(observed.note) + landed + dialogNote(session), TOOL_RESULT_BUDGET + 8200),
      isError: false,
      snapshotIncluded: observed.snapshotIncluded || Boolean(landed),
      ...(outcome ? { outcome } : {}),
    };
  } catch (err) {
    // A failed state-changing action says what is known about it, so the model
    // (and a caller) can tell "nothing happened, try again" from "it may have
    // happened, look first" without reading the wording.
    if (STATE_CHANGING.has(name)) {
      const outcome = outcomeOfError(err);
      return { result: truncate(`ERROR: ${explainError(err, args)} ${outcomeLabel(outcome)}`, TOOL_RESULT_BUDGET), isError: true, outcome };
    }
    return { result: truncate(`ERROR: ${explainError(err, args)}`, TOOL_RESULT_BUDGET), isError: true };
  } finally {
    if (toolWindow) session.journal?.close(toolWindow);
  }
}

/**
 * The model's copy of an empty read_all, with what to do next. A bare `[]` is
 * where the recording model most often reached for eval: 237 of 1,707 reads in
 * the rounds 36-60 recordings returned nothing, and in 60 of them the next
 * step was an eval (gitea fwgt10 read `.issue-title`, got `[]` twice, and took
 * the seed titles by an eval no compiled read reproduces). A class name is a
 * guess; a snapshot, a role or a text is what the page offers. Model-facing
 * only: the recorder has already filed `[]`, which is the value compile, the
 * read-back cascade and readsThisInstruction parse.
 */
export function withEmptyReadHint(name: string, args: Record<string, unknown>, result: string): string {
  if (name !== 'read_all' || args.what === 'count' || result !== '[]') return result;
  return (
    `[] — 0 elements match ${JSON.stringify(String(args.target ?? ''))}. A class name is a guess: take a snapshot (full:true shows static text) and target what it shows, ` +
    `or target by role or text (role=link[name=/…/], a:has-text("…")). Do not switch to eval for it: an eval's result is never replayed.`
  );
}

/**
 * Replay a stored skill as one tool call. The replay goes through runStep
 * for every step, so each replayed action is recorded exactly like an
 * agent-chosen one — which is what lets a replay-then-repair be compiled into
 * a variant afterwards. A refusal (wrong page, missing params) is an error
 * result; a part-way stop is not, since the page has changed.
 */
async function executeSkill(
  session: BrowserSession,
  args: Record<string, unknown>,
  screenshotDir: string,
  signal?: AbortSignal,
): Promise<ToolExecution> {
  const store = session.learn;
  if (!store) return { result: 'ERROR: no skill store is attached to this session.', isError: true };
  const id = String(args.id ?? '').trim();
  const skill = id ? store.get(id) : null;
  if (!skill) return { result: `ERROR: unknown skill ${JSON.stringify(id)} — use an id from the [skills] list.`, isError: true };
  const rawParams = args.params && typeof args.params === 'object' && !Array.isArray(args.params) ? (args.params as Record<string, unknown>) : {};
  const params = Object.fromEntries(Object.entries(rawParams).map(([k, v]) => [k, String(v ?? '')]));

  const page = await session.getPage();
  const before = await captureSignature(page);
  // The replay stays on its page: a replayed click that opens a tab (a
  // recorded stray click on a target=_blank link) must not move it. Only a
  // step RECORDED opening a popup, closing its page or switching tabs moves
  // the pin, and the session is left on the page the procedure ended on.
  const replay = await session.withPinnedPage(page, () =>
    replaySkill(skill, params, {
      page,
      signal,
      // The chain from this segment on: a slot a LATER segment types refuses
      // here, before anything runs (slotActs).
      chain: skill.seq
        ? store
            .list(skill.origin)
            .filter((s) => s.seq?.chain === skill.seq!.chain && (s.seq?.index ?? 0) >= skill.seq!.index)
            .sort((a, b) => (a.seq?.index ?? 0) - (b.seq?.index ?? 0))
        : [skill],
      follow: (next) => session.repin(next),
      exec: async (tool, stepArgs, resolved, via, action) => runStep(session, tool, stepArgs, screenshotDir, signal, { resolved, via, expect: action?.expect }),
    }),
  );
  // Mechanism 2 (PLAN-replay-v2): a url segment that soft-matched and was
  // then walked PAST has demonstrated volatility — generalise exactly that
  // segment in the stored pattern, permanently. Segments that never vary stay
  // exact. A soft match the replay did NOT get past stays unconfirmed.
  const confirmed = replay.generalisations.filter((g) =>
    g.kind === 'precondition' ? replay.stepsRun >= 1 : replay.ok || (g.step !== undefined && replay.stepsRun > g.step),
  );
  if (confirmed.length) {
    // A transaction: the pattern is re-read here, so two replays confirming
    // different segments of the same url cannot each widen from the same
    // starting point and have one of the two widenings vanish.
    store.update(skill.id, (fresh) => {
      const was = structuredClone(fresh);
      let changed = false;
      for (const g of confirmed) {
        if (g.kind === 'precondition') {
          fresh.preconditions.urlPattern = g.pattern;
          changed = true;
        } else if (g.step !== undefined) {
          const st = fresh.steps[g.step - 1];
          if (st && st.tool !== 'loop' && st.expect?.urlPattern) {
            st.expect.urlPattern = g.pattern;
            changed = true;
          }
        }
      }
      if (!changed) return null;
      // Generalising a url segment that demonstrated volatility is a real
      // improvement, and it is also, precisely, a promise made weaker: the
      // procedure will now start on pages it would previously have refused.
      // Invariant 7 does not forbid that — it forbids doing it quietly. So
      // the widening is recorded, and the validation it was carrying is given
      // up, because two clean runs under the narrower promise are not
      // evidence for the wider one.
      const gave = contractWeakening(was, fresh);
      if (gave.length) {
        fresh.provenance = {
          ...fresh.provenance,
          contractChanges: [...(fresh.provenance.contractChanges ?? []), { at: new Date().toISOString(), by: 'replay generalisation', gave }],
        };
        delete fresh.stats.verifiedContract;
      }
      return fresh;
    });
  }
  const observed = before && replay.stepsRun ? await stateDiff(page, before, BATCH_LINE_BUDGET) : EMPTY_OBSERVATION;
  const body = scrubSecrets(renderReplay(skill, replay)) + scrubSecrets(observed.note) + dialogNote(session);
  return {
    result: truncate(body, TOOL_RESULT_BUDGET + 8200),
    isError: Boolean(replay.refused),
    replay,
    snapshotIncluded: observed.snapshotIncluded,
  };
}

/**
 * A fill/type whose value is, or carries, the value of a credential-named
 * environment variable, with that value rewritten to `{{env:NAME}}` — an
 * AMBIGUOUS value (a non-credential variable holds it too) only when the
 * field is a password field. Replay's args are markers already, and are not
 * asked (the caller passes `resolved`).
 */
async function markCredentialArgs(session: BrowserSession, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = name === 'fill' ? 'value' : name === 'type' ? 'text' : null;
  const value = key ? args[key] : undefined;
  if (!key || typeof value !== 'string' || !mayHoldLiteralCredential(value)) return args;
  const passwordField = typeof args.target === 'string' ? await isPasswordField(session, args.target) : false;
  const marked = markLiteralCredentialValue(value, passwordField);
  return marked.value === value ? args : { ...args, [key]: marked.value };
}

/** An input the page says holds a password: type=password, or autocomplete current-/new-password. */
async function isPasswordField(session: BrowserSession, target: string): Promise<boolean> {
  try {
    const page = await session.getPage();
    return await isPasswordInput(resolveTarget(page, target));
  } catch {
    return false;
  }
}

/** isPasswordField over a locator the caller already holds. */
async function isPasswordInput(locator: Locator): Promise<boolean> {
  try {
    return await locator
      .first()
      .evaluate(
        (el) => {
          if (!(el instanceof HTMLInputElement)) return false;
          const ac = (el.getAttribute('autocomplete') ?? '').toLowerCase();
          return el.type === 'password' || ac.includes('current-password') || ac.includes('new-password');
        },
        undefined,
        { timeout: 1_000 },
      );
  } catch {
    return false;
  }
}

interface StepOptions {
  /** Signature captured by the caller before the action, to avoid a second capture. */
  before?: PageSignature | null;
  /** Replay: locators already resolved through a skill's chain. */
  resolved?: Record<string, Locator>;
  via?: { skill: string; step: number };
  /** Replay: the step's expected effect, which the action's observation polls for (effect-verified). */
  expect?: ActionExpectation;
  /** The whole-action deadline (ACTION_DEADLINE_MS). */
  deadlineMs?: number;
}

/**
 * One tool call with its recording, and nothing else: no dialog drain. Shared
 * by the single-tool path, by every step of a batch, and by skill replay.
 * In learning mode a per-step page diff is captured around state-changing
 * steps and navigations and stored with the recording — that is what becomes a replayed
 * step's expectation.
 */
async function runStep(
  session: BrowserSession,
  name: string,
  args: Record<string, unknown>,
  screenshotDir: string,
  signal?: AbortSignal,
  opts: StepOptions = {},
): Promise<StepRun> {
  // A credential the caller or the model wrote as ITSELF becomes its marker
  // before the recorder captures the args (FIX AH, shared/secrets.ts):
  // fwod79's model filled "admin" into the password field in the clear.
  if (!opts.resolved) args = await markCredentialArgs(session, name, args);
  // Describe the targets BEFORE acting: a click can navigate or unmount the
  // element, and a recorder that runs afterwards has nothing left to describe.
  // Recording never fails a run — a broken capture just means a missing step.
  const recorder = session.script;
  const page = recorder || session.learn ? await session.getPage() : null;
  const pending =
    recorder && page && isRecordable(name)
      ? await recorder.prepare(page, name, args, opts.resolved).catch(() => null)
      : null;
  // A navigation is diffed as well: every change of page is a seam, and the
  // landing — url, fingerprint, the text that appeared — is what compile gates
  // the next segment on. It gets no action observation (below): a goto
  // awaits its own navigation.
  const wantDiff = Boolean(session.learn) && page && (STATE_CHANGING.has(name) || NAVIGATED.has(name));
  const before = wantDiff ? (opts.before ?? (await captureSignature(page!))) : null;
  // Which page this step runs on, and whether it opens another: the pages
  // open before it, and a popup listener attached BEFORE the action
  // dispatches (a target=_blank click can raise its popup while the click is
  // still returning). Recorded only when a recorder is there to keep it.
  const pagesBefore = pending && page ? await session.listPages().catch(() => [] as Page[]) : [];
  let opened: Page | null = null;
  const onPopup = (p: Page) => {
    opened ??= p;
  };
  // Every page the CONTEXT gains while this step runs, opener or not: a tab
  // whose `popup` event lands after the capture, or that never names its
  // opener, is still a page this step's action opened when it is the only
  // one (pageContextOf; ghost fwgh6-n1 step 63).
  const appeared: Page[] = [];
  const onPage = (p: Page) => {
    appeared.push(p);
  };
  const watchPopup = Boolean(pending && page && POPUP_TOOLS.has(name) && typeof page.on === 'function');
  const pageContext = watchPopup && typeof page!.context === 'function' ? page!.context() : null;
  if (watchPopup) page!.on('popup', onPopup);
  pageContext?.on('page', onPage);
  // One observation per state-changing action, begun BEFORE it dispatches
  // (src/execution/action.ts): the whole-action deadline the click tiers are
  // cut to, the traffic baseline, and the expected effect when replay has one.
  // Every caller gets it, not only learning mode — the settle it ends with is
  // what the agent's state diff is taken after, too.
  const actionPage = STATE_CHANGING.has(name) ? (page ?? (await session.getPage().catch(() => null))) : null;
  let obs: ActionObservation | null = null;
  // When the action went out, and whether the recorder took it: a step that
  // throws before commit is recorded as FAILED (stage 0 evidence, never a gesture).
  let dispatchAt: number | undefined;
  let committed = false;
  const journal = pending ? session.journal : null;
  let jw = 0;
  try {
    // Secrets ({{env:NAME}}) resolve HERE and only here — after the recorder
    // captured the marker-bearing args above, immediately before the browser
    // needs the real value. Everything persisted or shown to the model keeps
    // the marker; scrubbing below catches values the page echoes back.
    // {{totp:NAME}} too: the code current NOW, generated before the action's
    // observation begins, so a wait out of a window's last seconds is never
    // charged to the action's deadline.
    const live = await resolveSecretsDeepAsync(args);
    obs = actionPage
      ? beginAction(actionPage, {
          deadlineMs: opts.deadlineMs ?? ACTION_DEADLINE_MS,
          navigating: NAVIGATING.has(name),
          graceFromDispatch: INPUT_TOOLS.has(name),
          expect: opts.expect,
        })
      : null;
    // Where a click is aimed, for the in-page hit record (bounded, 100 ms).
    if (journal && CLICK_TOOLS_AIMED.has(name) && page) await journal.intend(opts.resolved?.target ?? (typeof args.target === 'string' ? resolveTarget(page, args.target) : null));
    dispatchAt = Date.now();
    // The journal's window for this action (daemon/journal.ts, SHADOW MODE):
    // dispatch to settle. A value it types is noted, marker-bearing args only,
    // so a request that carries it can say so; a credential is never noted.
    if (journal) {
      jw = journal.open(windowKindOf(name), name, INPUT_TOOLS.has(name));
      journal.noteTyped(jw, name === 'fill' ? args.value : name === 'type' ? args.text : name === 'select' ? args.option : undefined);
    }
    let result = scrubSecrets(await dispatch(session, name, live, screenshotDir, signal, opts.resolved, obs));
    // A secret typed into a PASSWORD field: that field's own line is where an
    // ambiguous secret (a value some non-credential variable holds too) may be
    // scrubbed, and nowhere else (secrets.ts notePasswordFieldLine; fwkb39's
    // "KB Dashboard for admin" heading). Before the diff below is captured.
    if ((name === 'fill' || name === 'type') && hasSecretMarker(String(name === 'fill' ? (args.value ?? '') : (args.text ?? ''))) && page) {
      const field = opts.resolved?.target ?? (typeof args.target === 'string' ? resolveTarget(page, args.target) : null);
      if (field && (await isPasswordInput(field))) {
        const line = await field.first().ariaSnapshot({ timeout: 1_000 }).catch(() => '');
        notePasswordFieldLine(line.split('\n')[0].replace(/^\s*-\s*/, ''));
      }
    }
    // The action's evidence: the DOM quiet, the requests it started landed, a
    // debounced request given its moment, the url held still after a tool that
    // may navigate, the expected effect polled for.
    // A click that starts a request and routes on its answer looks finished
    // while the request is in flight: the DOM is quiet and the url is still
    // the old one. fwat2's sign-in was recorded that way — expected url "/"
    // and an added "Logging in..." button — and the replay, which arrived at
    // the landing page, could match neither. The same in the other direction:
    // a click whose url changed once and then again (Odoo autosaves the
    // record, then opens the catalogue) was captured between the two, and the
    // compiler cut a segment boundary at a page the procedure was only passing
    // through. Both are the observation's url wait now (urlHeldStill inside it).
    const verdict: SettleVerdict | null = obs ? await obs.settle() : null;
    const settledAt = Date.now();
    if (journal && jw) journal.close(jw);
    // What the recorder knew and used to drop (daemon/step-evidence.ts): the
    // uncapped diff counts, and the removals the diff itself keeps only for a
    // dialog or an add-less step. Never read by compile, export or replay.
    let totals: StepEvidence['totals'];
    let removedAll: string[] | undefined;
    let capturedAt: number | undefined;
    // A link whose navigation had still not committed when the settle ran out
    // (action.ts LINK_NAV_WAIT_MS) is said to the model, because the page it
    // sees next is the old one. fwop2-n1's agent found the url unmoved, clicked
    // the link again — which restarts a Turbo visit — and ended on a goto.
    if (verdict?.link && verdict.url === verdict.link.from) {
      result += `
note: this link points to ${verdict.link.href}, and its navigation had not committed when the action settled (the server is still answering). Observe the page again before acting; do not click the link again.`;
    }
    let diff: StepDiff | undefined;
    let observations: StepRun['observations'];
    // The page signature is a race against CAPTURE_TIMEOUT, and it loses on a
    // page that is still tearing down a navigation. When it loses there is no
    // evidence either way about what the action did — which is a different
    // thing from evidence that it did nothing, and the two used to arrive at
    // the effect gates as the same `diff === undefined`.
    let captureFailed = false;
    let fingerprintAfter: number[] | undefined;
    if (wantDiff && !before) captureFailed = true;
    if (wantDiff && before) {
      const after = verdict ? await captureSignature(page!) : await settledSignature(page!);
      capturedAt = Date.now();
      if (after) {
        totals = diffTotals(before.lines, after.lines);
        // Recorded in CURRENT_DIALECT (the signature's lines), and tagged so:
        // compile carries the tag onto the step's expectation, and every runner
        // renders the live page in the dialect the expectation was written in.
        // Removals are kept when a dialog went — the disappearance a later run
        // acts on (a dismissal whose dialog is not there is already in effect)
        // — and when nothing was added, where the removal is the step's only
        // evidence. Every other removal would be store weight nothing reads.
        const removed = removedLines(before.lines, after.lines) ?? [];
        const added = addedLines(before.lines, after.lines) ?? [];
        removedAll = scrubSecretsDeep(removed);
        diff = scrubSecretsDeep({
          url: after.url,
          alerts: after.alerts.filter((a) => !before.alerts.includes(a)),
          added,
          // ...and whenever it added nothing: a disclosure that collapsed has
          // only a disappearance to show (fwsi1 05-change), which compile
          // needs to tell a toggle pair from two clicks (collapseTogglePairs).
          ...(removed.some((l) => DIALOG_LINE.test(l)) ? { removed } : !added.length ? { removed: removed.slice(0, MAX_KEPT_REMOVALS) } : {}),
          dialect: CURRENT_DIALECT,
        });
        // The observations themselves, in memory only (never recorded): a replay
        // of a step recorded in an older dialect re-renders them in that dialect
        // rather than judging its stored lines against these. Scrubbed as the
        // diff is, so nothing rendered from them carries a resolved secret.
        if (before.observation && after.observation) {
          observations = scrubSecretsDeep({ before: before.observation, after: after.observation });
        }
        // The step crossed a page-template seam (its url pattern changed):
        // fingerprint the new page so compile can split a skill here and gate
        // the next segment on the page it actually runs on.
        if (compiledUrlPattern(after.url, undefined, { query: false }) !== compiledUrlPattern(before.url, undefined, { query: false })) {
          fingerprintAfter = (await fingerprintPage(page!)) ?? undefined;
        }
      } else {
        captureFailed = true;
      }
    }
    // A click that visibly did nothing on its own page (no line added or
    // removed, the url unmoved) is the one whose effect may be a tab still
    // opening: only that step pays pageContextOf's grace wait.
    const quiet = Boolean(diff && before && !diff.added.length && !(diff.removed ?? []).length && diff.url === before.url);
    const context = pending && page ? await pageContextOf(session, page, name, args, pagesBefore, opened, { appeared, quiet }) : {};
    // A step that closed its own page left nothing to capture, and that is an
    // observation, not a failed one: the close is what it did.
    if (context.effect?.kind === 'close' && captureFailed) captureFailed = false;
    if (context.effect && context.effect.kind !== 'navigate' && context.afterPage) {
      fingerprintAfter = (await fingerprintPage(context.afterPage)) ?? undefined;
    }
    const evidence: StepEvidence | undefined = pending
      ? {
          at: { d: dispatchAt ?? settledAt, s: settledAt, ...(capturedAt !== undefined ? { c: capturedAt } : {}) },
          ...(verdict ? { settle: settleEvidence(verdict) } : {}),
          ...(captureFailed ? { captureFailed: true as const } : {}),
          ...(totals ? { totals } : {}),
          ...(removedAll?.length && !diff?.removed ? { removed: removedAll } : {}),
        }
      : undefined;
    // Everything the journal saw since the last recorded step, attributed: this
    // window's share on the step, the rest in its gap. Never shown to the model.
    const journaled: StepJournal | undefined = journal && jw && pending ? splitForStep(jw, await journal.collect(page)) : undefined;
    committed = true;
    recorder?.commit(pending, result, {
      diff,
      ...(journaled ? { journal: journaled } : {}),
      ...(evidence ? { obs: evidence } : {}),
      via: opts.via,
      fingerprintAfter,
      ...(context.page !== undefined ? { page: context.page } : {}),
      ...(context.effect ? { effect: context.effect, afterUrl: context.afterPage?.url() } : {}),
    });
    return {
      result,
      diff,
      ...(observations ? { observations } : {}),
      ...(captureFailed ? { captureFailed: true as const } : {}),
      ...(verdict ? { outcome: verdict.outcome, settled: true as const } : {}),
      ...(verdict?.link ? { link: verdict.link } : {}),
    };
  } catch (err) {
    // A failed action is evidence, not a gesture: on disk as `failed: true`,
    // out of every read of the take (ScriptRecorder.fail).
    if (journal && jw) journal.close(jw);
    if (!committed && pending && recorder) {
      const journaled = journal && jw ? splitForStep(jw, await journal.collect(page).catch(() => [])) : undefined;
      recorder.fail(pending, stepFailure(err), { at: { d: dispatchAt ?? Date.now() } }, journaled);
    }
    throw err;
  } finally {
    obs?.cancel();
    if (watchPopup) page!.off('popup', onPopup);
    pageContext?.off('page', onPage);
  }
}

/** Clicks whose target the journal marks before dispatch (Journal.intend). */
const CLICK_TOOLS_AIMED = new Set(['click', 'dblclick', 'modifier_click', 'right_click']);

/** Tools whose action can open a popup. */
const POPUP_TOOLS = new Set(['click', 'dblclick', 'modifier_click', 'press', 'select', 'check']);

/**
 * How long a page that was itself opened by another gets to close after a
 * step (window.close() on the answer to the request its button sent). Paid
 * only on such pages, and only while recording.
 */
const CLOSE_GRACE_MS = 500;

/**
 * How long a step that visibly did nothing on its own page waits for a tab
 * it may still be opening. ghost fwgh6-n1 step 63 clicked the post-published
 * card linking to the public post: the tab opened after the step's capture,
 * so the recording credited no popup, the next steps ran on page 1, and every
 * replay stopped at "recorded on page 1 … the procedure is on page 0".
 */
const LATE_POPUP_GRACE_MS = 1_000;

/**
 * The page facts a recorded step carries (SkillStep.page / effect): which of
 * the open pages it ran on — only when there was more than one — and whether
 * it opened a popup, closed its page, or switched tabs, with the page the
 * procedure continues on.
 */
export async function pageContextOf(
  session: Pick<BrowserSession, 'listPages' | 'getPage'>,
  page: Page,
  name: string,
  args: Record<string, unknown>,
  pagesBefore: Page[],
  opened: Page | null,
  late: { appeared: readonly Page[]; quiet: boolean } = { appeared: [], quiet: false },
): Promise<{ page?: number; effect?: PageEffect; afterPage?: Page }> {
  const index = pagesBefore.indexOf(page);
  const out: { page?: number; effect?: PageEffect; afterPage?: Page } = pagesBefore.length > 1 && index >= 0 ? { page: index } : {};
  if (name === 'tabs') {
    if (typeof args.switch_to !== 'number') return out;
    const now = await session.getPage().catch(() => null);
    return { ...out, effect: { kind: 'switch', to: args.switch_to }, ...(now ? { afterPage: now } : {}) };
  }
  if (!page.isClosed() && POPUP_TOOLS.has(name)) {
    // The event may land after the capture; a page this one opened is the
    // same fact read off the context.
    if (!opened) {
      const pages = await session.listPages().catch(() => [] as Page[]);
      for (const p of pages) {
        if (pagesBefore.includes(p)) continue;
        if ((await p.opener().catch(() => null)) === page) {
          opened = p;
          break;
        }
      }
    }
    // A late tab: none yet, and the action changed nothing here to show for
    // itself. Give it a moment to arrive (the context listener has seen any
    // that came since dispatch).
    if (!opened && late.quiet && typeof page.context === 'function' && !late.appeared.some((p) => !p.isClosed())) {
      await page.context().waitForEvent('page', { timeout: LATE_POPUP_GRACE_MS }).catch(() => null);
    }
    // No opener to name it (rel=noopener, or the event came after the
    // capture): a page new since this step began is still its popup when it
    // is the ONLY one — nothing else acted in the meantime, so no other step
    // could have opened it. Two new pages are ambiguous and credit neither.
    if (!opened) {
      const pages = await session.listPages().catch(() => [] as Page[]);
      const fresh = [...new Set([...pages, ...late.appeared])].filter((p) => !p.isClosed() && !pagesBefore.includes(p));
      if (fresh.length === 1) opened = fresh[0];
    }
    if (!opened && (await page.opener().catch(() => null))) {
      await page.waitForEvent('close', { timeout: CLOSE_GRACE_MS }).catch(() => {});
    }
  }
  if (page.isClosed()) {
    const now = await session.getPage().catch(() => null);
    return { ...out, effect: { kind: 'close' }, ...(now ? { afterPage: now } : {}) };
  }
  if (opened && !opened.isClosed()) {
    await opened.waitForLoadState('domcontentloaded', { timeout: POPUP_WAIT_MS }).catch(() => {});
    return { ...out, effect: { kind: 'popup', urlPattern: compiledUrlPattern(opened.url()) }, afterPage: opened };
  }
  return out;
}

/** What one step run hands back to its caller (replay's StepExecutor). */
export interface StepRun {
  result: string;
  diff?: StepDiff;
  /** The before/after observations `diff` was rendered from, when both were taken. */
  observations?: { before: PageObservation; after: PageObservation };
  captureFailed?: true;
  /** How the action ended, when it was a state-changing tool with an observation. */
  outcome?: ActionOutcome;
  /** The action's observation settled the page, so a caller need not settle it again. */
  settled?: true;
  /** The action clicked a link that leaves the document: where it began, and where the link points (action.ts LinkNavigation). */
  link?: LinkNavigation;
}

/** A signature taken once the page has loaded and the DOM has gone quiet: for a step that had no action observation. */
async function settledSignature(page: Page): Promise<PageSignature | null> {
  try {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await settleDom(page);
    return await captureSignature(page);
  } catch {
    return null;
  }
}

function explainError(err: unknown, args: Record<string, unknown>): string {
  const message = err instanceof Error ? err.message.split('\nCall log:')[0] : String(err);
  if (/strict mode violation/i.test(message)) {
    // Playwright's raw strict-mode error dumps every matched element; replace
    // it with a concise, one-step-fixable hint so the agent disambiguates
    // instead of burning a turn discovering the syntax.
    const n = /resolved to (\d+) elements/.exec(message)?.[1] ?? 'multiple';
    const sel = JSON.stringify(args.target ?? args.source ?? '');
    return `selector ${sel} matched ${n} elements — refine it, or append " >> nth=0" (nth=N for another) to target exactly one.`;
  }
  return message;
}

/** Dialogs captured since the last drain, as a trailing note (or ''). */
function dialogNote(session: BrowserSession): string {
  const dialogs = session.dialogs.drain();
  return dialogs.length
    ? '\n[native dialogs: ' +
        dialogs.map((d) => `${d.type}(${JSON.stringify(d.message)}) → ${d.action}`).join('; ') +
        ']'
    : '';
}

interface BatchStep {
  tool: string;
  args: Record<string, unknown>;
}

/**
 * Run an ordered list of known-next actions in one turn, stopping at the first
 * error, with a single combined state diff. Validation is total and happens
 * before anything runs, so a typo in step 4 cannot leave steps 1-3 applied.
 *
 * isError is true only when NOTHING ran: a batch that got partway through has
 * changed the page, and flagging that as an error would read to the agent as
 * "no effect" — the per-step lines carry the partial outcome instead.
 */
async function executeBatch(
  session: BrowserSession,
  args: Record<string, unknown>,
  screenshotDir: string,
  signal?: AbortSignal,
): Promise<ToolExecution> {
  const fail = (message: string): ToolExecution => ({
    result: truncate(`ERROR: ${message}`, TOOL_RESULT_BUDGET),
    isError: true,
  });

  const raw = args.steps;
  if (!Array.isArray(raw)) return fail('batch requires a "steps" array.');
  if (raw.length < 2) {
    return fail('batch requires at least 2 steps — for a single action, call that tool directly.');
  }
  if (raw.length > MAX_BATCH_STEPS) {
    return fail(
      `batch accepts at most ${MAX_BATCH_STEPS} steps (got ${raw.length}) — split it into several batches. Nothing was executed.`,
    );
  }

  const steps: BatchStep[] = [];
  for (const [i, entry] of raw.entries()) {
    const step = entry as { tool?: unknown; args?: unknown };
    const tool = typeof step?.tool === 'string' ? step.tool : '';
    if (!BATCHABLE.has(tool)) {
      return fail(
        `step ${i + 1}: ${tool ? `"${tool}" cannot be used inside a batch` : 'missing "tool"'} — allowed tools are ${[...BATCHABLE].join(', ')}. Nothing was executed; re-issue without that step.`,
      );
    }
    // A step written FLAT — {"tool":"click","target":"@e5"} instead of
    // {"tool":"click","args":{"target":"@e5"}} — says exactly what it means, and a
    // long session's model writes it that way more and more. It used to run with NO
    // arguments: fxmtg50b-n1 spent 34s, four times, in a targetless click waiting out its
    // deadline. The step's other keys are its arguments.
    const { tool: _tool, args: nested, ...flat } = step as Record<string, unknown>;
    const stepArgs = nested ?? (Object.keys(flat).length ? flat : undefined);
    if (stepArgs !== undefined && (typeof stepArgs !== 'object' || stepArgs === null || Array.isArray(stepArgs))) {
      return fail(`step ${i + 1}: "args" must be an object. Nothing was executed.`);
    }
    steps.push({ tool, args: (stepArgs ?? {}) as Record<string, unknown> });
  }

  const page = await session.getPage().catch(() => null);
  const before: PageSignature | null = page ? await captureSignature(page) : null;

  const lines: string[] = [];
  const notes: string[] = [];
  let ran = 0;
  let failedAt = -1;
  // Whether the last step that ran left the page settled by its own action observation.
  let lastSettled = false;
  const stepMs: Array<{ tool: string; ms: number; ok: boolean }> = [];

  for (const [i, step] of steps.entries()) {
    if (signal?.aborted) {
      notes.push(`[batch stopped: instruction budget exhausted; ${notRun(i, steps.length)}]`);
      break;
    }
    const head = `${i + 1}. ${step.tool} ${summarize(step.args)} → `;
    const stepAt = Date.now();
    try {
      const { result, settled } = await runStep(session, step.tool, step.args, screenshotDir, signal);
      stepMs.push({ tool: step.tool, ms: Date.now() - stepAt, ok: true });
      lastSettled = Boolean(settled);
      lines.push(head + clip(result, BATCH_STEP_CHARS) + dialogNote(session).replace(/^\n/, ' '));
      ran++;
    } catch (err) {
      stepMs.push({ tool: step.tool, ms: Date.now() - stepAt, ok: false });
      lastSettled = false;
      const outcome = STATE_CHANGING.has(step.tool) ? ` ${outcomeLabel(outcomeOfError(err))}` : '';
      lines.push(
        head + 'ERROR: ' + clip(explainError(err, step.args), BATCH_STEP_ERROR_CHARS) + outcome +
          dialogNote(session).replace(/^\n/, ' '),
      );
      failedAt = i;
      const remaining = notRun(i + 1, steps.length);
      notes.push(`[stopped at step ${i + 1}${remaining ? `; ${remaining}` : ''}]`);
      break;
    }
  }

  const diffAt = Date.now();
  const observed = page && before && (ran || failedAt >= 0) ? await stateDiff(page, before, BATCH_LINE_BUDGET, lastSettled) : EMPTY_OBSERVATION;
  stepMs.push({ tool: '(page diff)', ms: Date.now() - diffAt, ok: true });
  const body =[...lines, ...notes].join('\n') + scrubSecrets(observed.note);
  // Nothing ran at all — either the first step failed or the budget expired
  // before it started; that IS an error result.
  if (!ran) return { result: truncate(body || 'ERROR: batch ran no steps.', TOOL_RESULT_BUDGET + 8200), isError: true, stepMs };
  return {
    result: truncate(body, TOOL_RESULT_BUDGET + 8200),
    isError: false,
    stepMs,
    snapshotIncluded: observed.snapshotIncluded,
  };
}

/** "steps 4-5 not run" for the tail starting at index `from`, or '' if none. */
function notRun(from: number, total: number): string {
  if (from >= total) return '';
  return from === total - 1 ? `step ${total} not run` : `steps ${from + 1}-${total} not run`;
}

function summarize(args: Record<string, unknown>): string {
  return clip(JSON.stringify(args), 80);
}

/** What an action's result says about the page it left behind. */
interface Observation {
  /** `\n[state: …]`, plus a `\n[page: …]` snapshot when the page moved wholesale. Or ''. */
  note: string;
  /** The note carries a fresh snapshot, so @refs from earlier ones are stale. */
  snapshotIncluded: boolean;
}

const EMPTY_OBSERVATION: Observation = { note: '', snapshotIncluded: false };

/**
 * Summary of what the just-executed action changed, as `\n[state: …]`, or ''
 * if it could not be determined. The action already succeeded by the time this
 * runs, so nothing here may throw — a missing diff is the failure mode.
 *
 * When the change is too big to list, or the url moved, the summary is not
 * enough on its own: the agent's @refs point at a page that is gone, and the
 * old answer ("re-snapshot to see the new state") spent a whole turn asking
 * for something we are already standing in front of. So the new state is
 * attached instead. A small change deliberately does NOT do this: an
 * ariaSnapshot re-mints Playwright's ref registry, and an agent halfway
 * through filling a form by @ref must keep the refs it is holding.
 */
async function stateDiff(page: Page, before: PageSignature, lineBudget?: number, settled = false): Promise<Observation> {
  try {
    // Settle first: DOM updates are usually async. Genuinely slow updates
    // are still wait_for's job — the diff is a hint, not proof.
    // An action with an observation has settled already (runStep): its
    // evidence — the answer to a request it started, a debounced save — is
    // what the diff should carry, and a second settle would only cost time.
    // Otherwise settlePage, not settleDom: a fetch started within the last
    // moments is given its (bounded) chance to land before the after-capture.
    if (!settled) {
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await settlePage(page);
    }
    let after = await captureSignature(page);
    if (!after) return EMPTY_OBSERVATION;
    let change = describeChange(before, after, lineBudget);
    // Nothing at all changed — which is either the answer, or the app has not
    // given it yet: a click's effect commonly lands a frame or a timer later.
    // A diff taken before it does says "no visible change" and costs the agent
    // the wait_for turn this diff exists to spare it, so give the page one
    // bounded window to show its FIRST mutation. This is a condition, not a
    // sleep: an action that already changed something never reaches it, and a
    // late one returns the moment it lands.
    // noVisibleChange, not nothingChanged: the wait is for a late reaction in
    // what the capture can see, and a capture that could not see everything
    // is still worth giving that moment.
    if (change.noVisibleChange && (await firstMutation(page, REACTION_MS))) {
      await settleDom(page);
      const settled = await captureSignature(page);
      if (settled) {
        after = settled;
        change = describeChange(before, after, lineBudget);
      }
    }
    const fresh = change.substantial || change.urlChanged ? await pageBlock(page) : '';
    // With the page itself attached, the line-by-line list is noise; keep the
    // url and alert facts, which the snapshot does not state.
    const summary = fresh && change.substantial ? change.headline : change.text;
    return { note: `\n[state: ${summary}]` + fresh, snapshotIncluded: Boolean(fresh) };
  } catch {
    return EMPTY_OBSERVATION;
  }
}

/**
 * Resolve on the page's first DOM mutation, or false at the budget. Bounded
 * and best-effort: a page that cannot be evaluated against (navigating,
 * detached) is not one to wait on.
 */
async function firstMutation(page: Page, budget: number): Promise<boolean> {
  try {
    return await page.evaluate(
      (ms) =>
        new Promise<boolean>((resolve) => {
          const stop = setTimeout(() => {
            observer.disconnect();
            resolve(false);
          }, ms);
          const observer = new MutationObserver(() => {
            observer.disconnect();
            clearTimeout(stop);
            resolve(true);
          });
          observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
        }),
      budget,
    );
  } catch {
    return false;
  }
}

/**
 * A fresh interactive-only snapshot to fold into an action's result, or '' if
 * it could not be taken. Every failure here degrades to the old text-only
 * result: this is an economy, never a correctness requirement.
 */
async function pageBlock(page: Page): Promise<string> {
  try {
    const text = await snapshot(page, { interactiveOnly: true, maxChars: AUTO_SNAPSHOT_CHARS });
    if (!text.trim()) return '';
    return `\n[page: the state now — these @refs are current; @refs from any earlier snapshot are stale]\n${text}`;
  } catch {
    return '';
  }
}

/** The same block for a goto/back, once the page it landed on has settled. */
async function landingSnapshot(session: BrowserSession): Promise<string> {
  try {
    const page = await session.getPage();
    await settleDom(page);
    return await pageBlock(page);
  } catch {
    return '';
  }
}

/**
 * How long an agent-written target may take to EXIST before the step is
 * refused. A selector gets the replay resolver's own patience (RESOLVE_WAIT_MS
 * is 3s: long enough for a dialog or a fetched list to mount after the click
 * before it); an @ref gets less, because a ref names a node of a snapshot
 * already taken — it is either still in the DOM or it never will be again.
 */
const TARGET_ATTACH_WAIT_MS = 3_000;
const REF_ATTACH_WAIT_MS = 1_000;

/**
 * Tools whose `target` is allowed to match nothing: waiting for it is wait_for's
 * purpose, and "none" is an ANSWER for snapshot, read_all and a count (so
 * `what: 'count'` is exempt wherever it appears — 0 is how absence is proven).
 */
const UNGUARDED_TARGET_TOOLS = new Set(['wait_for', 'snapshot', 'read_all']);

async function dispatch(
  session: BrowserSession,
  name: string,
  args: Record<string, unknown>,
  screenshotDir: string,
  signal?: AbortSignal,
  /** Replay: pre-resolved locators that override args.target / args.source. */
  resolved?: Record<string, Locator>,
  /** The action's observation: its deadline clamps the click tiers, and they report how the click went out. */
  obs?: ActionObservation | null,
): Promise<string> {
  if (signal?.aborted) throw new Error('cancelled before starting: instruction budget exhausted');
  const page = await session.getPage();
  const t = (key = 'target') => resolved?.[key] ?? resolveTarget(page, String(args[key]));
  const timeout = 10_000;

  // A target that names NOTHING must fail now, not after the action's own
  // actionability timeout. Those timeouts exist for an element that is there
  // and not yet ready (hidden, disabled, moving); an element that does not
  // exist at all is a different fact, and waiting 10s cannot change it.
  // fwrdj5-n1 (the first run with per-step batch timing) spent 12.5s in each of
  // three failed steps — a `fill` or `read` opening a batch on a stale @ref or
  // a guessed selector — 38s of a 199s recording, the largest tool cost left
  // after the scoped-snapshot fix. Only for a target the AGENT wrote: replay's
  // pre-resolved locators have their own resolution and wait. wait_for is the
  // tool for waiting, snapshot and read_all have their own answers for "nothing".
  if (!resolved?.target && typeof args.target === 'string' && args.target.trim() && !UNGUARDED_TARGET_TOOLS.has(name) && args.what !== 'count') {
    const stale = isRefTarget(args.target);
    const attached = await t().first().waitFor({ state: 'attached', timeout: stale ? REF_ATTACH_WAIT_MS : TARGET_ATTACH_WAIT_MS }).then(() => true, () => false);
    if (!attached && !signal?.aborted) {
      throw actionFailure(
        'not-dispatched',
        'never-attached',
        stale
          ? `no element has ref ${args.target} on the page now — refs die when the page re-renders or navigates. Take a fresh snapshot and use the new ref. Nothing was done.`
          : `nothing on the page matches ${JSON.stringify(args.target)} (waited ${TARGET_ATTACH_WAIT_MS / 1000}s for it to appear). Snapshot to see what is here; if it appears only after something loads, wait_for it first. Nothing was done.`,
      );
    }
  }

  switch (name) {
    case 'snapshot':
      return snapshot(page, {
        interactiveOnly: args.full !== true,
        selector: args.selector ? String(args.selector) : undefined,
      });

    case 'click':
      return robustClick(t(), { timeout, obs: obs ?? undefined });
    case 'dblclick':
      return robustClick(t(), { timeout, dbl: true, obs: obs ?? undefined });
    case 'modifier_click': {
      // Validate BEFORE clicking: a missing list used to click plainly and
      // then throw on the result, so the model repeated a click that landed.
      const modifiers = args.modifiers;
      if (!Array.isArray(modifiers) || !modifiers.length) throw new Error('modifier_click needs a non-empty modifiers list (Shift, Control, Alt, Meta); use click for a plain click');
      await t().click({ timeout, modifiers: modifiers as ('Shift' | 'Control' | 'Alt' | 'Meta')[] });
      return `clicked with ${(modifiers as string[]).join('+')}`;
    }
    case 'right_click':
      await t().click({ timeout, button: 'right' });
      return 'right-clicked';

    case 'fill': {
      // Component recipes (PLAN-component-recipes): a target inside a
      // recognized widget (monaco, CodeMirror, contenteditable, ...) gets the
      // family's stored, self-verifying recipe instead of the naive fill —
      // which is known to lie on these widgets. Falls back to the naive path
      // when nothing is recognized or the recipe cannot verify its effect.
      // The ladder itself is shared with the standalone artifact
      // (src/execution/recipes.ts); the store is what this runner adds.
      const viaRecipe = await fillWithRecipe(page, t(), String(args.value ?? ''), storeBook(new ComponentStore(), page));
      return viaRecipe ? describeRecipeAttempt(viaRecipe) : 'filled';
    }
    case 'type': {
      const viaRecipe = await typeWithRecipe(page, t(), String(args.text ?? ''), storeBook(new ComponentStore(), page), {
        timeout,
        delay: typeof args.delay_ms === 'number' ? args.delay_ms : 20,
      });
      return viaRecipe ? describeRecipeAttempt(viaRecipe) : 'typed';
    }
    case 'press':
      if (args.target) await t().press(String(args.key), { timeout });
      else await page.keyboard.press(String(args.key));
      return `pressed ${args.key}`;
    case 'select': {
      // The label is what the procedure MEANS ("the project I just created");
      // the value is whatever the app keys that option by, minted per record
      // as often as not (fwat3 03-add selected the project by its id and both
      // replays timed out looking for it). A compiled step carries the label
      // as `option` and the recorded value only as `optionValue`, the last
      // resort when the label form finds nothing.
      const fallbackValue = typeof args.optionValue === 'string' && args.optionValue ? args.optionValue : undefined;
      const { attempt, selected } = await selectWithRecipe(page, t(), String(args.option ?? ''), storeBook(new ComponentStore(), page), fallbackValue);
      if (attempt) return describeRecipeAttempt(attempt);
      const chosen = await selectedOption(t());
      return `selected ${JSON.stringify(selected)}${chosen ? ` label=${JSON.stringify(chosen.label)}` : ''}`;
    }
    case 'check':
      if (args.checked === false) await t().uncheck({ timeout });
      else await t().check({ timeout });
      return args.checked === false ? 'unchecked' : 'checked';
    case 'hover':
      await syntheticHover(t());
      return 'hovered';
    case 'scroll_into_view':
      await t().scrollIntoViewIfNeeded({ timeout });
      return 'scrolled into view';

    case 'drag': {
      const source = t('source');
      const target = t('target');
      try {
        await source.dragTo(target, { timeout });
        return 'dragged (mouse)';
      } catch {
        await html5DragDrop(source, target);
        return 'dragged (synthetic HTML5 drag events fallback)';
      }
    }

    case 'wait_for':
      // On the locator replay RESOLVED, when it did: a replayed wait carries a
      // recorded `@eN` ref as its target, which names nothing in a session
      // that took no snapshot, and a hidden wait on nothing is met at once —
      // whatever the resolved chain still shows.
      // `resolved.target` is replay's own chain; its absence says this wait is
      // being RECORDED, which is the only moment the agent can still be asked
      // to name the element (see waitFor's refusal).
      return waitFor(page, args, signal, resolved?.target);

    case 'read': {
      // The page URL is an observation with no element behind it: a record's
      // address is often the only durable handle on it (the grafana flow
      // could name every panel yet had no way to publish the dashboard uid).
      if (args.what === 'url') return JSON.stringify(page.url());
      // The document title, likewise: no element shows it (round 59, fwec11 01-signin).
      if (args.what === 'title') return JSON.stringify((await page.title()).trim());
      if (typeof args.target !== 'string' || !args.target.trim()) throw new Error(`read ${String(args.what)} needs a target (only what=url reads without one)`);
      const loc = t();
      // `count` asks HOW MANY, so plural is the answer, not an error.
      if (args.what === 'count') return String(await readElements(loc, false, 'count'));
      // Every ACTION already insists on a unique target: click and fill hand
      // the locator to Playwright, whose strict mode throws on an ambiguous
      // match, and the agent answers that by naming something specific. A
      // singular read was the one exception — it took `.first()` of however
      // many matched, silently.
      //
      // That is the fwod24 defect end to end. `read text h1` matched three
      // headings on Odoo's form; we returned the first, and the recorder,
      // seeing a count that was not 1, stored the locator with NO alternates
      // (describeTarget bails before it derives any). The flow then threaded
      // that value through eleven references. On both replays resolveChain
      // met the same ambiguity, refused to guess which heading — correctly,
      // since picking wrong reads another record's number — and had no
      // fallback to try, so four of seven steps dropped to the model.
      //
      // Recording was accepting exactly what replay would refuse. Closing
      // that costs about two turns per recording (9 of 54 singular reads
      // across five recorded runs were ambiguous, three of them this bug),
      // and the agent already has a unique-by-construction answer it reaches
      // for unprompted in half of all reads: a snapshot ref.
      //
      // read_all stays plural. Reading every price in a table is the point,
      // and 14 of its 16 uses matched many by design.
      const n = await loc.count();
      if (n > 1) {
        throw new Error(
          `read matched ${n} elements for ${JSON.stringify(String(args.target))} — a read must name exactly one. ` +
            `Use a snapshot ref (@e123) for the one you mean, or a more specific selector; use read_all to read all ${n}.`,
        );
      }
      // The element reads themselves are the shared src/execution/observe.ts,
      // which a compiled artifact replays with the very same calls.
      if (!isElementRead(args.what)) throw new Error(`unknown read kind: ${args.what}`);
      return JSON.stringify(await readElements(loc, false, args.what, { attr: String(args.attr), timeout }));
    }

    case 'read_all': {
      const loc = t();
      if (!isElementRead(args.what)) throw new Error(`unknown read_all kind: ${args.what}`);
      if (args.what === 'count') return String(await readElements(loc, true, 'count'));
      return JSON.stringify(await readElements(loc, true, args.what, { attr: String(args.attr) }));
    }

    case 'eval': {
      const expression = String(args.expression ?? '');
      const refusal = evalRefusal(expression);
      if (refusal) throw new Error(refusal);
      const value = await page.evaluate((expr) => {
        // eslint-disable-next-line no-eval
        return (0, eval)(expr);
      }, expression);
      return JSON.stringify(value) ?? 'undefined';
    }

    case 'fetch_source': {
      const url = new URL(args.url ? String(args.url) : page.url(), page.url()).toString();
      const res = await page.request.fetch(url, { timeout: 15_000 });
      const body = await res.text();
      const header = `HTTP ${res.status()} ${res.headers()['content-type'] ?? ''} — RAW SERVER RESPONSE for ${url} (${body.length} chars, no JavaScript executed; this is NOT the live DOM)`;
      if (args.contains) {
        const needle = String(args.contains);
        const hits = body.split('\n').filter((line) => line.includes(needle));
        return `${header}\n${hits.length} line(s) contain ${JSON.stringify(needle)}${hits.length ? ':\n' + hits.join('\n') : ''}`;
      }
      return `${header}\n${body}`;
    }

    case 'goto':
      await page.goto(String(args.url), { waitUntil: 'load', timeout: 30_000 });
      return `at ${page.url()} — "${await page.title()}"`;
    case 'back':
      await page.goBack({ timeout: 15_000 });
      return `at ${page.url()}`;

    case 'tabs': {
      if (typeof args.switch_to === 'number') {
        const switched = await session.switchToPage(args.switch_to);
        return `switched to tab ${args.switch_to}: ${switched.url()}`;
      }
      const pages = await session.listPages();
      const lines = await Promise.all(
        pages.map(async (p, i) => `${i}${p === page ? '*' : ''}: ${await p.title().catch(() => '?')} — ${p.url()}`),
      );
      return lines.join('\n') || '(no tabs)';
    }

    case 'upload':
      await t().setInputFiles((args.paths as string[]).map((p) => path.resolve(p)));
      return 'files set';

    case 'download': {
      const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
      // If the click throws, nothing awaits this promise and its own timeout
      // would surface 30s later as an unhandled rejection that kills the daemon.
      downloadPromise.catch(() => {});
      await t().click({ timeout });
      const download = await downloadPromise;
      const savePath = args.save_path
        ? path.resolve(String(args.save_path))
        : path.join(screenshotDir, download.suggestedFilename() || 'download.bin');
      await download.saveAs(savePath);
      return `downloaded to ${savePath}`;
    }

    case 'set_viewport':
      await page.setViewportSize({ width: Number(args.width), height: Number(args.height) });
      return 'viewport set';
    case 'set_offline':
      await page.context().setOffline(Boolean(args.offline));
      return args.offline ? 'offline' : 'online';

    case 'screenshot': {
      // Always encode as JPEG, regardless of what extension args.path uses —
      // callers that attach these to a vision model typically assume a fixed
      // image/jpeg media type, and Playwright infers encoding from the path
      // extension unless `type` is given explicitly, so a model choosing its
      // own filename (e.g. "confirmation.png") would otherwise silently write
      // real PNG bytes under a caller-controlled name.
      const file = args.path
        ? path.resolve(String(args.path))
        : path.join(screenshotDir, `shot-${Date.now()}.jpg`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await page.screenshot({ path: file, type: 'jpeg', fullPage: Boolean(args.full_page) });
      return `screenshot saved: ${file}`;
    }

    case 'dialog_expect':
      session.dialogs.arm({
        action: args.action === 'accept' ? 'accept' : 'dismiss',
        promptText: args.prompt_text ? String(args.prompt_text) : undefined,
        remaining: typeof args.count === 'number' ? args.count : 1,
      });
      return `armed: will ${args.action} the next ${typeof args.count === 'number' ? args.count : 1} dialog(s)`;

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

/**
 * Why an eval expression is refused: the page-mutating call it makes, or null.
 *
 * fwgr19 recorded its dashboard save as `btn.click()` inside an eval. The
 * step ran fine, but eval steps do not compile into skills — only the
 * dedicated tools carry locators — so the pinned skill had fill-title → wait
 * for dialog hidden with no save between them, failed there on every replay,
 * and paid 66 recovery turns per run forever. An unreplayable mutation is a
 * hole in the recording, so it is refused at the source, naming the tool to
 * use instead. Read expressions are untouched: a comparison (`el.value ===
 * x`) is not an assignment, and querying, filtering and serialising are fine.
 *
 * Phase A closed what the first list let through. Across the 146 published n1
 * recordings (2,503 distinct eval expressions) it passed exactly seven state
 * changes, all after it shipped: fwop10 and fwod82 gave elements ids of their
 * own (`ce.id='journal-editor-2'`, `b.id='edit_discard_btn'`) and then acted
 * on `#journal-editor-2`, which no replay has; fwgh8 opened the public post
 * with `window.open(…)`, and creditUncreditedPopups later had to drop every
 * step it ran there. So identity (`.id/.name/.className =`, `dataset`,
 * `classList`), opening or rewriting a page (`window.open`, a bare
 * `location =`, `document.write`) and showing or enabling an element
 * (`.style.x =`, `.hidden =`, `.disabled =`) are refused too. Over all 2,503
 * the additions refuse those seven and nothing else (bench/eval-audit.mjs).
 *
 * The patterns read the CODE: string literals are blanked first, so
 * `innerText.includes('window.open(')` is a read. A plain object built with
 * `o.id = …` is refused as well; the message says to write it as a literal.
 */
export function evalMutation(expression: string): string | null {
  const code = withoutStringLiterals(expression);
  const patterns: Array<[RegExp, string]> = [
    [/\.(click|submit|requestSubmit)\s*\(/, 'calls .$1()'],
    [/\.dispatchEvent\s*\(/, 'dispatches a synthetic event'],
    [/\.(value|checked|selectedIndex)\s*=(?!=)/, 'assigns .$1'],
    [/\.(innerHTML|outerHTML|textContent|innerText)\s*=(?!=)/, 'assigns .$1'],
    [/\blocation\.(href|hash)\s*=(?!=)/, 'assigns location.$1'],
    [/\blocation\.(assign|replace|reload)\s*\(/, 'navigates via location.$1()'],
    [/\bhistory\.(pushState|replaceState|back|forward|go)\s*\(/, 'navigates via history.$1()'],
    [/\.(remove|removeChild|appendChild|insertBefore|replaceChild|replaceWith)\s*\(/, 'edits the DOM with .$1()'],
    [/\.(setAttribute|removeAttribute)\s*\(/, 'edits the DOM with .$1()'],
    [/\b(localStorage|sessionStorage)\.(setItem|removeItem|clear)\s*\(/, 'writes $1'],
    // Identity the replay never has (fwop10, fwod82).
    [/\.(id|name|className)\s*=(?!=)/, 'assigns .$1'],
    [/\.(dataset\.[\w$]+)\s*=(?!=)/, 'assigns .$1'],
    [/\.classList\.(add|remove|toggle|replace)\s*\(/, 'edits the DOM with .classList.$1()'],
    // A page the replay never opens (fwgh8), or a document it never has.
    [/(?<![.\w$])(?:window\.)?open\s*\(/, 'opens a page with window.open()'],
    [/(?<![.\w$])(?<!(?:const|let|var)\s+)(?:window\.|document\.)?location\s*=(?![=>])/, 'assigns location'],
    [/\bdocument\.(open|write|writeln)\s*\(/, 'rewrites the document with document.$1()'],
    // An element shown or enabled for the recording alone.
    [/\.(style\.[\w$]+)\s*=(?!=)/, 'assigns .$1'],
    [/\.style\.(setProperty|removeProperty)\s*\(/, 'edits the DOM with .style.$1()'],
    [/\.(hidden|disabled)\s*=(?!=)/, 'assigns .$1'],
  ];
  for (const [re, why] of patterns) {
    const m = re.exec(code);
    if (m) return why.replace('$1', m[1] ?? '');
  }
  return null;
}

/** `expression` with the contents of its string literals blanked, so a pattern sees only code. */
function withoutStringLiterals(expression: string): string {
  return expression.replace(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => m[0] + m[0]);
}

const LOOKUP_CALLBACK = String.raw`\.(?:find|filter|some)\(\s*\(?\s*[\w$]+\s*\)?\s*=>\s*`;
/** One lookup of an eval expression, in the order evalTarget reads them. */
const EVAL_LOOKUPS = new RegExp(
  [
    // 1,2: a filter on a child lookup → :has(…)
    LOOKUP_CALLBACK + String.raw`[\w$]+\.querySelector\(\s*(['"])((?:(?!\1).)+)\1\s*\)`,
    // 3,4: a filter on exact text → :text-is(…)
    LOOKUP_CALLBACK + String.raw`[\w$]+\.(?:textContent|innerText)(?:\.trim\(\))?\s*===?\s*(['"])((?:(?!\3).)*)\3`,
    // 5: a filter on a plain regex → :has-text(…)
    LOOKUP_CALLBACK + String.raw`\/((?:[^/\\\[\](){}.*+?^$|]|\\.)+)\/i?\.test\(`,
    // 6,7: a filter on contained text → :has-text(…)
    LOOKUP_CALLBACK + String.raw`[\w$]+\.(?:textContent|innerText)(?:\.trim\(\))?\.includes\(\s*(['"])((?:(?!\6).)+)\6`,
    // 8,9: getElementById → #id
    String.raw`getElementById\(\s*(['"])((?:(?!\8).)+)\8\s*\)`,
    // 10,11: querySelector(All) → its selector
    String.raw`querySelector(?:All)?\(\s*(['"])((?:(?!\10).)+)\10\s*\)`,
  ].join('|'),
  'g',
);

/**
 * The element an eval expression reaches, written as a target the dedicated
 * tools take, or null when the expression names none. Read off the
 * expression's own lookups, in order: `getElementById('x')` → `#x`,
 * `querySelector(All)('s')` → `s`, each one inside the last (`>>`); a
 * `.find/.filter` on text equality narrows the last to `:text-is("…")`, on a
 * plain regex or `includes` to `:has-text("…")`, and on a child lookup to
 * `:has(…)`. A hint for the refusal message, never a recorded locator.
 * fwop10's `ce.id='journal-editor-2'` followed
 * `getElementById('work-package-journal-form-element')` and
 * `querySelector('[contenteditable="true"]')`: the target it wanted was
 * `#work-package-journal-form-element >> [contenteditable="true"]`.
 */
export function evalTarget(expression: string): string | null {
  const parts: string[] = [];
  const narrow = (suffix: string) => {
    if (parts.length) parts[parts.length - 1] += suffix;
  };
  for (const m of expression.matchAll(EVAL_LOOKUPS)) {
    if (m[2] !== undefined) narrow(`:has(${m[2]})`);
    else if (m[4] !== undefined) narrow(`:text-is(${JSON.stringify(m[4])})`);
    else if (m[5] !== undefined) narrow(`:has-text(${JSON.stringify(m[5].replace(/\\(.)/g, '$1'))})`);
    else if (m[7] !== undefined) narrow(`:has-text(${JSON.stringify(m[7])})`);
    else if (m[9] !== undefined) parts.push(/^[A-Za-z][\w-]*$/.test(m[9]) ? `#${m[9]}` : `[id=${JSON.stringify(m[9])}]`);
    else if (m[11] !== undefined) parts.push(m[11]);
  }
  return parts.length ? parts.join(' >> ') : null;
}

/** What the model is told when an eval is refused, or null when it is not. */
export function evalRefusal(expression: string): string | null {
  const mutation = evalMutation(expression);
  if (!mutation) return null;
  const target = evalTarget(expression);
  const where = target ? ` The element this expression reaches, as a target the tools take: \`${target}\` (or a snapshot @ref).` : '';
  if (mutation.startsWith('opens a page') || mutation === 'assigns location' || mutation.startsWith('rewrites the document')) {
    const url = /(?:open|location)\s*(?:\(|=)\s*(['"`])((?:(?!\1).)+)\1/.exec(expression)?.[2];
    return (
      `eval is read-only: the expression ${mutation}. A replay never runs this eval, so it can never reach that page, and every step you take there would be dropped. ` +
      `Click the link or button that opens it, or navigate this tab${url ? ` (goto '${url}')` : ' with goto'}; tabs lists and switches pages.`
    );
  }
  if (/^assigns \.(id|name|className|dataset)/.test(mutation) || mutation.startsWith('edits the DOM with .classList')) {
    return (
      `eval is read-only: the expression ${mutation}. An id, name or class you give an element exists only in this browser: a replay never runs this eval, so a step that targets it can never find it.` +
      `${where || ' Target the element the way you found it: its selector, its role and name, or a snapshot @ref.'} If you were only building a result object, write it as an object literal ({ id: el.id }) instead.`
    );
  }
  return (
    `eval is read-only: the expression ${mutation}. That would run, but could never be replayed — a replay never runs this eval; only the dedicated tools are recorded. ` +
    `Use click / fill / press / select / goto instead (locate the element first if you only know its text).${where}`
  );
}

async function waitFor(
  page: Page,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  /** The target to wait on; replay passes what its chain resolved to, recording passes nothing. */
  resolved?: Locator,
): Promise<string> {
  const timeout = typeof args.timeout_ms === 'number' ? args.timeout_ms : 10_000;
  const state = String(args.state);
  const loc = resolved ?? resolveTarget(page, String(args.target));

  // A SINGULAR wait state asks about one element — is it visible, does it show
  // this text — and the dispatch below answers by looking at match 0 only. On
  // an ambiguous target that is a guess about which element the instruction
  // meant, exactly as an ambiguous singular `read` is (see the read case), and
  // it is refused at record time in the same shape so the agent names the one
  // it means while the page that would answer is still live.
  //
  // grafana fwgr43 recorded `wait_for h2 state:visible` against THREE panel
  // headings; nothing at record time objected, and the ambiguity then became
  // the replays' problem. `state: count` and read_all are plural by contract
  // and are not touched; recording is also the only moment this applies —
  // replay resolves through a stored chain and dispatches `.first()`.
  if (!resolved && state !== 'count' && state !== 'hidden') {
    const n = await loc.count().catch(() => 1);
    if (n > 1) {
      throw new Error(
        `wait_for ${state} matched ${n} elements for ${JSON.stringify(String(args.target))} — a wait on one element must name exactly one. ` +
          `Use a snapshot ref (@e123) for the one you mean, or a more specific selector; use state=count to assert on all ${n}.`,
      );
    }
  }

  if (state === 'visible' || state === 'hidden') {
    await loc.first().waitFor({ state, timeout });
    return `condition met: ${state}`;
  }

  const cancelled = () => {
    throw new Error('wait_for cancelled: instruction budget exhausted');
  };

  const deadline = Date.now() + timeout;
  let last = '';
  let firstObserved: string | null = null;
  while (Date.now() < deadline) {
    if (signal?.aborted) cancelled();
    if (state === 'count') {
      const count = await loc.count();
      last = `count=${count}`;
      if (count === Number(args.count)) return `condition met: ${last}`;
    } else {
      const text = (await loc.first().innerText({ timeout: 1000 }).catch(() => null)) ?? '';
      last = `text=${JSON.stringify(text.slice(0, 200))}`;
      // One definition of "shows the text" in every tier (execution/text.ts
      // textHolds): rendered text, whitespace collapsed — what the artifact's
      // useInnerText assertions and the held-elsewhere rung compare (fwop10).
      if ((state === 'text_equals' || state === 'text_contains') && textHolds(text, state, String(args.text))) return `condition met: ${last}`;
    }
    if (firstObserved === null) firstObserved = last;
    // Wake early on cancellation so an abandoned wait stops polling the page
    // instead of ticking on in the background for the rest of its own timeout.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, 250);
      function done() {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        resolve();
      }
      signal?.addEventListener('abort', done, { once: true });
    });
  }
  if (signal?.aborted) cancelled();
  // If the observed value never budged, the condition is likely unsatisfiable
  // (e.g. a count wait against a virtualised list) rather than merely slow.
  const stableHint =
    firstObserved !== null && firstObserved === last
      ? ` — value never changed from ${last}, so this condition may be unsatisfiable (e.g. count against a virtualised list renders only visible rows); assert on a stable indicator instead`
      : '';
  throw new Error(`wait_for ${state} timed out after ${timeout}ms (last: ${last})${stableHint}`);
}
