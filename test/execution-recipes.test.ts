import type { ElementHandle, Locator, Page } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The runner's only sibling: settling and the native primitives are observed, not run.
vi.mock('../src/execution/browser.js', () => ({
  settleDom: vi.fn().mockResolvedValue(undefined),
  reactSafeFill: vi.fn().mockResolvedValue(undefined),
  reactSafeSelect: vi.fn().mockResolvedValue(['opt-1']),
  actionFailure: (_outcome: string, _reason: string, message: string) => new Error(message),
}));

import { reactSafeFill, reactSafeSelect, settleDom } from '../src/execution/browser.js';
import {
  applyRecipe,
  describeRecipeAttempt,
  editorSetValueSteps,
  executeRecipe,
  fillWithRecipe,
  RECIPE_FAMILIES,
  RECIPE_STEP_TIMEOUT_MS,
  readComponentValue,
  recipeFamilyOf,
  recognizeComponent,
  SEED_RECIPES,
  selectWithRecipe,
  snapshotBook,
  squashText,
  typeWithRecipe,
  verifyRecipe,
  type RecipeBook,
  type RecipeProcedure,
  type RecipeSnapshot,
} from '../src/execution/recipes.js';
import { seedRecipeId, seedRecipes, snapshotRecipes, type Recipe } from '../src/skills/components.js';

/**
 * A page of fake locators and element handles. A locator or handle is its
 * description; `present` says which descriptions name an element right now,
 * `closest` which family roots the target sits inside, and `shown` what the
 * verification read sees. Every action is logged in order.
 *
 * Locators are LAZY, as Playwright's are: a description starting with
 * `target` is re-resolved on every call, so `targetGone` (the target stopped
 * matching) and `mirrored` (the target matches an extra element — a preview —
 * whose component shows `mirror`, and a chain ending in `.last` reads it)
 * change what it names. A handle (`root(<family root>)`) is PINNED: it keeps
 * naming the element recognition found, whatever the target matches later.
 */
class World {
  calls: string[] = [];
  disposed: string[] = [];
  /** Family root selectors an ancestor of the target matches. */
  closest = new Set<string>();
  /** Selectors (as substrings of a description) that name nothing. */
  missing = new Set<string>();
  /** What the verification read shows; `value` makes it an input-like element. */
  shown: { innerText: string } | { value: string } = { innerText: '' };
  /** Recognition throws (detached target). */
  detached = false;
  /** The target no longer matches anything (its text/placeholder changed). */
  targetGone = false;
  /** The target also matches a mirrored preview showing `mirror`. */
  mirrored = false;
  mirror: { innerText: string } = { innerText: '' };
  /** Run after `insertText` — the recipe's own DOM change. */
  afterInsert: () => void = () => {};
  /** Whether focusing the target leaves focus inside it (a type's precondition). */
  focusable = true;
  page: Page;
  keyboard = {
    press: vi.fn(async (key: string) => void this.calls.push(`press ${key}`)),
    insertText: vi.fn(async (text: string) => {
      this.calls.push(`insertText ${text}`);
      this.afterInsert();
    }),
  };

  constructor() {
    this.page = {
      keyboard: this.keyboard,
      locator: (sel: string) => this.loc(`page>>${sel}`),
      url: () => 'http://app.test/edit',
    } as unknown as Page;
  }

  present(desc: string): boolean {
    if (this.targetGone && desc.startsWith('target')) return false;
    return ![...this.missing].some((m) => desc.includes(m));
  }

  /** The fake DOM element an evaluate runs against. */
  element(desc: string): unknown {
    if (desc === 'target') return { tagName: 'INPUT', closest: (sel: string) => (this.closest.has(sel) ? { root: sel } : null), contains: (n: unknown) => n === FOCUSED && this.focusable };
    const shown = this.mirrored && desc.startsWith('target') && desc.includes('.last') ? this.mirror : this.shown;
    return { ...shown, matches: (sel: string) => desc === `root(${sel})`, blur: () => void this.calls.push(`blur ${desc}`) };
  }

  loc(desc: string): Locator {
    const world = this;
    const self = {
      desc,
      locator: (sel: string) => world.loc(`${desc}>>${sel}`),
      and: (other: { desc: string }) => world.loc(`${desc}&${other.desc}`),
      first: () => world.loc(`${desc}.first`),
      last: () => world.loc(`${desc}.last`),
      filter: (o: { hasText: string }) => world.loc(`${desc}[hasText=${o.hasText}]`),
      count: async () => (world.present(desc) ? 1 : 0),
      click: async (o: { timeout: number }) => {
        if (!world.present(desc)) throw new Error(`timeout waiting for ${desc}`);
        world.calls.push(`click ${desc} t=${o.timeout}`);
      },
      fill: async (text: string, o: { timeout: number }) => void world.calls.push(`fill ${desc} ${text} t=${o.timeout}`),
      pressSequentially: async (text: string, o: unknown) => void world.calls.push(`pressSequentially ${desc} ${text} ${JSON.stringify(o)}`),
      focus: async () => void world.calls.push(`focus ${desc}`),
      evaluate: async (fn: (el: unknown, arg: unknown) => unknown, arg: unknown, o?: { timeout: number }) => {
        if (!world.present(desc)) throw new Error(`timeout waiting for ${desc}`);
        world.calls.push(`evaluate ${desc}${o ? ` t=${o.timeout}` : ''}`);
        return fn(world.element(desc), arg);
      },
      elementHandle: async (o: { timeout: number }) => {
        if (desc === 'target' && world.detached) throw new Error('Target closed');
        if (!world.present(desc)) throw new Error(`timeout waiting for ${desc}`);
        world.calls.push(`elementHandle ${desc} t=${o.timeout}`);
        return world.handle(desc);
      },
    };
    return self as unknown as Locator;
  }

  handle(desc: string): ElementHandle {
    const world = this;
    const self = {
      desc,
      $: async (sel: string) => (world.present(`${desc}>>${sel}`) ? world.handle(`${desc}>>${sel}`) : null),
      click: async (o: { timeout: number }) => void world.calls.push(`click ${desc} t=${o.timeout}`),
      fill: async (text: string, o: { timeout: number }) => void world.calls.push(`fill ${desc} ${text} t=${o.timeout}`),
      evaluate: async (fn: (el: unknown, arg: unknown) => unknown, arg: unknown) => {
        world.calls.push(`evaluate ${desc}`);
        return fn(world.element(desc), arg);
      },
      evaluateHandle: async (fn: (el: unknown, arg: unknown) => unknown, arg: unknown) => {
        world.calls.push(`evaluateHandle ${desc}`);
        const hit = fn(world.element(desc), arg) as { root: string } | null;
        return {
          asElement: () => (hit ? world.handle(`root(${hit.root})`) : null),
          dispose: async () => void world.disposed.push(`jshandle ${desc}`),
        };
      },
      dispose: async () => void world.disposed.push(desc),
    };
    return self as unknown as ElementHandle;
  }
}

const monacoSeed = (): RecipeProcedure => ({ id: 'r_mon', ...SEED_RECIPES.find((s) => s.family === 'monaco' && s.intent === 'set-value')! });
const comboSeed = (): RecipeProcedure => ({ id: 'r_combo', ...SEED_RECIPES.find((s) => s.family === 'aria-combobox')! });
const MONACO_ROOT = 'root(.monaco-editor)';
const EDITABLE_ROOT = 'root([contenteditable="true"])';
const editableSeed = (): RecipeProcedure => ({ id: 'r_ce', ...SEED_RECIPES.find((s) => s.family === 'contenteditable')! });

function book(recipes: RecipeProcedure[], onAttempt = vi.fn()): RecipeBook & { onAttempt: ReturnType<typeof vi.fn> } {
  return { ...snapshotBook({ version: 1, recipes }), onAttempt };
}

/** What document.activeElement is while a test runs: the target contains it only when World.focusable. */
const FOCUSED = { focused: true };
vi.stubGlobal('document', { activeElement: FOCUSED });

let w: World;
beforeEach(() => {
  w = new World();
  vi.mocked(settleDom).mockClear();
  vi.mocked(reactSafeFill).mockClear();
  vi.mocked(reactSafeSelect).mockClear();
});

describe('seed table', () => {
  it('names every family once, most specific first, and every seed names a family', () => {
    expect(RECIPE_FAMILIES.map((f) => f.id)).toEqual(['monaco', 'codemirror6', 'prosemirror', 'contenteditable', 'aria-combobox']);
    expect(RECIPE_FAMILIES.map((f) => f.root)).toEqual(['.monaco-editor', '.cm-editor', '.ProseMirror', '[contenteditable="true"]', '[role="combobox"]']);
    for (const seed of SEED_RECIPES) {
      expect(recipeFamilyOf(seed.family), seed.family).toBeDefined();
      if (seed.intent === 'set-value') expect(JSON.stringify(seed.steps)).toContain('{{value}}');
    }
    // one procedure per (family, intent)
    const keys = SEED_RECIPES.map((s) => `${s.family}/${s.intent}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['monaco/set-value', 'monaco/read-value', 'codemirror6/set-value', 'codemirror6/read-value', 'prosemirror/set-value', 'contenteditable/set-value', 'aria-combobox/select-option']);
  });

  it("carries each family's click/blur/verify targets as the daemon's seeds named them", () => {
    const monaco = SEED_RECIPES.find((s) => s.family === 'monaco' && s.intent === 'set-value')!;
    expect(monaco.verifyRead).toBe('.view-lines');
    expect(monaco.steps).toEqual(editorSetValueSteps(undefined, 'textarea'));
    const cm = SEED_RECIPES.find((s) => s.family === 'codemirror6' && s.intent === 'set-value')!;
    expect(cm.verifyRead).toBe('.cm-content');
    expect(cm.steps).toEqual(editorSetValueSteps('.cm-content', '.cm-content'));
    expect(SEED_RECIPES.find((s) => s.family === 'prosemirror')!.steps).toEqual(editorSetValueSteps(undefined, undefined, { escape: false }));
    expect(SEED_RECIPES.find((s) => s.family === 'contenteditable')!.steps).toEqual(editorSetValueSteps(undefined, undefined, { escape: false }));
    // the combobox types, then clicks the portal option carrying the payload
    expect(comboSeed().steps.map((s) => s.action)).toEqual(['click', 'press', 'insertText', 'settle', 'click', 'settle']);
    expect(comboSeed().steps[4]).toEqual({ action: 'click', target: 'page:[role="option"]', withText: '{{value}}' });
    // select-all -> replace -> settle -> Escape -> blur -> settle
    expect(editorSetValueSteps('.a', '.b')).toEqual([
      { action: 'click', target: '.a' },
      { action: 'press', key: 'ControlOrMeta+a' },
      { action: 'insertText', text: '{{value}}' },
      { action: 'settle', ms: 400 },
      { action: 'press', key: 'Escape' },
      { action: 'blur', target: '.b' },
      { action: 'settle', ms: 200 },
    ]);
  });

  // fwvk1: Vikunja's tiptap description discards the edit on Escape, so the
  // prosemirror seed failed every verification and was demoted. Only a code
  // editor has a completion widget for Escape to dismiss.
  it('presses Escape only in the code editors, never in a rich-text one', () => {
    const presses = (family: string) =>
      SEED_RECIPES.find((s) => s.family === family && s.intent === 'set-value')!.steps.filter((s) => s.action === 'press').map((s) => s.key);
    expect(presses('monaco')).toEqual(['ControlOrMeta+a', 'Escape']);
    expect(presses('codemirror6')).toEqual(['ControlOrMeta+a', 'Escape']);
    expect(presses('prosemirror')).toEqual(['ControlOrMeta+a']);
    expect(presses('contenteditable')).toEqual(['ControlOrMeta+a']);
  });

  it("is the store's seed list, ids assigned by the store", () => {
    const stored = seedRecipes();
    expect(stored.map(({ family, intent, steps, verifyRead }) => ({ family, intent, steps, ...(verifyRead ? { verifyRead } : {}) }))).toEqual(SEED_RECIPES);
    expect(stored.map((r) => r.id)).toEqual(SEED_RECIPES.map((s) => seedRecipeId(s.family, s.intent)));
    expect(stored.every((r) => r.seeded && r.status === 'provisional')).toBe(true);
  });
});

describe('recognizeComponent', () => {
  it('pins the nearest root of the first matching family, in family order', async () => {
    // CodeMirror's .cm-content IS contenteditable: codemirror6 must win.
    w.closest.add('.cm-editor').add('[contenteditable="true"]');
    const rec = await recognizeComponent(w.page, w.loc('target'));
    expect(rec?.family.id).toBe('codemirror6');
    expect((rec?.root as unknown as { desc: string }).desc).toBe('root(.cm-editor)');
    expect(w.calls).toEqual(['elementHandle target t=1500', 'evaluateHandle target', 'evaluate root(.cm-editor)']);
    expect(w.disposed).toEqual(['target']);
  });
  it('is null outside every family, and on a target that cannot be evaluated, leaving no handle behind', async () => {
    expect(await recognizeComponent(w.page, w.loc('target'))).toBeNull();
    expect(w.disposed).toEqual(['jshandle target', 'target']);
    w.closest.add('.monaco-editor');
    w.detached = true;
    expect(await recognizeComponent(w.page, w.loc('target'))).toBeNull();
  });
});

describe('executeRecipe', () => {
  it("runs the editor steps in the daemon's order, settling through settleDom", async () => {
    const root = w.handle(MONACO_ROOT);
    await executeRecipe(w.page, root, monacoSeed(), 'notes for run x77');
    expect(w.calls).toEqual([
      `click ${MONACO_ROOT} t=${RECIPE_STEP_TIMEOUT_MS}`,
      'press ControlOrMeta+a',
      'insertText notes for run x77',
      'press Escape',
      `evaluate ${MONACO_ROOT}>>textarea`,
      `blur ${MONACO_ROOT}>>textarea`,
    ]);
    expect(settleDom).toHaveBeenCalledTimes(2);
    expect(settleDom).toHaveBeenCalledWith(w.page);
    // the child handle is disposed; the root belongs to the caller
    expect(w.disposed).toEqual([`${MONACO_ROOT}>>textarea`]);
  });

  it('a blur with no target blurs the root itself', async () => {
    const root = w.handle(EDITABLE_ROOT);
    await executeRecipe(w.page, root, editableSeed(), 'v');
    expect(w.calls.filter((c) => c.startsWith('blur'))).toEqual([`blur ${EDITABLE_ROOT}`]);
    expect(w.disposed).toEqual([]);
  });

  it('skips a blur target the widget does not have, but throws on a click or fill target it lacks', async () => {
    const root = w.handle('root');
    w.missing.add('textarea');
    await executeRecipe(w.page, root, monacoSeed(), 'v');
    expect(w.calls.filter((c) => c.startsWith('blur'))).toEqual([]);
    w.calls = [];
    w.missing.add('.gone');
    await expect(executeRecipe(w.page, root, { id: 'r_x', family: 'f', intent: 'set-value', steps: [{ action: 'click', target: '.gone' }] }, 'v')).rejects.toThrow('recipe r_x: no ".gone" inside the component');
    await expect(executeRecipe(w.page, root, { id: 'r_y', family: 'f', intent: 'set-value', steps: [{ action: 'fill', target: '.gone', text: '{{value}}' }] }, 'v')).rejects.toThrow('recipe r_y: no ".gone" inside the component');
    expect(w.calls).toEqual([]);
  });

  it('fills the payload into a root-relative target, and clicks a page-scoped option carrying it', async () => {
    const root = w.handle('root');
    await executeRecipe(w.page, root, comboSeed(), 'apricot x1');
    expect(w.calls).toEqual([
      `click root t=${RECIPE_STEP_TIMEOUT_MS}`,
      'press ControlOrMeta+a',
      'insertText apricot x1',
      `click page>>[role="option"][hasText=apricot x1].first t=${RECIPE_STEP_TIMEOUT_MS}`,
    ]);
    w.calls = [];
    await executeRecipe(w.page, root, { id: 'r_f', family: 'f', intent: 'set-value', steps: [{ action: 'fill', target: 'input', text: 'pre {{value}} post' }] }, 'V');
    expect(w.calls).toEqual([`fill root>>input pre V post t=${RECIPE_STEP_TIMEOUT_MS}`]);
    expect(w.disposed).toEqual(['root>>input']);
  });
});

describe('verifyRecipe', () => {
  it('squashes NBSP and whitespace on both sides before the containment check', () => {
    expect(squashText('notes for run  x77\n')).toBe('notes for run x77');
    expect(squashText('  a  \n b ')).toBe('a b');
  });
  it('re-observes the payload through the verification read, value or text', async () => {
    const root = w.handle('root');
    w.shown = { innerText: 'line one\nnotes for run x77' };
    expect(await readComponentValue(root, { verifyRead: '.view-lines' })).toBe('line one\nnotes for run x77');
    expect(w.calls).toEqual(['evaluate root>>.view-lines']);
    expect(await verifyRecipe(root, { verifyRead: '.view-lines' }, 'notes for run x77')).toBe(true);
    expect(await verifyRecipe(root, { verifyRead: '.view-lines' }, 'something else')).toBe(false);
    w.shown = { value: 'typed value' };
    expect(await verifyRecipe(root, {}, 'typed value')).toBe(true);
    expect(w.calls.at(-1)).toBe('evaluate root');
  });
  // fwvk1: a learned prosemirror recipe that appends "verified" on a
  // description holding the value twice, and every replay saved it doubled.
  it('holds a set-value recipe to exactly the payload, and anything else to containment', async () => {
    const root = w.handle('root');
    w.shown = { innerText: 'Bench task created for run n2Bench task created for run n2' };
    expect(await verifyRecipe(root, { intent: 'set-value' }, 'Bench task created for run n2')).toBe(false);
    expect(await verifyRecipe(root, {}, 'Bench task created for run n2', 'set-value')).toBe(false);
    expect(await verifyRecipe(root, { intent: 'select-option' }, 'Bench task created for run n2')).toBe(true);
    w.shown = { innerText: '  Bench task created for run n2\n' };
    expect(await verifyRecipe(root, { intent: 'set-value' }, 'Bench task created for run n2')).toBe(true);
  });
  it('an appending set-value recipe is an unverified attempt, and the native setter takes over', async () => {
    w.closest.add('.ProseMirror');
    w.shown = { innerText: 'old body new body' };
    const appends: RecipeProcedure = { id: 'r_app', family: 'prosemirror', intent: 'set-value', steps: [{ action: 'click' }, { action: 'insertText', text: '{{value}}' }] };
    const target = w.loc('target');
    expect(await fillWithRecipe(w.page, target, 'new body', book([appends]))).toBeNull();
    expect(reactSafeFill).toHaveBeenCalledWith(target, 'new body');
  });
  it('is false when the read node is missing — an unobservable effect is a failure, not a pass', async () => {
    const root = w.handle('root');
    w.missing.add('.view-lines');
    w.shown = { innerText: 'v' };
    expect(await readComponentValue(root, { verifyRead: '.view-lines' })).toBeNull();
    expect(await verifyRecipe(root, { verifyRead: '.view-lines' }, 'v')).toBe(false);
    // ...and an empty payload verifies on any readable node
    expect(await verifyRecipe(root, {}, '')).toBe(true);
  });
});

describe('applyRecipe', () => {
  it('attempts nothing — not even recognition — when the book offers no recipe for the intent', async () => {
    w.closest.add('.monaco-editor');
    const b = book([monacoSeed()]);
    expect(await applyRecipe(w.page, w.loc('target'), 'select-option', 'v', b)).toBeNull();
    expect(w.calls).toEqual([]);
    expect(b.onAttempt).not.toHaveBeenCalled();
  });
  it('attempts nothing on an unrecognized target, or a family the book has no recipe for', async () => {
    const b = book([monacoSeed()]);
    expect(await applyRecipe(w.page, w.loc('target'), 'set-value', 'v', b)).toBeNull();
    w.closest.add('.ProseMirror');
    expect(await applyRecipe(w.page, w.loc('target'), 'set-value', 'v', b)).toBeNull();
    expect(w.calls).toEqual(['elementHandle target t=1500', 'evaluateHandle target', 'elementHandle target t=1500', 'evaluateHandle target', 'evaluate root(.ProseMirror)']);
    expect(b.onAttempt).not.toHaveBeenCalled();
    // a recognised root the book has no recipe for is not leaked
    expect(w.disposed).toEqual(['jshandle target', 'target', 'target', 'root(.ProseMirror)']);
  });
  it('executes, verifies, then reports: a verified attempt', async () => {
    w.closest.add('.monaco-editor');
    w.shown = { innerText: 'notes x' };
    const b = book([monacoSeed()]);
    const attempt = await applyRecipe(w.page, w.loc('target'), 'set-value', 'notes x', b);
    expect(attempt).toEqual({ family: 'monaco', intent: 'set-value', recipe: monacoSeed(), ok: true });
    expect(b.onAttempt).toHaveBeenCalledWith(attempt);
    // the verification read came AFTER the last step
    expect(w.calls.at(-1)).toBe(`evaluate ${MONACO_ROOT}>>.view-lines`);
    expect(w.disposed.at(-1)).toBe(MONACO_ROOT);
    expect(describeRecipeAttempt(attempt!)).toBe('filled via recipe monaco/set-value (r_mon); value verified on the component');
    expect(describeRecipeAttempt({ ...attempt!, intent: 'select-option' })).toBe('selected via recipe monaco/select-option (r_mon); value verified on the component');
  });
  it('an attempt that ran but could not re-observe the payload is not handled, and is still reported', async () => {
    w.closest.add('.monaco-editor');
    w.shown = { innerText: 'the default markdown' };
    const b = book([monacoSeed()]);
    const attempt = await applyRecipe(w.page, w.loc('target'), 'set-value', 'notes x', b);
    expect(attempt).toEqual({ family: 'monaco', intent: 'set-value', recipe: monacoSeed(), ok: false });
    expect(b.onAttempt).toHaveBeenCalledWith(attempt);
  });
  it('a step that cannot run is an unverified attempt carrying its reason, and the root is still disposed', async () => {
    w.closest.add('.monaco-editor');
    w.missing.add('.gone');
    const recipe: RecipeProcedure = { id: 'r_bad', family: 'monaco', intent: 'set-value', steps: [{ action: 'click', target: '.gone' }] };
    const b = book([recipe]);
    const attempt = await applyRecipe(w.page, w.loc('target'), 'set-value', 'v', b);
    expect(attempt).toEqual({ family: 'monaco', intent: 'set-value', recipe, ok: false, error: 'recipe r_bad: no ".gone" inside the component' });
    expect(b.onAttempt).toHaveBeenCalledTimes(1);
    expect(w.disposed).toEqual(['target', MONACO_ROOT]);
  });
  it('a bookkeeping failure never changes the outcome: a verified attempt stays verified, with a warning', async () => {
    w.closest.add('.monaco-editor');
    w.shown = { innerText: 'notes x' };
    const eperm = vi.fn(() => {
      throw new Error("EPERM: operation not permitted, rename 'components.json.tmp' -> 'components.json'");
    });
    const attempt = await fillWithRecipe(w.page, w.loc('target'), 'notes x', book([monacoSeed()], eperm));
    expect(eperm).toHaveBeenCalledTimes(1);
    expect(attempt?.ok).toBe(true);
    expect(attempt?.warning).toBe("recipe outcome not recorded: EPERM: operation not permitted, rename 'components.json.tmp' -> 'components.json'");
    expect(reactSafeFill).not.toHaveBeenCalled();
    expect(describeRecipeAttempt(attempt!)).toBe(
      "filled via recipe monaco/set-value (r_mon); value verified on the component (warning: recipe outcome not recorded: EPERM: operation not permitted, rename 'components.json.tmp' -> 'components.json')",
    );
    // ...and an unverified one still falls back to the native setter rather than throwing
    w.shown = { innerText: 'not it' };
    expect(await fillWithRecipe(w.page, w.loc('target'), 'notes x', book([monacoSeed()], eperm))).toBeNull();
    expect(reactSafeFill).toHaveBeenCalledTimes(1);
  });
});

describe('the component root is pinned at recognition', () => {
  it('a target that stops matching mid-recipe: every step and the verification act on the recognised root, and native never runs', async () => {
    // a hasText/placeholder target on a contenteditable: replacing the content un-matches it
    w.closest.add('[contenteditable="true"]');
    w.shown = { innerText: 'the new body' };
    w.afterInsert = () => {
      w.targetGone = true;
    };
    const b = book([editableSeed()]);
    const attempt = await fillWithRecipe(w.page, w.loc('target'), 'the new body', b);
    expect(w.targetGone).toBe(true);
    expect(attempt).toEqual({ family: 'contenteditable', intent: 'set-value', recipe: editableSeed(), ok: true });
    expect(b.onAttempt).toHaveBeenCalledWith(attempt);
    expect(reactSafeFill).not.toHaveBeenCalled();
    // nothing after recognition went back through the target
    expect(w.calls.filter((c) => c.includes('target'))).toEqual(['elementHandle target t=1500', 'evaluateHandle target']);
    expect(w.calls).toContain(`blur ${EDITABLE_ROOT}`);
    expect(w.calls.at(-1)).toBe(`evaluate ${EDITABLE_ROOT}`);
    expect(w.disposed).toEqual(['target', EDITABLE_ROOT]);
  });

  it('a target that matches a mirrored preview after the recipe: verification reads the recognised root, so a miss there is not reported as success', async () => {
    w.closest.add('[contenteditable="true"]');
    // the real editor did not take the payload; a preview the target selector also matches shows it
    w.shown = { innerText: 'starting content' };
    w.mirror = { innerText: 'the new body' };
    w.afterInsert = () => {
      w.mirrored = true;
    };
    const b = book([editableSeed()]);
    const target = w.loc('target');
    expect(await fillWithRecipe(w.page, target, 'the new body', b)).toBeNull();
    expect(w.mirrored).toBe(true);
    expect(b.onAttempt).toHaveBeenCalledWith({ family: 'contenteditable', intent: 'set-value', recipe: editableSeed(), ok: false });
    // unverified: the native setter runs on the same target
    expect(reactSafeFill).toHaveBeenCalledWith(target, 'the new body');
    expect(w.calls.filter((c) => c.startsWith('evaluate ')).at(-1)).toBe(`evaluate ${EDITABLE_ROOT}`);
  });
});

describe('the ladders', () => {
  it('fill: a verified recipe means the native setter never runs', async () => {
    w.closest.add('.monaco-editor');
    w.shown = { innerText: 'v' };
    const attempt = await fillWithRecipe(w.page, w.loc('target'), 'v', book([monacoSeed()]));
    expect(attempt?.ok).toBe(true);
    expect(reactSafeFill).not.toHaveBeenCalled();
  });
  it('fill: an unverified recipe, or none, falls back to the native setter on the same target', async () => {
    w.closest.add('.monaco-editor');
    w.shown = { innerText: 'not it' };
    const target = w.loc('target');
    expect(await fillWithRecipe(w.page, target, 'v', book([monacoSeed()]))).toBeNull();
    expect(reactSafeFill).toHaveBeenCalledWith(target, 'v');
    expect(await fillWithRecipe(w.page, target, 'v', book([]))).toBeNull();
    expect(reactSafeFill).toHaveBeenCalledTimes(2);
  });
  it("type: the same set-value recipe, else pressSequentially with the caller's options", async () => {
    w.closest.add('.monaco-editor');
    w.shown = { innerText: 'typed' };
    const target = w.loc('target');
    expect((await typeWithRecipe(w.page, target, 'typed', book([monacoSeed()]), { timeout: 10_000, delay: 20 }))?.ok).toBe(true);
    expect(w.calls.some((c) => c.startsWith('pressSequentially'))).toBe(false);
    expect(await typeWithRecipe(w.page, target, 'typed', book([]), { timeout: 10_000, delay: 20 })).toBeNull();
    expect(w.calls.at(-1)).toBe('pressSequentially target typed {"timeout":10000,"delay":20}');
  });
  // fwsi1 03-create: keys for select2's non-focusable <span> went to the asset name.
  it('type: a target that does not hold focus once focused is refused before any key is sent', async () => {
    w.focusable = false;
    const target = w.loc('target');
    await expect(typeWithRecipe(w.page, target, 'Bench Laptop Model', book([]))).rejects.toThrow(/cannot take keyboard focus/);
    expect(w.calls).toContain('focus target');
    expect(w.calls.some((c) => c.startsWith('pressSequentially'))).toBe(false);
  });
  it('select: the select-option recipe, else reactSafeSelect with the recorded fallback', async () => {
    w.closest.add('[role="combobox"]');
    w.shown = { value: 'apricot x1' };
    const target = w.loc('target');
    const viaRecipe = await selectWithRecipe(w.page, target, 'apricot x1', book([comboSeed()]), 'id-9');
    expect(viaRecipe.attempt?.ok).toBe(true);
    expect(viaRecipe.selected).toBeNull();
    expect(reactSafeSelect).not.toHaveBeenCalled();
    const native = await selectWithRecipe(w.page, target, 'apricot x1', book([]), 'id-9');
    expect(native).toEqual({ attempt: null, selected: ['opt-1'] });
    expect(reactSafeSelect).toHaveBeenCalledWith(target, 'apricot x1', 'id-9');
  });
});

describe('snapshotRecipes', () => {
  const learned = (over: Partial<Recipe>): Recipe => ({
    id: 'r_learn1',
    family: 'monaco',
    intent: 'set-value',
    steps: [{ action: 'click' }, { action: 'insertText', text: '{{value}}' }, { action: 'settle', ms: 300 }],
    verifyRead: '.view-lines',
    status: 'provisional',
    stats: { uses: 0, successes: 0, origins: {}, failStreak: 0, created: 't' },
    provenance: { session: 'sess-1', created: 't' },
    ...over,
  });

  it('a seed-only store snapshots every seed as a bare procedure with nothing to diagnose', () => {
    const { recipes, diagnostics } = snapshotRecipes(seedRecipes());
    expect(diagnostics).toEqual([]);
    expect(recipes.version).toBe(1);
    expect(recipes.recipes).toEqual(SEED_RECIPES.map((s) => ({ id: seedRecipeId(s.family, s.intent), ...s })));
    // serialisable: no status, stats or provenance travel
    const parsed = JSON.parse(JSON.stringify(recipes)) as RecipeSnapshot;
    expect(parsed).toEqual(recipes);
    expect(Object.keys(parsed.recipes[0]).sort()).toEqual(['family', 'id', 'intent', 'steps', 'verifyRead']);
    const b = snapshotBook(parsed);
    expect(b.offers('set-value')).toBe(true);
    expect(b.offers('open')).toBe(false);
    expect(b.choose('monaco', 'set-value')?.id).toBe(seedRecipeId('monaco', 'set-value'));
    expect(b.choose('aria-combobox', 'set-value')).toBeNull();
  });

  it('a learned variant the store would pick travels, and is diagnosed as learned', () => {
    const { recipes, diagnostics } = snapshotRecipes([learned({ status: 'validated' }), ...seedRecipes()]);
    expect(recipes.recipes.find((r) => r.family === 'monaco' && r.intent === 'set-value')).toEqual({
      id: 'r_learn1', family: 'monaco', intent: 'set-value', steps: learned({}).steps, verifyRead: '.view-lines',
    });
    expect(recipes.recipes.filter((r) => r.family === 'monaco' && r.intent === 'set-value')).toHaveLength(1);
    expect(diagnostics).toEqual(['monaco/set-value: uses learned recipe r_learn1 learned in session sess-1 (validated) rather than the shipped seed; the artifact carries it as data']);
    // a provisional learned variant loses to the seed on ties only by the seeded rank — pickRecipe's own rule, unchanged
    const tie = snapshotRecipes([learned({}), ...seedRecipes()]);
    expect(tie.recipes.recipes.find((r) => r.family === 'monaco' && r.intent === 'set-value')!.id).toBe('r_learn1');
  });

  it('a demoted seed is omitted and diagnosed, and a family left with nothing usable is named', () => {
    const seeds = seedRecipes();
    const cm = seeds.find((r) => r.family === 'codemirror6' && r.intent === 'set-value')!;
    cm.status = 'demoted';
    cm.stats.failStreak = 2;
    const { recipes, diagnostics } = snapshotRecipes(seeds);
    expect(recipes.recipes.some((r) => r.family === 'codemirror6' && r.intent === 'set-value')).toBe(false);
    expect(recipes.recipes).toHaveLength(SEED_RECIPES.length - 1);
    expect(diagnostics).toEqual([
      `codemirror6/set-value: seed recipe ${cm.id} is demoted in the component store (2 consecutive verification failures); the snapshot omits it`,
      'codemirror6/set-value: no usable recipe; the artifact falls back to the native primitive on this family, as the daemon does today',
    ]);
    // a demoted learned variant beside a live seed: diagnosed, seed chosen, no "nothing usable"
    const withDemotedLearned = snapshotRecipes([learned({ status: 'demoted', stats: { uses: 2, successes: 0, origins: {}, failStreak: 2, created: 't' } }), ...seedRecipes()]);
    expect(withDemotedLearned.recipes.recipes.find((r) => r.family === 'monaco' && r.intent === 'set-value')!.id).toBe(seedRecipeId('monaco', 'set-value'));
    expect(withDemotedLearned.diagnostics).toEqual(['monaco/set-value: learned recipe r_learn1 is demoted in the component store (2 consecutive verification failures); the snapshot omits it']);
  });
});
