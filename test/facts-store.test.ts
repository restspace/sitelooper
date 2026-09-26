import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Observation } from '../src/execution/facts.js';
import { siteFactStore, SiteFactStore } from '../src/skills/facts.js';
import { clearSecretLedger, resolveSecrets } from '../src/shared/secrets.js';
import { SkillStore } from '../src/skills/store.js';

const ORIGIN = 'http://facts-store.example';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-facts-'));
}

function obs(over: Partial<Observation> = {}): Observation {
  return {
    k: 'route.query',
    key: '/orders?state=1',
    v: 'state',
    hard: true,
    session: 's1',
    ...over,
  };
}

describe('SiteFactStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpRoot();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    clearSecretLedger();
  });

  it('reads an absent store as empty', () => {
    const store = new SiteFactStore(dir);
    const sf = store.read(ORIGIN);
    expect(sf).toEqual({ version: 1, origin: ORIGIN, facts: [] });
  });

  it('reads a corrupt file as empty rather than throwing', () => {
    const store = new SiteFactStore(dir);
    const file = store.path(ORIGIN);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ not json');
    expect(store.read(ORIGIN)).toEqual({ version: 1, origin: ORIGIN, facts: [] });

    fs.writeFileSync(file, JSON.stringify({ version: 2, origin: ORIGIN, facts: [] }));
    expect(store.read(ORIGIN)).toEqual({ version: 1, origin: ORIGIN, facts: [] });

    fs.writeFileSync(file, JSON.stringify({ foo: 'bar' }));
    expect(store.read(ORIGIN)).toEqual({ version: 1, origin: ORIGIN, facts: [] });
  });

  it('observe writes the file and the fact is readable back', () => {
    const store = new SiteFactStore(dir);
    const { written, outcomes } = store.observe(ORIGIN, [obs()]);
    expect(written).toBe(1);
    expect(outcomes).toEqual(['new']);

    const sf = store.read(ORIGIN);
    expect(sf.facts).toHaveLength(1);
    expect(sf.facts[0]).toMatchObject({ k: 'route.query', key: '/orders?state=1', v: 'state', n: 1, hard: true });
    expect(fs.existsSync(store.path(ORIGIN))).toBe(true);
  });

  it('a second matching observation confirms rather than duplicates', () => {
    const store = new SiteFactStore(dir);
    store.observe(ORIGIN, [obs({ session: 's1' })]);
    const { outcomes } = store.observe(ORIGIN, [obs({ session: 's2' })]);
    expect(outcomes).toEqual(['confirmed']);
    const sf = store.read(ORIGIN);
    expect(sf.facts).toHaveLength(1);
    expect(sf.facts[0].n).toBe(2);
    expect(sf.facts[0].sessions).toEqual(expect.arrayContaining(['s1', 's2']));
  });

  it('SkillStore.readDir never lists site-facts.json as corrupt', () => {
    const factStore = new SiteFactStore(dir);
    factStore.observe(ORIGIN, [obs()]);

    const skillStore = new SkillStore(dir);
    // Force a read of the origin directory (via list/all, which drive readDir).
    const skills = skillStore.list(ORIGIN);
    expect(skills).toEqual([]);
    expect(skillStore.corrupt).toEqual([]);
    expect(skillStore.unreadable).toEqual([]);
  });

  it('scrubs a credential-looking value out of ev before it is written', () => {
    process.env.SITE_FACTS_TEST_SECRET = 'hunter2-secret-value';
    try {
      resolveSecrets('{{env:SITE_FACTS_TEST_SECRET}}'); // banks the resolved value on the ledger
      const store = new SiteFactStore(dir);
      store.observe(ORIGIN, [
        obs({
          k: 'value.class',
          key: 'deadbeefcafef00d',
          v: 'credential',
          hard: true,
          ev: 'field showed hunter2-secret-value',
        }),
      ]);
      const raw = fs.readFileSync(store.path(ORIGIN), 'utf8');
      expect(raw).not.toContain('hunter2-secret-value');
      expect(raw).toContain('{{env:SITE_FACTS_TEST_SECRET}}');
    } finally {
      delete process.env.SITE_FACTS_TEST_SECRET;
    }
  });

  it('two stores on the same root see each other\'s writes', () => {
    const a = new SiteFactStore(dir);
    const b = new SiteFactStore(dir);
    a.observe(ORIGIN, [obs()]);
    const sf = b.read(ORIGIN);
    expect(sf.facts).toHaveLength(1);
    b.observe(ORIGIN, [obs({ k: 'route.fragment', key: '', v: 'path', session: 's2' })]);
    const sf2 = a.read(ORIGIN);
    expect(sf2.facts).toHaveLength(2);
  });

  it('snapshot clones and sorts facts by (k, key)', () => {
    const store = new SiteFactStore(dir);
    store.observe(ORIGIN, [
      obs({ k: 'route.query', key: '/z?x=1' }),
      obs({ k: 'route.fragment', key: '', v: 'path' }),
      obs({ k: 'route.query', key: '/a?x=1' }),
    ]);
    const snap = store.snapshot(ORIGIN);
    const pairs = snap.facts.map((f) => `${f.k}|${f.key}`);
    const sorted = [...pairs].sort();
    expect(pairs).toEqual(sorted);

    // Mutating the snapshot must not affect the store's own state.
    snap.facts.pop();
    expect(store.read(ORIGIN).facts).toHaveLength(3);
  });

  it('siteFactStore() is a singleton rooted at skillsDir()', () => {
    const a = siteFactStore();
    const b = siteFactStore();
    expect(a).toBe(b);
  });
});
