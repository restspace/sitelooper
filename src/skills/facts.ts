import fs from 'node:fs';
import path from 'node:path';
import {
  emptyFacts,
  observeFact,
  type Fact,
  type Observation,
  type ObserveOutcome,
  type SiteFacts,
} from '../execution/facts.js';
import { originOf } from '../execution/url.js';
import { scrubSecretsDeep } from '../shared/secrets.js';
import { SITE_FACTS_FILE, originSlug, skillsDir, withFileLock } from './store.js';

/**
 * The per-origin store of observed site facts (design-site-facts.md, the
 * site-facts stage 0 contract's Piece B).
 *
 * Same shape as SiteModel (skills/sitemap.ts): one file per origin, beside
 * the origin's procedures, named so `SkillStore.readDir` never files it as a
 * corrupt procedure (SITE_FACTS_FILE is in NOT_A_PROCEDURE). NOTHING here may
 * throw — `read` degrades a missing file, a missing directory, bad JSON or a
 * mismatched version to an empty store rather than failing a caller that was
 * only trying to add one more observation.
 *
 * Writes are tmp-plus-rename under the same per-file lock `SkillStore` uses,
 * so two daemons (recorder, replay) observing the same origin at once cannot
 * lose one's write to the other's read-modify-write.
 */
export class SiteFactStore {
  private readonly warned = new Set<string>();

  constructor(readonly dir: string = skillsDir()) {}

  /** `<dir>/<encoded origin>/site-facts.json`, mirroring SiteModel's file(). */
  path(origin: string): string {
    return path.join(this.dir, originSlug(origin), SITE_FACTS_FILE);
  }

  /**
   * Current facts for an origin. Never throws: a missing file or directory,
   * unparsable JSON, or a store written by a future version all read back as
   * empty rather than failing the caller. Logged once per origin, at most,
   * so a genuinely corrupt file is discoverable without spamming every read.
   */
  read(origin: string): SiteFacts {
    const empty = emptyFacts(origin);
    let raw: string;
    try {
      raw = fs.readFileSync(this.path(origin), 'utf8');
    } catch {
      return empty;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SiteFacts>;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.facts) || typeof parsed.origin !== 'string') {
        this.warnOnce(origin, 'site-facts.json did not match the expected shape; reading as empty');
        return empty;
      }
      return { version: 1, origin: parsed.origin, facts: parsed.facts as Fact[] };
    } catch {
      this.warnOnce(origin, 'site-facts.json is not valid JSON; reading as empty');
      return empty;
    }
  }

  private warnOnce(origin: string, why: string): void {
    if (this.warned.has(origin)) return;
    this.warned.add(origin);
    // No project-wide debug logger exists yet (see facts-store.test.ts note);
    // stderr is the closest thing to "log once at debug" available here, and
    // it never throws, so it cannot turn a degraded read into a failed one.
    try {
      console.error(`[site-facts] ${origin}: ${why}`);
    } catch {
      /* stderr itself failing is not this store's problem */
    }
  }

  /**
   * Fold each observation into the origin's facts and persist the result.
   * Read-modify-write under the file lock, so concurrent observers merge
   * rather than clobber. Facts are scrubbed of secrets before they touch
   * disk — the whole document, not just new observations, since an older
   * write made before a value was known secret must not survive a later one.
   */
  observe(origin: string, obs: Observation[]): { written: number; outcomes: ObserveOutcome[] } {
    const outcomes: ObserveOutcome[] = [];
    if (obs.length === 0) return { written: 0, outcomes };
    const file = this.path(origin);
    withFileLock(file, () => {
      let sf = this.read(origin);
      for (const o of obs) {
        const { fact, outcome } = observeFact(sf, o);
        outcomes.push(outcome);
        void fact;
      }
      sf = scrubSecretsDeep(sf);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(sf, null, 1));
      fs.renameSync(tmp, file);
    });
    return { written: obs.length, outcomes };
  }

  /** A clone of the origin's facts, sorted by (k, key), for the compile snapshot. */
  snapshot(origin: string): SiteFacts {
    const sf = structuredClone(this.read(origin));
    sf.facts.sort((a, b) => (a.k === b.k ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.k < b.k ? -1 : 1));
    return sf;
  }
}

let singleton: SiteFactStore | null = null;

/** The process-wide fact store, rooted at `skillsDir()`. */
export function siteFactStore(): SiteFactStore {
  if (!singleton) singleton = new SiteFactStore();
  return singleton;
}

// originOf is re-exported for callers that only need this module's surface
// (observers under src/skills/facts-*.ts, per the stage 0 contract's Wave 2).
export { originOf };
