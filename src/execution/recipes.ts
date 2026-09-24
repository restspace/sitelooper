import type { ElementHandle, Locator, Page } from 'playwright-core';
import { DEFAULT_ACTION_TIMEOUT_MS, actionFailure, reactSafeFill, reactSafeSelect, settleDom } from './browser.js';

/**
 * Component recipes — the RUNNER, shared by daemon replay and the standalone
 * artifact.
 *
 * A recipe is an origin-independent micro-procedure for a third-party widget
 * that defeats the naive fill/type/select primitives (monaco, CodeMirror, a
 * contenteditable editor, a portal-rendered combobox): a short action list
 * with the payload parameterised as {{value}}, plus a mandatory verification
 * read. The honesty rule is structural: a recipe only succeeded if the
 * component's effective value re-observes the payload, and one that cannot
 * prove its effect reports failure so the caller falls back to the native
 * primitive.
 *
 * What lives here is everything that runs against a page: the family
 * recognition set, the shipped seed procedures, recognition, execution,
 * verification, and the "recipe first, then native" ladder each of fill,
 * type and select climbs. What does NOT live here is recipe SELECTION — the
 * ComponentStore in src/skills/components.ts (learned variants, statuses,
 * demotion, stats) — because that is daemon state. The daemon supplies a
 * `RecipeBook` that consults the store; the artifact supplies one built from
 * a compile-time snapshot of what the store would have chosen.
 */

export type RecipeIntent = 'set-value' | 'read-value' | 'select-option' | 'open' | 'dismiss';

export interface RecipeStep {
  action: 'click' | 'press' | 'insertText' | 'fill' | 'blur' | 'settle';
  /**
   * CSS relative to the component root; absent = the root itself. A
   * `page:<css>` prefix scopes to the whole page — for option lists rendered
   * into a portal outside the component's subtree.
   */
  target?: string;
  key?: string;
  /** For insertText/fill; "{{value}}" is replaced by the payload. */
  text?: string;
  /** A historical estimate of the re-render time; `settle` waits for the DOM to go quiet instead. */
  ms?: number;
  /** Restrict a page-scoped click to elements containing this (filled) text. */
  withText?: string;
}

/** The runnable part of a recipe: what both runners need, and all the artifact carries. */
export interface RecipeProcedure {
  id: string;
  family: string;
  intent: RecipeIntent;
  steps: RecipeStep[];
  /** CSS relative to root for the verification read; absent = the root itself. */
  verifyRead?: string;
}

export interface RecipeFamily {
  id: string;
  /** CSS the component ROOT matches (used with Element.closest). */
  root: string;
  /** Default verification read for learned recipes of this family. */
  verifyRead?: string;
}

/**
 * Recognition set. Order matters: more specific families first (CodeMirror's
 * .cm-content IS contenteditable; monaco embeds a textarea). Recognition may
 * be heuristic because being wrong is cheap: the recipe's verification read
 * fails, the action falls back to the naive primitive and then the model.
 */
export const RECIPE_FAMILIES: RecipeFamily[] = [
  { id: 'monaco', root: '.monaco-editor', verifyRead: '.view-lines' },
  { id: 'codemirror6', root: '.cm-editor', verifyRead: '.cm-content' },
  { id: 'prosemirror', root: '.ProseMirror' },
  { id: 'contenteditable', root: '[contenteditable="true"]' },
  { id: 'aria-combobox', root: '[role="combobox"]' },
];

export function recipeFamilyOf(id: string): RecipeFamily | undefined {
  return RECIPE_FAMILIES.find((f) => f.id === id);
}

/**
 * Select-all → replace → commit, the shape every keyboard-driven editor takes.
 *
 * The Escape (`escape`, on by default) dismisses a CODE editor's completion widget before the blur, so
 * the blur cannot accept a suggestion into the value. A rich-text editor has
 * no such widget, and the app hosting one often binds Escape to "cancel this
 * edit": fwvk1's task description (a tiptap/ProseMirror editor) threw the
 * inserted text away on it, every seed attempt failed its verification, and
 * two failures demoted the seed — which is how a learned recipe that appends
 * came to serve the family. So the rich-text seeds do not press it.
 */
export function editorSetValueSteps(clickTarget?: string, blurTarget?: string, opts: { escape?: boolean } = {}): RecipeStep[] {
  return [
    { action: 'click', ...(clickTarget ? { target: clickTarget } : {}) },
    { action: 'press', key: 'ControlOrMeta+a' },
    { action: 'insertText', text: '{{value}}' },
    { action: 'settle', ms: 400 },
    ...(opts.escape === false ? [] : [{ action: 'press', key: 'Escape' } as RecipeStep]),
    { action: 'blur', ...(blurTarget ? { target: blurTarget } : {}) },
    { action: 'settle', ms: 200 },
  ];
}

/** A shipped procedure before the store gives it an id, a status and stats. */
export type SeedRecipe = Omit<RecipeProcedure, 'id'>;

/**
 * The shipped starter library, as procedures. Seeds are a floor, not an
 * authority: in the daemon they enter the lifecycle provisional, must verify
 * on first contact, and can be demoted or superseded by learned variants when
 * a library version changes behaviour. The store assigns their ids.
 */
export const SEED_RECIPES: SeedRecipe[] = [
  { family: 'monaco', intent: 'set-value', steps: editorSetValueSteps(undefined, 'textarea'), verifyRead: '.view-lines' },
  { family: 'monaco', intent: 'read-value', steps: [], verifyRead: '.view-lines' },
  { family: 'codemirror6', intent: 'set-value', steps: editorSetValueSteps('.cm-content', '.cm-content'), verifyRead: '.cm-content' },
  { family: 'codemirror6', intent: 'read-value', steps: [], verifyRead: '.cm-content' },
  { family: 'prosemirror', intent: 'set-value', steps: editorSetValueSteps(undefined, undefined, { escape: false }) },
  { family: 'contenteditable', intent: 'set-value', steps: editorSetValueSteps(undefined, undefined, { escape: false }) },
  {
    family: 'aria-combobox',
    intent: 'select-option',
    steps: [
      { action: 'click' },
      { action: 'press', key: 'ControlOrMeta+a' },
      { action: 'insertText', text: '{{value}}' },
      { action: 'settle', ms: 400 },
      { action: 'click', target: 'page:[role="option"]', withText: '{{value}}' },
      { action: 'settle', ms: 200 },
    ],
  },
];

/** How long recognition waits for the target to be attached — the element must exist for `closest` to mean anything. */
export const RECIPE_RECOGNIZE_MS = 1_500;
/** Per-step budget inside a recipe. */
export const RECIPE_STEP_TIMEOUT_MS = 3_000;

export interface RecognizedComponent {
  family: RecipeFamily;
  /**
   * The nearest matching ancestor-or-self of the target, PINNED at
   * recognition: the component root every step's `target` is relative to. A
   * handle rather than a Locator because a recipe changes what the target
   * matches — a text or placeholder target on an editor stops matching once
   * the content is replaced, and a selector that also matches a mirrored
   * preview matches more afterwards — while every click, blur and the
   * verification read must still mean the component that was recognised.
   * Whoever recognised it disposes it (`applyRecipe` does, on every exit).
   */
  root: ElementHandle;
}

/**
 * Which component (if any) the target element sits inside: nearest matching
 * ancestor, first family in RECIPE_FAMILIES order wins. The target is
 * resolved once (strictly, waiting up to RECIPE_RECOGNIZE_MS for it to
 * attach, as HEAD's `elementHandle` did); one evaluateHandle on it pins the
 * root element of the first family whose `closest` hits; one evaluate on that pinned root names the family — the first root
 * selector it matches, which is that family, since every earlier family's
 * `closest` already missed on an ancestor-or-self of the target. Null on a
 * target that is not attached, or any evaluation failure; no handle is left
 * undisposed then.
 */
export async function recognizeComponent(_page: Page, target: Locator, families: readonly RecipeFamily[] = RECIPE_FAMILIES): Promise<RecognizedComponent | null> {
  const roots = families.map((f) => f.root);
  let el: ElementHandle | null = null;
  let root: ElementHandle | null = null;
  try {
    el = await target.elementHandle({ timeout: RECIPE_RECOGNIZE_MS });
    if (!el) return null;
    const found = await el.evaluateHandle((node: Element, sels: string[]) => {
      for (const sel of sels) {
        try {
          const hit = node.closest(sel);
          if (hit) return hit;
        } catch {
          // malformed selector — try the next family
        }
      }
      return null;
    }, roots);
    root = found.asElement();
    if (!root) {
      await found.dispose().catch(() => {});
      return null;
    }
    const which = await root.evaluate(
      (node: Element, sels: string[]) =>
        sels.findIndex((sel) => {
          try {
            return node.matches(sel);
          } catch {
            return false;
          }
        }),
      roots,
    );
    if (which < 0) {
      await root.dispose().catch(() => {});
      return null;
    }
    return { family: families[which], root };
  } catch {
    if (root) await root.dispose().catch(() => {});
    return null;
  } finally {
    if (el) await el.dispose().catch(() => {});
  }
}

/**
 * Run `use` on the element a root-relative step target names inside the
 * pinned root right now (the first match; the root itself when the target is
 * absent; null when it names nothing), disposing a child handle afterwards.
 */
async function withStepTarget<T>(root: ElementHandle, target: string | undefined, use: (h: ElementHandle | null) => Promise<T>): Promise<T> {
  const h = target ? await root.$(target) : root;
  try {
    return await use(h);
  } finally {
    if (h && h !== root) await h.dispose().catch(() => {});
  }
}

/** Run a recipe's steps against a recognized component root. Throws on a step that cannot run. */
export async function executeRecipe(page: Page, root: ElementHandle, recipe: RecipeProcedure, payload: string): Promise<void> {
  for (const s of recipe.steps) {
    const text = s.text?.split('{{value}}').join(payload);
    const withText = s.withText?.split('{{value}}').join(payload);
    switch (s.action) {
      case 'click': {
        if (s.target?.startsWith('page:')) {
          let loc = page.locator(s.target.slice(5));
          if (withText) loc = loc.filter({ hasText: withText });
          await loc.first().click({ timeout: RECIPE_STEP_TIMEOUT_MS });
        } else {
          await withStepTarget(root, s.target, async (h) => {
            if (!h) throw new Error(`recipe ${recipe.id}: no "${s.target}" inside the component`);
            await h.click({ timeout: RECIPE_STEP_TIMEOUT_MS });
          });
        }
        break;
      }
      case 'press':
        await page.keyboard.press(String(s.key ?? ''));
        break;
      case 'insertText':
        await page.keyboard.insertText(text ?? '');
        break;
      case 'fill': {
        await withStepTarget(root, s.target, async (h) => {
          if (!h) throw new Error(`recipe ${recipe.id}: no "${s.target}" inside the component`);
          await h.fill(text ?? '', { timeout: RECIPE_STEP_TIMEOUT_MS });
        });
        break;
      }
      case 'blur': {
        // No target blurs the root itself; a blur target the recipe names but
        // the widget does not have is simply skipped.
        await withStepTarget(root, s.target, async (h) => {
          if (h) await h.evaluate((el: Element) => (el as HTMLElement).blur?.());
        });
        break;
      }
      case 'settle':
        // The recipe's `ms` was an estimate of how long the editor takes to
        // re-render; the re-render itself is observable, so wait for the DOM
        // to go quiet instead. A component that reacted already costs ~60ms
        // rather than the full estimate, and one that keeps re-rendering is
        // followed to its own end rather than cut off at a guess.
        await settleDom(page);
        break;
    }
  }
}

/** Normalise for containment checks: monaco renders spaces as NBSP, editors rewrap lines. */
export function squashText(s: string): string {
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/** Read the component's effective value through the recipe's verification read; null when it cannot be read. */
export async function readComponentValue(root: ElementHandle, recipe: Pick<RecipeProcedure, 'verifyRead'>): Promise<string | null> {
  try {
    return await withStepTarget(root, recipe.verifyRead, async (node) => {
      if (!node) return null;
      return node.evaluate((el: Element) => {
        const anyEl = el as HTMLInputElement;
        if (typeof anyEl.value === 'string') return anyEl.value;
        return (el as HTMLElement).innerText ?? el.textContent ?? '';
      });
    });
  } catch {
    return null;
  }
}

/**
 * The honesty rule made structural: the recipe only succeeded if the
 * component's effective value re-observes the payload. A recipe that cannot
 * prove its effect reports failure and the caller falls back.
 *
 * A SET-VALUE recipe must replace, so it verifies only when the component
 * then holds exactly the payload (whitespace-squashed). Containment let a
 * recipe that appends pass: fwvk1's learned prosemirror recipe (click, then
 * insertText — no select-all) ran twice on one description, each run
 * "verified" because the doubled text contains the value, and every replay
 * saved "Bench task created for run fwvk1-n2Bench task created for run
 * fwvk1-n2". A select-option recipe keeps containment: the combobox shows
 * the chosen option among its own chrome.
 */
export async function verifyRecipe(root: ElementHandle, recipe: Pick<RecipeProcedure, 'verifyRead'> & { intent?: RecipeIntent }, payload: string, intent: RecipeIntent | undefined = recipe.intent): Promise<boolean> {
  const value = await readComponentValue(root, recipe);
  if (value === null) return false;
  if (!payload) return true;
  if (intent === 'set-value') return squashText(value) === squashText(payload);
  return squashText(value).includes(squashText(payload));
}

/** One recipe run, verified or not, for the caller's lifecycle. */
export interface RecipeAttempt {
  family: string;
  intent: RecipeIntent;
  recipe: RecipeProcedure;
  /** Verified: the component re-observed the payload. */
  ok: boolean;
  /** A step that could not run at all (the recipe threw); absent when every step ran and only verification failed. */
  error?: string;
  /** The book's `onAttempt` threw (e.g. the store write failed); present only then. The attempt's outcome stands regardless. */
  warning?: string;
}

/**
 * Where a runner's recipes come from. The daemon's book consults the
 * ComponentStore; the artifact's is `snapshotBook` over a compile-time
 * snapshot. Both answer the same two questions the daemon's `tryRecipe`
 * asked: is there any usable recipe for this intent at all (if not,
 * recognising the widget can only answer null and is skipped), and which
 * recipe serves this family.
 */
export interface RecipeBook {
  /** Whether ANY usable recipe exists for the intent — the gate ahead of recognition. */
  offers(intent: RecipeIntent): boolean;
  /** The recipe for a recognized family, or null when the family has none usable. */
  choose(family: string, intent: RecipeIntent): RecipeProcedure | null;
  /** Every attempt, verified or not, so a runner with a lifecycle can fold it in. */
  onAttempt?(attempt: RecipeAttempt): void;
}

/**
 * The artifact's book: a serialisable snapshot of the recipe the store would
 * choose per (family, intent) at compile time — seeds and learned variants
 * alike, demoted ones omitted. `snapshotRecipes` in src/skills/components.ts
 * builds it and says what the store holds that a static snapshot cannot
 * express.
 */
export interface RecipeSnapshot {
  version: 1;
  recipes: RecipeProcedure[];
}

export function snapshotBook(snapshot: RecipeSnapshot): RecipeBook {
  return {
    offers: (intent) => snapshot.recipes.some((r) => r.intent === intent),
    choose: (family, intent) => snapshot.recipes.find((r) => r.family === family && r.intent === intent) ?? null,
  };
}

/**
 * Attempt an intent through the book's recipe for whatever component the
 * target sits inside. Returns null when nothing was attempted — no recipe for
 * the intent, no recognized component, or none for its family — so the caller
 * goes straight to the native primitive; otherwise the attempt, verified or
 * not, after reporting it to the book. Execute, then verify, then report —
 * the daemon's order; a thrown step is an unverified attempt with its reason.
 */
export async function applyRecipe(page: Page, target: Locator, intent: RecipeIntent, payload: string, book: RecipeBook): Promise<RecipeAttempt | null> {
  if (!book.offers(intent)) return null;
  const rec = await recognizeComponent(page, target);
  if (!rec) return null;
  let recipe: RecipeProcedure | null;
  try {
    recipe = book.choose(rec.family.id, intent);
  } catch (err) {
    await rec.root.dispose().catch(() => {});
    throw err;
  }
  if (!recipe) {
    // nothing will be attempted: release the pinned root at once
    await rec.root.dispose().catch(() => {});
    return null;
  }
  let attempt: RecipeAttempt;
  try {
    await executeRecipe(page, rec.root, recipe, payload);
    attempt = { family: rec.family.id, intent, recipe, ok: await verifyRecipe(rec.root, recipe, payload, intent) };
  } catch (err) {
    attempt = { family: rec.family.id, intent, recipe, ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await rec.root.dispose().catch(() => {});
  }
  try {
    book.onAttempt?.(attempt);
  } catch (err) {
    // Lifecycle bookkeeping (a store write the OS refused — EPERM/EBUSY on a
    // rename another session holds) must never change the action's outcome:
    // a verified recipe stays verified, and an unverified one still falls
    // back to the native primitive. The failure travels as a warning.
    attempt = { ...attempt, warning: `recipe outcome not recorded: ${err instanceof Error ? err.message : String(err)}` };
  }
  return attempt;
}

/** The words both runners report a verified recipe in. */
export function describeRecipeAttempt(attempt: RecipeAttempt): string {
  const verb = attempt.intent === 'select-option' ? 'selected' : 'filled';
  const base = `${verb} via recipe ${attempt.family}/${attempt.intent} (${attempt.recipe.id}); value verified on the component`;
  return attempt.warning ? `${base} (warning: ${attempt.warning})` : base;
}

/**
 * The ladders. Each is the daemon's tool case verbatim: the recipe half
 * first, the native primitive only when nothing was verified. The verified
 * attempt is returned so the caller can say so; null means the native
 * primitive did the work.
 */
export async function fillWithRecipe(page: Page, target: Locator, value: string, book: RecipeBook): Promise<RecipeAttempt | null> {
  const attempt = await applyRecipe(page, target, 'set-value', value, book);
  if (attempt?.ok) return attempt;
  await reactSafeFill(target, value);
  return null;
}

export async function typeWithRecipe(
  page: Page,
  target: Locator,
  text: string,
  book: RecipeBook,
  opts: { timeout?: number; delay?: number } = {},
): Promise<RecipeAttempt | null> {
  const attempt = await applyRecipe(page, target, 'set-value', text, book);
  if (attempt?.ok) return attempt;
  await focusOrRefuse(target, opts.timeout);
  await target.pressSequentially(text, { ...opts, timeout: opts.timeout ?? DEFAULT_ACTION_TIMEOUT_MS });
  return null;
}

/**
 * Keys go to whatever holds focus, so a `type` whose target cannot take focus
 * types into some OTHER field. fwsi1 03-create step 4 typed into select2's
 * rendered <span> (not focusable): the recording's keys reached the
 * dropdown's search box, which an unrecorded failed fill had opened; every
 * replay's reached the asset name field, which still had focus, and appended
 * "Bench Laptop Model" to it before the step's own check stopped it. So the
 * target is focused and must then hold focus itself — or contain what does
 * (a wrapper whose inner input takes it, across open shadow roots), or be
 * inside the label of what does — before a key is sent. Otherwise the step
 * fails with nothing typed.
 */
async function focusOrRefuse(target: Locator, timeout?: number): Promise<void> {
  await target.focus({ timeout: timeout ?? DEFAULT_ACTION_TIMEOUT_MS });
  const holds = await target.evaluate(
    (el) => {
      let active: Element | null = document.activeElement;
      const label = el.closest('label')?.control ?? null;
      while (active) {
        if (active === el || el.contains(active) || active === label) return true;
        active = active.shadowRoot?.activeElement ?? null;
      }
      return false;
    },
    undefined,
    { timeout: timeout ?? DEFAULT_ACTION_TIMEOUT_MS },
  );
  if (!holds) {
    throw actionFailure(
      'not-dispatched',
      'not-an-input',
      'type: target cannot take keyboard focus — click it or type into the field it opens (nothing was typed)',
    );
  }
}

/** Select: the verified attempt, or the options the native select chose. */
export async function selectWithRecipe(
  page: Page,
  target: Locator,
  label: string,
  book: RecipeBook,
  fallbackValue?: string,
): Promise<{ attempt: RecipeAttempt; selected: null } | { attempt: null; selected: string[] }> {
  const attempt = await applyRecipe(page, target, 'select-option', label, book);
  if (attempt?.ok) return { attempt, selected: null };
  return { attempt: null, selected: await reactSafeSelect(target, label, fallbackValue) };
}
