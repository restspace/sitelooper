/**
 * SITE FACTS stage 1, consumer 5 (notes/design/design-site-facts.md §2, §7.2):
 * a RELIABLE route fact rewrites the origin's STORED url patterns.
 *
 * - a `route.query` fact of `state` on a route: every stored pattern on that
 *   route (a procedure's `preconditions.urlPattern`, a step's
 *   `expect.urlPattern`) that carries the key with a LITERAL value has it
 *   written `key=:var` — fwop15-cv2's `?query_props={…filters…}` is view
 *   state, and a pattern that demands one filter set refuses every other;
 * - a `route.fragment` fact of `anchor` on the origin: a bare-word fragment
 *   (`/hardware/:id#history`, fwsi9/fwsi14) is stripped from those patterns —
 *   an in-page tab is not a page.
 *
 * Patterns only, never steps or locators. Each rewrite goes through
 * `store.update` (the revision bumps) and notes `factRewrites: [{k, key, at}]`
 * on the procedure. Idempotent: a rewritten pattern carries no literal and no
 * anchor, so a second pass finds nothing. A wildcard is never wrong, only
 * weaker: nothing here ever narrows a pattern, and a later contradiction of
 * the fact does not undo it.
 *
 * Called at learn time (learn.ts, after observeRouting) and at a flow run's
 * outcome flush (daemon/server.ts, beside flushSiteFacts). Never from the
 * compiled artifact: it has no store to rewrite.
 */
import { fragmentFact, reliable, routeQueryFact, routeTemplateOf, type SiteFacts } from '../execution/facts.js';
import { literal, rewriteQuery } from '../execution/facts-route.js';
import { originOf, urlShapeOf } from '../execution/url.js';
import { factStoreFor } from './facts-url.js';
import type { Skill, SkillStore } from './store.js';

export interface PatternRewrite {
  skill: string;
  /** `preconditions.urlPattern`, or `steps.<i>.expect.urlPattern` (0-based). */
  field: string;
  from: string;
  to: string;
}

type Noted = NonNullable<Skill['factRewrites']>[number];

/**
 * One pattern widened by the origin's reliable facts, and the facts that did
 * it. The pattern itself when nothing applies (or it is not a url on
 * `origin`).
 */
export function widenPattern(sf: SiteFacts, origin: string, pattern: string): { to: string; by: Omit<Noted, 'at'>[] } {
  const by: Omit<Noted, 'at'>[] = [];
  const shape = urlShapeOf(pattern);
  if (!shape || originOf(pattern) !== origin) return { to: pattern, by };
  let to = pattern;
  const route = routeTemplateOf(pattern);
  const state = [...shape.query].filter(([k, v]) => literal(v) && routeQueryFact(sf, pattern, k) === 'state').map(([k]) => k);
  if (state.length) {
    const keys = new Set(state);
    to = rewriteQuery(to, (k, v) => (keys.has(k) && literal(v) ? ':var' : v));
    for (const k of state) by.push({ k: 'route.query', key: `${route}?${k}` });
  }
  if (shape.hashKind === 'path' && shape.hashAnchor && fragmentFact(sf) === 'anchor') {
    const at = to.indexOf('#');
    if (at >= 0) {
      to = to.slice(0, at);
      by.push({ k: 'route.fragment', key: '' });
    }
  }
  return to === pattern ? { to: pattern, by: [] } : { to, by };
}

/** Whether any reliable fact could rewrite anything: a `state` query key or an `anchor` fragment. */
function anyRewriting(sf: SiteFacts): boolean {
  return sf.facts.some((f) => reliable(f) && ((f.k === 'route.query' && f.v === 'state') || (f.k === 'route.fragment' && f.v === 'anchor')));
}

/**
 * Rewrite every stored procedure on `origin` whose patterns a reliable fact
 * widens (see the module comment). Returns what changed, one row per
 * pattern; empty when no reliable `state` or `anchor` fact exists (nothing is
 * read or written then) or every pattern is already wide.
 */
export function rewriteStoredPatterns(store: SkillStore, origin: string, sf: SiteFacts): PatternRewrite[] {
  if (!anyRewriting(sf)) return [];
  const out: PatternRewrite[] = [];
  for (const listed of store.list(origin)) {
    // a cheap look first: most procedures carry nothing to widen
    const touched = [listed.preconditions.urlPattern, ...listed.steps.map((s) => s.expect?.urlPattern)].some(
      (p) => typeof p === 'string' && widenPattern(sf, origin, p).to !== p,
    );
    if (!touched) continue;
    const rows: PatternRewrite[] = [];
    store.update(listed.id, (cur) => {
      rows.length = 0;
      const at = new Date().toISOString();
      const noted: Noted[] = [];
      const note = (by: Omit<Noted, 'at'>[]) => {
        for (const b of by) if (!noted.some((n) => n.k === b.k && n.key === b.key)) noted.push({ ...b, at });
      };
      const next: Skill = { ...cur, preconditions: { ...cur.preconditions }, steps: cur.steps.map((s) => (s.expect ? { ...s, expect: { ...s.expect } } : s)) };
      const pre = widenPattern(sf, origin, next.preconditions.urlPattern);
      if (pre.to !== next.preconditions.urlPattern) {
        rows.push({ skill: cur.id, field: 'preconditions.urlPattern', from: next.preconditions.urlPattern, to: pre.to });
        next.preconditions.urlPattern = pre.to;
        note(pre.by);
      }
      next.steps.forEach((s, i) => {
        const p = s.expect?.urlPattern;
        if (typeof p !== 'string') return;
        const w = widenPattern(sf, origin, p);
        if (w.to === p) return;
        rows.push({ skill: cur.id, field: `steps.${i}.expect.urlPattern`, from: p, to: w.to });
        s.expect!.urlPattern = w.to;
        note(w.by);
      });
      if (!rows.length) return null;
      next.factRewrites = [...(cur.factRewrites ?? []), ...noted];
      return next;
    });
    out.push(...rows);
  }
  return out;
}

/**
 * rewriteStoredPatterns for each origin (deduped), from the store's own fact
 * files. The learn-time and flow-run hooks. Never throws: a rewrite that
 * cannot happen leaves the pattern as narrow as it was.
 */
export function rewriteOrigins(store: SkillStore | null | undefined, origins: readonly (string | null | undefined)[]): PatternRewrite[] {
  if (!store) return [];
  const out: PatternRewrite[] = [];
  for (const origin of new Set(origins.filter((o): o is string => Boolean(o)))) {
    try {
      out.push(...rewriteStoredPatterns(store, origin, factStoreFor(store.dir).read(origin)));
    } catch {
      // a fact that cannot widen a pattern leaves it as it was
    }
  }
  return out;
}
