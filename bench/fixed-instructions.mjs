#!/usr/bin/env node
/**
 * The same instructions, every time — recording speed without the orchestrator's variance.
 *
 *   node bench/fixed-instructions.mjs --from fwrdj11-n1 --runid fxrd1 [--verify]
 *
 * A sweep's run 1 lets an orchestrator model split the task into instructions,
 * and it splits it differently every run (4, 5, 6 and 13 instructions across
 * fwrdj9..13), which swamps any change to the inner loop being measured. This
 * replays the `sitelooper do` instructions of one recorded run verbatim — the
 * run tag swapped for the new one, the app-assigned ticket reference swapped
 * for the ticket's title, credentials restored from the bench defaults — into
 * a fresh session with an EMPTY skill store, so every instruction is authored
 * by the inner model. The app must be running and is reset first.
 *
 * What differs between two arms is then only the environment you launch it
 * with (SITELOOPER_OPENING_SNAPSHOT=off, SITELOOPER_JEV_ACTOR=act, …) and the
 * inner model's own run-to-run variation. Read timing with
 * bench/jev-act-report.mjs <runid>.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APP_DEFAULTS } from './app-defaults.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const from = opt('--from');
const runid = opt('--runid');
if (!from || !runid) {
  console.error('usage: node bench/fixed-instructions.mjs --from <recorded-runid> --runid <new-runid> [--verify]');
  process.exit(2);
}
const app = { ...APP_DEFAULTS.repairdesk, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('APP_'))) };

const transcript = path.join(here, 'results', `${from}-sitelooper-transcript.jsonl`);
const instructions = fs
  .readFileSync(transcript, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((r) => r.k === 'cmd' && /^sitelooper (--session \S+ )?do "/.test(r.cmd) && r.code === 0)
  .map((r) => /do "((?:[^"\\]|\\.)*)"/.exec(r.cmd)?.[1] ?? '')
  .filter(Boolean)
  .map((text) => {
    let t = text.replace(/\\"/g, '"').split(from).join(runid);
    // The transcript is redacted; the first «redacted» of a pair is the email.
    t = t.replace(/«redacted»/, app.APP_EMAIL).replace(/«redacted»/, app.APP_PASSWORD);
    // The reference is assigned by the app and differs per run; the title does not.
    return t.replace(/\b(?:ticket )?RD-\d{3,}\b/g, `the ticket titled '${runid} RD Bench Ticket'`);
  });
if (!instructions.length) {
  console.error(`no successful "sitelooper do" commands in ${transcript}`);
  process.exit(2);
}

const store = fs.mkdtempSync(path.join(os.tmpdir(), `${runid}-skills-`));
const env = { ...process.env, ...app, SITELOOPER_SKILLS: '1', SITELOOPER_SKILLS_DIR: store };
// The worktree's own CLI, argv passed as-is: no shell, so no quoting of the instruction text.
const cli = path.join(here, '..', 'bin', 'sitelooper.js');
const run = (args) => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', timeout: 700_000 });
if (argv.includes('--dry')) {
  console.log(instructions.map((t, i) => `${i + 1}. ${t.split(app.APP_PASSWORD).join('***')}`).join('\n\n'));
  process.exit(0);
}

await fetch(new URL('__reset', app.APP_URL), { method: 'POST' }).catch(() => fetch(new URL('__reset', app.APP_URL)));
const started = Date.now();
const rows = [];
for (const [i, text] of instructions.entries()) {
  const at = Date.now();
  const r = run(['do', text, '--session', runid, '--timeout', '600', '--max-turns', '40']);
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const status = /^\[(OK|FAIL|BLOCKED)\]/m.exec(out)?.[1] ?? (/LLM HTTP/.test(out) ? 'HTTP-ERROR' : 'UNKNOWN');
  rows.push({ n: i + 1, status, s: +((Date.now() - at) / 1000).toFixed(1) });
  console.error(`[fixed] ${i + 1}/${instructions.length} ${status} ${rows.at(-1).s}s`);
}
run(['stop', '--session', runid]);
const summary = { runid, from, instructions: rows, wallS: +((Date.now() - started) / 1000).toFixed(1) };
if (argv.includes('--verify')) {
  const v = spawnSync(process.execPath, [path.join(here, 'verify-repairdesk.mjs'), runid], { env, encoding: 'utf8' });
  summary.verify = (v.stdout ?? '').trim().split('\n').slice(-3).join(' | ');
}
fs.writeFileSync(path.join(here, 'results', `${runid}-fixed.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
