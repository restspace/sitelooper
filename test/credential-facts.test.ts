import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { valueHash } from '../src/execution/facts.js';
import { SiteFactStore } from '../src/skills/facts.js';
import { ValueFactObserver } from '../src/skills/facts-value.js';
import { RunLedger } from '../src/skills/ledger.js';
import {
  clearSecretLedger,
  notePasswordFieldLine,
  resolveSecrets,
  scrubSecrets,
  scrubSecretsDeep,
  setKnownCredentialHashes,
} from '../src/shared/secrets.js';

/**
 * Site facts, stage 3 consumer 4 (design-site-facts.md §4): an AMBIGUOUS
 * credential — kanboard's and grafana's password is the username, `admin`
 * (fwkb39, fwgr68) — is scrubbed only inside its password field's own line
 * today. Once a RELIABLE `value.class` `credential` fact says this origin
 * holds it, the recorder's line scrub (agent/tools.ts, scrubSecretsDeep's
 * `knownCredentials`) rewrites it in any line of a step's diff; the hash set
 * comes from the value observer's store through setKnownCredentialHashes.
 */
const KB = 'http://kb.test';
const HEADING = '- heading "KB Dashboard for admin"';
const SCRUBBED = '- heading "KB Dashboard for {{env:APP_PASSWORD}}"';
const lineScrub = { knownCredentials: true };

describe('the credential fact reaches the recorder’s line scrub', () => {
  let dir: string;
  let store: SiteFactStore;
  const saved = { ...process.env };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-credential-facts-'));
    store = new SiteFactStore(dir);
    clearSecretLedger();
    process.env = { ...saved, APP_PASSWORD: 'admin', APP_USER: 'admin' };
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    clearSecretLedger();
    process.env = { ...saved };
  });

  /** A session that logs in with the ambiguous password (the scrub files it by hash) and ends its instruction. */
  const loginSession = (session: string) => {
    const obs = new ValueFactObserver(store, session, dir);
    expect(resolveSecrets('{{env:APP_PASSWORD}}')).toBe('admin');
    notePasswordFieldLine('textbox "Password": admin');
    const entries: RecordedEntry[] = [{ k: 'instruction', text: 'log in', url: `${KB}/login`, fingerprint: [1, 0, 0] }];
    obs.endInstruction({ script: entries, entries, ledger: new RunLedger().all(), vars: [] });
    return obs;
  };

  it('a line outside the password field is scrubbed once the fact is reliable, and not before', () => {
    // Before any fact: only the password field's own line.
    const obs = new ValueFactObserver(store, 'n0', dir);
    expect(obs.credentialHashes(`${KB}/login`)).toEqual(new Set());
    resolveSecrets('{{env:APP_PASSWORD}}');
    notePasswordFieldLine('textbox "Password": admin');
    setKnownCredentialHashes(obs.credentialHashes(`${KB}/login`));
    expect(scrubSecretsDeep([HEADING, 'textbox "Password": admin'], lineScrub)).toEqual([HEADING, 'textbox "Password": {{env:APP_PASSWORD}}']);

    // The scrub filed it ambiguous: the observer writes a HARD credential fact, reliable from its first observation.
    clearSecretLedger();
    const n1 = loginSession('n1');
    const hashes = n1.credentialHashes(`${KB}/dashboard`);
    expect(hashes).toEqual(new Set([valueHash('admin')]));
    setKnownCredentialHashes(hashes);
    expect(scrubSecretsDeep([HEADING], lineScrub)).toEqual([SCRUBBED]);
    // A whole token only: a longer word keeps its letters.
    expect(scrubSecretsDeep(['- link "administrator settings"'], lineScrub)).toEqual(['- link "administrator settings"']);
    // Only the recorder's line scrub: what the model reads is scrubbed as it always was.
    expect(scrubSecrets(HEADING)).toBe(HEADING);
    expect(scrubSecretsDeep([HEADING])).toEqual([HEADING]);
  });

  it('a later session knows it before it types anything: the value comes from the environment, matched by hash', () => {
    loginSession('n1');
    clearSecretLedger(); // a new daemon: nothing resolved yet this session
    const n2 = new ValueFactObserver(store, 'n2', dir);
    setKnownCredentialHashes(n2.credentialHashes(`${KB}/login`));
    expect(scrubSecretsDeep({ added: [HEADING] }, lineScrub)).toEqual({ added: [SCRUBBED] });
  });

  it('an advisory fact, another origin, or an empty set: the scrub is today’s', () => {
    store.observe(KB, [{ k: 'value.class', key: valueHash('admin'), v: 'credential', hard: false, session: 'n1' }]);
    const obs = new ValueFactObserver(store, 'n2', dir);
    expect(obs.credentialHashes(`${KB}/login`)).toEqual(new Set());
    resolveSecrets('{{env:APP_PASSWORD}}');
    setKnownCredentialHashes(obs.credentialHashes(`${KB}/login`));
    expect(scrubSecretsDeep([HEADING], lineScrub)).toEqual([HEADING]);
    store.observe('http://gr.test', [{ k: 'value.class', key: valueHash('admin'), v: 'credential', hard: true, session: 'n1' }]);
    setKnownCredentialHashes(obs.credentialHashes(`${KB}/login`));
    expect(scrubSecretsDeep([HEADING], lineScrub)).toEqual([HEADING]);
    setKnownCredentialHashes(obs.credentialHashes('http://gr.test/login'));
    expect(scrubSecretsDeep([HEADING], lineScrub)).toEqual([SCRUBBED]);
    setKnownCredentialHashes([]);
    expect(scrubSecretsDeep([HEADING], lineScrub)).toEqual([HEADING]);
  });

  it('a hash with no value this session or environment holds scrubs nothing', () => {
    setKnownCredentialHashes([valueHash('someone-else')]);
    expect(scrubSecretsDeep(['- heading "someone-else"'], lineScrub)).toEqual(['- heading "someone-else"']);
  });
});
