import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ElementHandle, Locator, Page } from 'playwright-core';
import type { RecordedEntry, RecordedStep } from '../daemon/recorder.js';
import {
  applyRecipe,
  describeRecipeAttempt,
  RECIPE_FAMILIES,
  recipeFamilyOf,
  recognizeComponent,
  SEED_RECIPES,
  type RecipeAttempt,
  type RecipeBook,
  type RecipeFamily,
  type RecipeIntent,
  type RecipeProcedure,
  type RecipeSnapshot,
  type RecipeStep,
  type RecognizedComponent,
} from '../execution/recipes.js';
import { rootDir } from '../shared/paths.js';
import { countTokenOccurrences } from './compile.js';
import { originOf } from './store.js';

export {
  applyRecipe,
  executeRecipe,
  readComponentValue,
  recognizeComponent,
  squashText,
  verifyRecipe,
  type RecipeAttempt,
  type RecipeBook,
  type RecipeIntent,
  type RecipeProcedure,
  type RecipeSnapshot,
  type RecipeStep,
  type RecognizedComponent,
} from '../execution/recipes.js';

/**
 * Component recipes (PLAN-component-recipes): origin-INDEPENDENT
 * micro-procedures for third-party widgets that defeat the naive
 * fill/type/select primitives — monaco, CodeMirror, contenteditable editors,
 * portal-rendered comboboxes. A recipe is a short action list with the
 * payload parameterised as {{value}}, plus a mandatory verification read:
 * a recipe that cannot re-observe its own effect did not succeed. Component
 * knowledge is cross-app by construction (monaco is monaco everywhere), so
 * the store is keyed by component family, never by origin — app knowledge
 * stays in the session briefing, exactly as before.
 *
 * The RUNNER — families, seed procedures, recognition, execution,
 * verification and the fill/type/select ladders — is the shared
 * src/execution/recipes.ts, which the standalone artifact embeds. This module
 * is the daemon's store: which recipe serves a family (learned variants,
 * statuses, demotion, stats), and the snapshot of that choice an artifact
 * carries.
 */

export type ComponentFamily = RecipeFamily;

/** A stored recipe: the runnable procedure plus its lifecycle. */
export interface Recipe extends RecipeProcedure {
  status: 'provisional' | 'validated' | 'demoted';
  stats: RecipeStats;
  /** Shipped with sitelooper rather than learned; still starts provisional. */
  seeded?: boolean;
  provenance?: { session?: string; instruction?: string; created: string };
}

export interface RecipeStats {
  uses: number;
  successes: number;
  /** Verified successes per origin — cross-origin success is what proves the knowledge is component-level. */
  origins: Record<string, number>;
  /** Consecutive verification failures; two in a row demotes. */
  failStreak: number;
  created: string;
  lastUsed?: string;
}

/** The recognition set, shared with the artifact (src/execution/recipes.ts). */
export const FAMILIES: ComponentFamily[] = RECIPE_FAMILIES;

export function familyOf(id: string): ComponentFamily | undefined {
  return recipeFamilyOf(id);
}

const SEED_CREATED = '2026-08-25T00:00:00Z';

function seedStats(): RecipeStats {
  return { uses: 0, successes: 0, origins: {}, failStreak: 0, created: SEED_CREATED };
}

/** A seed's store id: stable across versions, so components.json outcomes keep attaching to it. */
export function seedRecipeId(family: string, intent: RecipeIntent): string {
  return `r_${crypto.createHash('sha1').update(`${family}\n${intent}\nseed`).digest('hex').slice(0, 6)}`;
}

/**
 * The shipped starter library as the store sees it: the shared SEED_RECIPES
 * procedures with their ids and lifecycle. Seeds are a floor, not an
 * authority: they enter the lifecycle provisional, must verify on first
 * contact, and can be demoted or superseded by learned variants when a
 * library version changes behaviour.
 */
export function seedRecipes(): Recipe[] {
  return SEED_RECIPES.map((seed) => ({
    id: seedRecipeId(seed.family, seed.intent),
    family: seed.family,
    intent: seed.intent,
    steps: seed.steps.map((s) => ({ ...s })),
    ...(seed.verifyRead ? { verifyRead: seed.verifyRead } : {}),
    status: 'provisional',
    stats: seedStats(),
    seeded: true,
    provenance: { created: SEED_CREATED },
  }));
}

/** Where recipes live: `$SITELOOPER_COMPONENTS_FILE` or `<home>/components.json`. */
export function componentsFile(): string {
  return process.env.SITELOOPER_COMPONENTS_FILE || path.join(rootDir(), 'components.json');
}

/**
 * One JSON file, global (NOT per origin — that is the point). Reads are fresh
 * per access, like SkillStore. Seeds are merged in for any (family, intent)
 * with no stored recipe, and materialise into the file on first outcome.
 */
export class ComponentStore {
  constructor(readonly file: string = componentsFile()) {}

  private read(): Recipe[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(raw?.recipes) ? (raw.recipes as Recipe[]) : [];
    } catch {
      return [];
    }
  }

  private write(recipes: Recipe[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, recipes }, null, 1));
    fs.renameSync(tmp, this.file);
  }

  /** Stored recipes plus seeds for any (family, intent) not represented. */
  list(): Recipe[] {
    const stored = this.read();
    const covered = new Set(stored.map((r) => `${r.family}\n${r.intent}`));
    return [...stored, ...seedRecipes().filter((s) => !covered.has(`${s.family}\n${s.intent}`))];
  }

  get(id: string): Recipe | null {
    return this.list().find((r) => r.id === id) ?? null;
  }

  put(recipe: Recipe): void {
    const stored = this.read().filter((r) => r.id !== recipe.id);
    stored.push(recipe);
    this.write(stored);
  }

  /**
   * Same lifecycle as skills, with cross-origin weighting: a verified success
   * on a SECOND origin counts double, because working on two different apps
   * is what proves the knowledge is component-level rather than app-level in
   * disguise. Two consecutive verification failures demote.
   */
  recordOutcome(id: string, ok: boolean, origin: string, now = new Date().toISOString()): Recipe | null {
    const recipe = this.get(id);
    if (!recipe) return null;
    const st = recipe.stats;
    st.uses += 1;
    st.lastUsed = now;
    if (ok) {
      st.successes += 1;
      st.origins[origin] = (st.origins[origin] ?? 0) + 1;
      st.failStreak = 0;
      const distinctOrigins = Object.keys(st.origins).length;
      if (recipe.status === 'provisional' && st.successes + Math.max(0, distinctOrigins - 1) >= 2) {
        recipe.status = 'validated';
      }
    } else {
      st.failStreak += 1;
      if (st.failStreak >= 2) recipe.status = 'demoted';
    }
    this.put(recipe);
    return recipe;
  }
}

/** Best recipe for a (family, intent): validated first, then track record. */
export function pickRecipe(recipes: Recipe[], family: string, intent: RecipeIntent): Recipe | null {
  return (
    recipes
      .filter((r) => r.family === family && r.intent === intent && r.status !== 'demoted')
      .sort((a, b) => {
        const rank = (r: Recipe) => (r.status === 'validated' ? 1 : 0);
        return rank(b) - rank(a) || b.stats.successes - a.stats.successes || Number(Boolean(a.seeded)) - Number(Boolean(b.seeded));
      })[0] ?? null
  );
}

/**
 * Which component (if any) the target element sits inside: nearest matching
 * ancestor, first family in FAMILIES order wins. The shared recognition,
 * with the root pinned as an ElementHandle the caller disposes.
 */
export function recognize(locator: Locator): Promise<RecognizedComponent | null> {
  return recognizeComponent(locator.page(), locator);
}

/** The component annotation recorded on a step, for recipe compilation. */
export interface StepComponent {
  family: string;
  /** CSS path of the acted-on element relative to the component root ('' = root). */
  rel: string;
}

/**
 * In-page component tagging for the recorder: one evaluate, all families.
 * Returns the first matching family and the element's root-relative path.
 */
export async function tagComponent(locator: Locator): Promise<StepComponent | null> {
  let el: ElementHandle | null = null;
  try {
    el = await locator.elementHandle({ timeout: 1_000 });
  } catch {
    return null;
  }
  if (!el) return null;
  try {
    return await el.evaluate((node, families) => {
      for (const f of families) {
        const root = (node as Element).closest(f.root);
        if (!root) continue;
        const segs: string[] = [];
        let n: Element | null = node as Element;
        while (n && n !== root) {
          const parent: Element | null = n.parentElement;
          if (!parent) break;
          const tag = n.tagName.toLowerCase();
          const same = Array.from(parent.children).filter((c) => c.tagName === n!.tagName);
          segs.unshift(`${tag}:nth-of-type(${same.indexOf(n) + 1})`);
          n = parent;
        }
        return { family: f.id, rel: segs.join(' > ') };
      }
      return null;
    }, FAMILIES.map((f) => ({ id: f.id, root: f.root })));
  } catch {
    return null;
  }
}

/**
 * The daemon's RecipeBook: the shared runner's view of the ComponentStore.
 * `offers` is the gate the old tryRecipe had ahead of recognition (no usable
 * recipe for the intent — the common case on a plain input — means
 * recognising the widget can only answer null); `choose` is pickRecipe over
 * a fresh read; every attempt, verified or not, is folded into the recipe's
 * lifecycle against the page's origin, so a cross-origin success can count.
 */
export function storeBook(store: ComponentStore, page: Page): RecipeBook {
  return {
    offers: (intent) => store.list().some((r) => r.intent === intent && r.status !== 'demoted'),
    choose: (family, intent) => pickRecipe(store.list(), family, intent),
    onAttempt: (attempt: RecipeAttempt) => {
      store.recordOutcome(attempt.recipe.id, attempt.ok, originOf(page.url()) ?? 'unknown');
    },
  };
}

/**
 * The tool-layer entry point: attempt the intent through a stored recipe.
 * Returns the tool result string on VERIFIED success, or null so the caller
 * falls back to the naive primitive (and then the model). Every attempt is
 * folded into the recipe's lifecycle.
 */
export async function tryRecipe(
  page: Page,
  target: Locator,
  intent: RecipeIntent,
  payload: string,
  store: ComponentStore = new ComponentStore(),
): Promise<string | null> {
  const attempt = await applyRecipe(page, target, intent, payload, storeBook(store, page));
  return attempt?.ok ? describeRecipeAttempt(attempt) : null;
}

/**
 * What an artifact carries in place of the store: the recipe pickRecipe would
 * choose for every (family, intent) the store knows, seeds and learned
 * variants alike, as bare procedures. `diagnostics` names the state a static
 * snapshot cannot express — a demoted recipe (the artifact never demotes or
 * validates; it runs what it was given), a (family, intent) left with no
 * usable recipe at all (both runners fall back to the native primitive there,
 * the artifact forever), and a chosen recipe that is learned rather than a
 * shipped seed (knowledge from this machine's store, travelling as data).
 * Pure over the store's list, so a compiler can call it without a page.
 */
export function snapshotRecipes(recipes: readonly Recipe[]): { recipes: RecipeSnapshot; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const chosen: RecipeProcedure[] = [];
  const keys = [...new Set(recipes.map((r) => `${r.family}\n${r.intent}`))];
  for (const key of keys) {
    const [family, intent] = key.split('\n') as [string, RecipeIntent];
    const own = recipes.filter((r) => r.family === family && r.intent === intent);
    for (const r of own.filter((r) => r.status === 'demoted')) {
      diagnostics.push(
        `${family}/${intent}: ${r.seeded ? 'seed' : 'learned'} recipe ${r.id} is demoted in the component store (${r.stats.failStreak} consecutive verification failures); the snapshot omits it`,
      );
    }
    const pick = pickRecipe(own, family, intent);
    if (!pick) {
      diagnostics.push(`${family}/${intent}: no usable recipe; the artifact falls back to the native primitive on this family, as the daemon does today`);
      continue;
    }
    if (!pick.seeded) {
      const from = pick.provenance?.session ? ` learned in session ${pick.provenance.session}` : '';
      diagnostics.push(`${family}/${intent}: uses learned recipe ${pick.id}${from} (${pick.status}) rather than the shipped seed; the artifact carries it as data`);
    }
    chosen.push({
      id: pick.id,
      family: pick.family,
      intent: pick.intent,
      steps: pick.steps.map((s) => ({ ...s })),
      ...(pick.verifyRead ? { verifyRead: pick.verifyRead } : {}),
    });
  }
  return { recipes: { version: 1, recipes: chosen }, diagnostics };
}

/** Family root selectors present on the page right now (one evaluate). */
export async function componentsOnPage(page: Page): Promise<ComponentFamily[]> {
  try {
    const present: string[] = await page.evaluate(
      (sels) => sels.filter((s) => Boolean(document.querySelector(s))),
      FAMILIES.map((f) => f.root),
    );
    return FAMILIES.filter((f) => present.includes(f.root));
  } catch {
    return [];
  }
}

/** The `[components]` line for the inner agent's instruction context. */
export function renderComponents(families: ComponentFamily[], store: ComponentStore = new ComponentStore()): string {
  if (!families.length) return '';
  const recipes = store.list();
  const parts = families
    .map((f) => {
      const intents = [...new Set(recipes.filter((r) => r.family === f.id && r.status !== 'demoted').map((r) => r.intent))];
      return intents.length ? `${f.id} (${intents.join(', ')})` : '';
    })
    .filter(Boolean);
  if (!parts.length) return '';
  return `[components] recognized widgets on this page: ${parts.join('; ')} — fill/type/select on elements inside them automatically use a stored, self-verifying recipe. Prefer plain fill/type/select over manual keyboard work there.`;
}

const MAX_RECIPE_STEPS = 8;
const MIN_RECIPE_STEPS = 2;
const RECIPE_TOOLS = new Set(['click', 'dblclick', 'fill', 'type', 'press']);

/**
 * Compile recipes from a recording: a maximal run of consecutive
 * agent-chosen steps (never replayed ones) inside ONE component family,
 * carrying a payload the instruction names (so it can be parameterised),
 * becomes a provisional set-value recipe. Conservative by construction:
 * bounded length, action primitives only, payload required.
 */
export function compileRecipes(
  entries: RecordedEntry[],
  instruction: string,
  opts: { session: string; now?: string } = { session: '' },
): Recipe[] {
  const steps = entries.filter((e): e is RecordedStep => e.k === 'step');
  const out: Recipe[] = [];
  let i = 0;
  while (i < steps.length) {
    const fam = steps[i].component?.family;
    if (!fam || steps[i].via || !RECIPE_TOOLS.has(steps[i].tool)) {
      i++;
      continue;
    }
    let j = i;
    while (j < steps.length && steps[j].component?.family === fam && !steps[j].via && RECIPE_TOOLS.has(steps[j].tool)) j++;
    const run = steps.slice(i, j);
    i = j;
    if (run.length < MIN_RECIPE_STEPS || run.length > MAX_RECIPE_STEPS) continue;
    // The payload: a typed value the instruction names, exactly once.
    const payload = run
      .map((s) => (s.tool === 'fill' ? String(s.args.value ?? '') : s.tool === 'type' ? String(s.args.text ?? '') : ''))
      .find((v) => v.trim().length >= 2 && countTokenOccurrences(instruction, v.trim()) === 1);
    if (!payload) continue;
    const family = familyOf(fam);
    if (!family) continue;
    const recipeSteps: RecipeStep[] = run.map((s) => {
      const rel = s.component?.rel || undefined;
      switch (s.tool) {
        case 'click':
        case 'dblclick':
          return { action: 'click', ...(rel ? { target: rel } : {}) };
        case 'press':
          return { action: 'press', key: String(s.args.key ?? '') };
        case 'type':
          return { action: 'insertText', text: String(s.args.text ?? '').split(payload).join('{{value}}') };
        case 'fill':
        default:
          return { action: 'fill', ...(rel ? { target: rel } : {}), text: String(s.args.value ?? '').split(payload).join('{{value}}') };
      }
    });
    recipeSteps.push({ action: 'settle', ms: 300 });
    const now = opts.now ?? new Date().toISOString();
    out.push({
      id: `r_${crypto.createHash('sha1').update(`${fam}\nset-value\n${JSON.stringify(recipeSteps)}\n${now}`).digest('hex').slice(0, 6)}`,
      family: fam,
      intent: 'set-value',
      steps: recipeSteps,
      ...(family.verifyRead ? { verifyRead: family.verifyRead } : {}),
      status: 'provisional',
      stats: { uses: 0, successes: 0, origins: {}, failStreak: 0, created: now },
      provenance: { session: opts.session, instruction, created: now },
    });
  }
  return out;
}

/** Store compiled recipes that are not structural duplicates of existing ones. */
export function learnRecipes(
  store: ComponentStore,
  entries: RecordedEntry[],
  instruction: string,
  session: string,
  now?: string,
): string[] {
  const compiled = compileRecipes(entries, instruction, { session, now });
  if (!compiled.length) return [];
  const existing = store.list();
  const recipeKey = (r: Recipe) => `${r.family}\n${r.intent}\n${JSON.stringify(r.steps)}`;
  const seen = new Set(existing.map(recipeKey));
  const stored: string[] = [];
  for (const r of compiled) {
    if (seen.has(recipeKey(r))) continue;
    seen.add(recipeKey(r));
    store.put(r);
    stored.push(r.id);
  }
  return stored;
}
