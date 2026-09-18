import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cascade, GATES, jevDecider, shadow, type Decider, type Reading } from '../src/agent/decide.js';
import type { SystemOne, SystemOneDecision } from '../src/agent/system-one.js';

const client = { model: 'jev-test', ask: async () => { throw new Error('unused'); } } as unknown as SystemOne;
const says = <O>(o: O | null): Decider<string, O> => async () => o;
const throws: Decider<string, string> = async () => { throw new Error('boom'); };

afterEach(() => {
  for (const k of Object.keys(GATES)) if (k.startsWith('test.')) delete GATES[k];
});

describe('cascade', () => {
  it('returns the first opinion and skips absent deciders', async () => {
    expect(await cascade(null, says<string>(null), says('b'), says('c'))('x')).toBe('b');
    expect(await cascade(says<string>(null))('x')).toBeNull();
  });

  it('treats an early throw as no opinion, but the LAST decider’s failure is the site’s', async () => {
    expect(await cascade(throws, says('llm'))('x')).toBe('llm');
    await expect(cascade(says<string>(null), throws)('x')).rejects.toThrow('boom');
  });

  it('with Jev absent it is the pre-existing decider and nothing else', async () => {
    let calls = 0;
    const llm: Decider<string, string> = async () => (calls++, 'llm');
    const s1: SystemOne | null = null;
    expect(await cascade(s1 && says('jev'), llm)('x')).toBe('llm');
    expect(calls).toBe(1);
  });
});

describe('jevDecider', () => {
  const site = (reading: Reading<string> | null | Error) => ({
    site: 'test.site',
    run: async () => {
      if (reading instanceof Error) throw reading;
      return reading;
    },
  });

  it('acts above the gate, defers below it, and logs both', async () => {
    GATES['test.site'] = 0.8;
    const log: SystemOneDecision[] = [];
    const hi = jevDecider(client, site({ value: 'e1', chosen: 'e1', confidence: 0.93, options: 4 }), (d) => log.push(d));
    const lo = jevDecider(client, site({ value: 'e2', chosen: 'e2', confidence: 0.5, options: 4 }), (d) => log.push(d));
    expect(await hi('x')).toBe('e1');
    expect(await lo('x')).toBeNull();
    expect(log.map((d) => [d.outcome, d.chosen, d.why])).toEqual([['acted', 'e1', undefined], ['deferred', 'e2', 'below gate 0.8']]);
  });

  it('a confident `none` is a deferral, not a decision', async () => {
    const log: SystemOneDecision[] = [];
    const d = jevDecider(client, site({ value: null, chosen: 'none', confidence: 0.99, options: 4 }), (x) => log.push(x));
    expect(await d('x')).toBeNull();
    expect(log[0]).toMatchObject({ outcome: 'deferred', why: 'none' });
  });

  it('a failed ask and nothing-to-ask both decline silently', async () => {
    const log: SystemOneDecision[] = [];
    expect(await jevDecider(client, site(new Error('timeout')), (x) => log.push(x))('x')).toBeNull();
    expect(await jevDecider(client, site(null), (x) => log.push(x))('x')).toBeNull();
    expect(log).toEqual([]);
  });

  it('an unlisted site gets the strict default gate', async () => {
    const d = jevDecider(client, { site: 'test.unlisted', run: async () => ({ value: 'v', chosen: 'v', confidence: 0.89, options: 2 }) });
    expect(await d('x')).toBeNull();
  });
});

describe('shadow', () => {
  it('always returns the authoritative answer and reports the comparison', async () => {
    const seen: Array<[string | null, string | null]> = [];
    const d = shadow(says('rule'), says('jev'), (_i, a, s) => seen.push([a, s]), { waitMs: 50 });
    expect(await d('x')).toBe('rule');
    expect(seen).toEqual([['rule', 'jev']]);
  });

  it('a failing or slow shadow can neither fail nor hold up the answer', async () => {
    const seen: unknown[] = [];
    expect(await shadow(says('rule'), throws, () => seen.push(1), { waitMs: 50 })('x')).toBe('rule');
    const slow: Decider<string, string> = () => new Promise((r) => setTimeout(() => r('late'), 200));
    const started = Date.now();
    expect(await shadow(says('rule'), slow, () => seen.push(2), { waitMs: 20 })('x')).toBe('rule');
    expect(Date.now() - started).toBeLessThan(150);
    expect(seen).toEqual([]);
  });

  it('with no shadow it IS the authoritative decider', () => {
    const rule = says('rule');
    expect(shadow(rule, null, () => {})).toBe(rule);
  });
});

describe('the composition-root rule', () => {
  it('only the daemon and the CLI ever ask whether System One exists', () => {
    const root = path.join(__dirname, '..', 'src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith('.ts') && /\b(buildSystemOne|resolveSystemOneConfig)\(/.test(fs.readFileSync(p, 'utf8'))) offenders.push(path.relative(root, p).replace(/\\/g, '/'));
      }
    };
    walk(root);
    expect(offenders.filter((f) => !['agent/system-one.ts', 'daemon/server.ts', 'cli.ts'].includes(f))).toEqual([]);
  });
});
