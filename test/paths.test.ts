import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeMismatch } from '../src/shared/protocol.js';
import { DEFAULT_SESSION, aliasLegacyEnv, rootDir, sessionNames } from '../src/shared/paths.js';

// Every var the BROWSER_PILOT_* → SLEEP_WALKER_* → SITELOOPER_* renames kept
// working, plus the home-dir fallback that stops a rename orphaning an
// existing install.
const VARS = [
  'SITELOOPER_MODEL', 'SLEEP_WALKER_MODEL', 'BROWSER_PILOT_MODEL',
  'SITELOOPER_PROVIDER', 'SLEEP_WALKER_PROVIDER', 'BROWSER_PILOT_PROVIDER',
  'SITELOOPER_HOME', 'SLEEP_WALKER_HOME', 'BROWSER_PILOT_HOME',
];

describe('legacy env + home compatibility', () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = Object.fromEntries(VARS.map((v) => [v, process.env[v]]));
    for (const v of VARS) delete process.env[v];
  });
  afterEach(() => {
    for (const v of VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
  });

  it('a legacy BROWSER_PILOT_* var is copied to its SITELOOPER_* name when the new one is unset', () => {
    process.env.BROWSER_PILOT_MODEL = 'legacy-model';
    aliasLegacyEnv();
    expect(process.env.SITELOOPER_MODEL).toBe('legacy-model');
  });

  it('a legacy SLEEP_WALKER_* var is copied to its SITELOOPER_* name when the new one is unset', () => {
    process.env.SLEEP_WALKER_MODEL = 'sw-model';
    aliasLegacyEnv();
    expect(process.env.SITELOOPER_MODEL).toBe('sw-model');
  });

  it('the more recent legacy prefix wins over the older one', () => {
    process.env.SLEEP_WALKER_PROVIDER = 'sw';
    process.env.BROWSER_PILOT_PROVIDER = 'bp';
    aliasLegacyEnv();
    expect(process.env.SITELOOPER_PROVIDER).toBe('sw');
  });

  it('the new name always wins when both are set', () => {
    process.env.BROWSER_PILOT_PROVIDER = 'old';
    process.env.SITELOOPER_PROVIDER = 'new';
    aliasLegacyEnv();
    expect(process.env.SITELOOPER_PROVIDER).toBe('new');
  });

  it('rootDir honors a legacy BROWSER_PILOT_HOME via the alias', () => {
    process.env.BROWSER_PILOT_HOME = path.join(os.tmpdir(), 'sw-legacy-home');
    aliasLegacyEnv();
    expect(rootDir()).toBe(process.env.BROWSER_PILOT_HOME);
  });

  it('with no env set, an existing legacy home is used before creating ~/.sitelooper', () => {
    // Point HOME at a temp dir where only the legacy home exists.
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
    const realHomedir = os.homedir;
    (os as { homedir: () => string }).homedir = () => fakeHome;
    try {
      fs.mkdirSync(path.join(fakeHome, '.browser-pilot'));
      expect(rootDir()).toBe(path.join(fakeHome, '.browser-pilot'));
      // The more recent legacy home wins over the older one.
      fs.mkdirSync(path.join(fakeHome, '.sleep-walker'));
      expect(rootDir()).toBe(path.join(fakeHome, '.sleep-walker'));
      // Once the new home exists, it takes precedence.
      fs.mkdirSync(path.join(fakeHome, '.sitelooper'));
      expect(rootDir()).toBe(path.join(fakeHome, '.sitelooper'));
    } finally {
      (os as { homedir: () => string }).homedir = realHomedir;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

/**
 * `sitelooper stop --all` left the default session's daemon running (a CLI
 * user's report). It enumerated session DIRECTORIES, and a daemon that never
 * wrote a file (no --record, no persisted profile; on Windows its socket is a
 * named pipe, not a file in the dir) has none — so a store-less default
 * daemon kept serving every later run. `--all` names the default session
 * always, and every session whose pipe is live.
 */
describe('sessionNames (stop --all, session list)', () => {
  let home: string;
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.SITELOOPER_HOME;
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-sessions-'));
    process.env.SITELOOPER_HOME = home;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.SITELOOPER_HOME;
    else process.env.SITELOOPER_HOME = saved;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('names the default session for --all even when it has no session directory', () => {
    expect(sessionNames({ includeDefault: true, pipes: () => [] })).toEqual([DEFAULT_SESSION]);
    // A listing does not invent a row for a session nothing shows.
    expect(sessionNames({ pipes: () => [] })).toEqual([]);
  });

  it('unions session directories with live daemon pipes, each once', () => {
    fs.mkdirSync(path.join(home, 'sessions', 'ticket'), { recursive: true });
    fs.mkdirSync(path.join(home, 'sessions', 'default'), { recursive: true });
    const pipes = () => ['sitelooper-default', 'sitelooper-bench_2', 'other-app-pipe', 'sitelooper-bad name'];
    expect(sessionNames({ includeDefault: true, pipes })).toEqual(['bench_2', 'default', 'ticket']);
  });
});

/**
 * The other half of the same report: the CLI reused whatever daemon held the
 * session's socket, so a store-less default daemon served a later run that
 * wanted a store, and every step said "no skill store". It is refused now.
 */
describe('storeMismatch (reusing a running daemon)', () => {
  const store = path.join(os.tmpdir(), 'sl-store');
  it('refuses a daemon started without a store for a command that wants one, saying how to fix it', () => {
    const why = storeMismatch({ learn: true, skillsDir: store }, { pid: 1, session: 'default', learning: false, skillsDir: null });
    expect(why).toMatch(/session "default" is already running WITHOUT a skill store/);
    expect(why).toContain('sitelooper --session default stop');
  });

  it('refuses a daemon whose store is another one', () => {
    const why = storeMismatch({ learn: true, skillsDir: store }, { pid: 1, session: 'bench', learning: true, skillsDir: path.join(os.tmpdir(), 'other') });
    expect(why).toMatch(/already running with the skill store .*other, not .*sl-store/);
  });

  it('reuses a daemon with the same store, one serving a store-less command, and an older daemon that cannot say', () => {
    expect(storeMismatch({ learn: true, skillsDir: store }, { pid: 1, session: 's', learning: true, skillsDir: path.join(store, '.') })).toBeNull();
    expect(storeMismatch({ learn: false, skillsDir: store }, { pid: 1, session: 's', learning: false, skillsDir: null })).toBeNull();
    expect(storeMismatch({ learn: true, skillsDir: store }, { pid: 1, session: 's' })).toBeNull();
  });
});
