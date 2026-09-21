#!/usr/bin/env node
/**
 * The same instructions, every time — recording speed without the orchestrator's variance.
 *
 *   node bench/fixed-instructions.mjs --from fwrdj11-n1 --runid fxrd1-n1 [--verify]
 *   node bench/fixed-instructions.mjs --target kanboard --from fwkb5-n1 --runid fxkb1-n1 --verify
 *
 * A sweep's run 1 lets an orchestrator model split the task into instructions,
 * and it splits it differently every run (4, 5, 6 and 13 instructions across
 * fwrdj9..13), which swamps any change to the inner loop being measured. This
 * replays the `do` instructions of one recorded run verbatim — the run tag
 * swapped for the new one, identifiers the app assigned swapped for titles,
 * credentials restored from the bench defaults — into a fresh session with an
 * EMPTY skill store, so every instruction is authored by the inner model. The
 * app must be running; it is reset first (bench/app-reset.mjs).
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
import { resetTarget } from './app-reset.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const from = opt('--from');
const runid = opt('--runid');
const target = opt('--target', 'repairdesk');
if (!from || !runid || !APP_DEFAULTS[target]) {
  console.error('usage: node bench/fixed-instructions.mjs [--target repairdesk|kanboard|…] --from <recorded-runid> --runid <new-runid> [--verify] [--dry]');
  process.exit(2);
}
const app = { ...APP_DEFAULTS[target], ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('APP_'))) };

// A recorded run's transcript, local or published; older runs carry the tool's old name.
const transcript = ['results', 'results-published']
  .flatMap((d) => ['sitelooper', 'sleep-walker'].map((arm) => path.join(here, d, `${from}-${arm}-transcript.jsonl`)))
  .find((f) => fs.existsSync(f));
if (!transcript) {
  console.error(`no transcript for ${from} under bench/results or bench/results-published`);
  process.exit(2);
}

/**
 * --live-refs: keep the recorded run's references in the text and swap in THIS run's, read off
 * the earlier instructions' own reports — what a real orchestrator does ("ticket RD-1063" in
 * run 1 becomes "ticket RD-1200" here). Without it a reference is replaced by the record's
 * title, which removes exactly the value a stored skill's reference blank needs.
 */
const LIVE_REFS = argv.includes('--live-refs');
const REF_SHAPE = { repairdesk: /\bRD-\d{3,}\b/g, kanboard: /#\d+\b/g, openproject: /#\d+\b/g, gitea: /#\d+\b/g, vikunja: /\bBENCH-\d+\b/g, espocrm: /\b[0-9a-f]{17}\b/g, snipeit: /\bBA-\d{5}\b/g, ghost: /\b[0-9a-f]{24}\b/g };
/** Identifiers the APP assigned in the recorded run, which a new run will not get. */
const APP_ASSIGNED = {
  repairdesk: [[/\b(?:ticket )?RD-\d{3,}\b/g, `the ticket titled '${runid} RD Bench Ticket'`]],
  kanboard: [
    [/ \(task #\d+\)/g, ''],
    [/\btask #\d+ titled\b/g, 'the task titled'],
  ],
  openproject: [
    [/ \(work package #\d+\)/g, ''],
    [/\bwork package #\d+ titled\b/g, 'the work package titled'],
  ],
  gitea: [
    [/ \(issue #\d+\)/g, ''],
    [/\bissue #\d+ titled\b/g, 'the issue titled'],
  ],
  // BENCH-<index> is unambiguous (no other text has that shape), so every one
  // is replaced, as repairdesk's RD-<n>.
  vikunja: [[/\b(?:task )?BENCH-\d+\b/g, `the task titled '${runid} Bench Task'`]],
  // A record id is 17 hex characters, a shape nothing else in the task has,
  // so every one is replaced, as vikunja's BENCH-<n>.
  espocrm: [[/\b(?:opportunity )?[0-9a-f]{17}\b/g, `the opportunity named '${runid} Bench Opportunity'`]],
  // An asset tag BA-<n> is unambiguous (the seed assets are SEED-<n>), so every
  // one is replaced, as repairdesk's RD-<n>.
  snipeit: [[/\b(?:asset (?:tag )?)?BA-\d{5}\b/g, `the asset named '${runid} Bench Asset'`]],
  // A post id (the url's /editor/post/<id>) is 24 hex characters, a shape
  // nothing else in the task has, so every one is replaced, as espocrm's. The
  // slug is the title's, so it carries the run tag and is swapped with it.
  ghost: [[/\b(?:post )?[0-9a-f]{24}\b/g, `the post titled '${runid} Bench Post'`]],
};

const instructions = fs
  .readFileSync(transcript, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((r) => r.k === 'cmd' && /^(sitelooper|sleep-walker) (--session \S+ )?do "/.test(r.cmd) && r.code === 0)
  .map((r) => /do "((?:[^"\\]|\\.)*)"/.exec(r.cmd)?.[1] ?? '')
  .filter(Boolean)
  .map((text) => {
    let t = text.replace(/\\"/g, '"').split(from).join(runid);
    // The transcript is redacted: the one after "password" is the password, every other is the login.
    t = t.replace(/password «redacted»/g, `password ${app.APP_PASSWORD}`).replace(/«redacted»/g, app.APP_EMAIL);
    // A reference the app assigned differs per run; the title does not.
    if (!LIVE_REFS) for (const [re, to] of APP_ASSIGNED[target] ?? []) t = t.replace(re, to);
    return t;
  });
if (!instructions.length) {
  console.error(`no successful "do" commands in ${transcript}`);
  process.exit(2);
}

const store = fs.mkdtempSync(path.join(os.tmpdir(), `${runid}-skills-`));
// --skills <dir>: start from a COPY of an existing store (validated skills recorded under other
// wording) instead of an empty one — the reworded-instruction experiment of PLAN-jev.md §6.
if (opt('--skills')) fs.cpSync(path.resolve(opt('--skills')), store, { recursive: true });
const env = { ...process.env, ...app, SITELOOPER_SKILLS: '1', SITELOOPER_SKILLS_DIR: store };
// The worktree's own CLI, argv passed as-is: no shell, so no quoting of the instruction text.
const cli = path.join(here, '..', 'bin', 'sitelooper.js');
const run = (args) => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', timeout: 700_000 });
if (argv.includes('--dry')) {
  console.log(instructions.map((t, i) => `${i + 1}. ${t.split(`password ${app.APP_PASSWORD}`).join('password ***')}`).join('\n\n'));
  process.exit(0);
}

Object.assign(process.env, app);
await resetTarget(target);
console.error(`[fixed] reset ${target}`);
const started = Date.now();
const rows = [];
let liveRef = null;
// The REPORT only: with --progress the output also carries every page the agent looked at, seed records included.
const reportOf = (out) => { const at = out.search(/^\[(OK|FAIL|BLOCKED)\]/m); return at < 0 ? '' : out.slice(at); };
for (const [i, recorded] of instructions.entries()) {
  const text = LIVE_REFS && liveRef && REF_SHAPE[target] ? recorded.replace(REF_SHAPE[target], liveRef) : recorded;
  const at = Date.now();
  const r = run(['do', text, '--session', runid, '--timeout', '600', '--max-turns', '40', '--progress']);
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  // This run's own reference: the first one an instruction reports that the recorded text did not carry.
  if (LIVE_REFS && !liveRef && REF_SHAPE[target]) liveRef = reportOf(out).match(REF_SHAPE[target])?.find((ref) => !recorded.includes(ref)) ?? null;
  const status = /^\[(OK|FAIL|BLOCKED)\]/m.exec(out)?.[1] ?? (/LLM HTTP/.test(out) ? 'HTTP-ERROR' : 'UNKNOWN');
  // The [skill] progress lines say whether an instruction was replayed, refused or handed to the model.
  const skill = out.split('\n').filter((l) => l.includes('[skill]')).map((l) => l.trim().slice(0, 300));
  rows.push({ n: i + 1, status, s: +((Date.now() - at) / 1000).toFixed(1), skill, ...(status === 'OK' ? {} : { out: out.slice(0, 400) }) });
  console.error(`[fixed] ${i + 1}/${instructions.length} ${status} ${rows.at(-1).s}s`);
}
run(['stop', '--session', runid]);
const summary = { runid, from, target, instructions: rows, wallS: +((Date.now() - started) / 1000).toFixed(1) };
if (argv.includes('--verify')) {
  const v = spawnSync(process.execPath, [path.join(here, `verify-${target}.mjs`), runid], { env, encoding: 'utf8' });
  summary.verify = (v.stdout ?? '').trim().split('\n').slice(-3).join(' | ');
  summary.verifyFull = (v.stdout ?? '').trim();
}
fs.writeFileSync(path.join(here, 'results', `${runid}-fixed.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, verifyFull: undefined }, null, 2));
