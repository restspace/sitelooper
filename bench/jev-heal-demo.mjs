#!/usr/bin/env node
/**
 * Drift-injection A/B for site B of notes/PLAN-jev.md — inline replay healing.
 *
 * The gate on step 4 of the order-of-work table is "drift-injection A/B on
 * repairdesk; matrix: fewer fallbacks, zero new reds". This is that A/B, in one
 * script, against a recording the repo already owns.
 *
 * THE EXPERIMENT
 *
 * `bench/results/flows/fwrdj2.json` + `bench/results/fwrdj2-skills` are the
 * first live Jev sweep (notes/PLAN-jev.md, "First live sweep"): 9/9 steps replayed,
 * 0 model turns, 40s. Nothing drifted in it, so `repair.propose` never ran and
 * neither would healing. So we BREAK one control and replay the same flow
 * twice, changing nothing but whether Jev is present:
 *
 *   drift  `add-part-moved` renames the repair-desk "Add part" button to
 *          "Attach part", moves its testid to `part-attach`, and relocates it
 *          inside the parts card header. Step 04-add's recorded chain for that
 *          click is testid -> role+name -> css path -> point; the rename kills
 *          the first two and the relocation kills the last two, so the chain is
 *          DEAD, which is the only state healing ever runs in. The app itself
 *          still works: the click handler dispatches on `data-action`, which
 *          the drift does not touch. (`both`, the pre-existing mode, leaves the
 *          css path resolving — a fallthrough, not a dead chain.)
 *
 *   arm ON   SITELOOPER_JEV=auto with a TypeSafe key: step 04-add's dead chain
 *            is offered to `replay.heal`, which picks the renamed button from
 *            the live page, and the step's own recorded expectations (its url
 *            pattern and the `- dialog "Add part"` lines) judge the result.
 *   arm OFF  SITELOOPER_JEV=off: the identical run today — the step fails, the
 *            flow falls to model recovery, and that is the number healing has
 *            to beat.
 *
 * WHAT IT REPORTS, per arm: per-step tier / recovered / turns, wall-clock,
 * whether the run verified (bench/verify-repairdesk.mjs, when --verify), and
 * the drift tickets — in the ON arm, the healed ones carry the proposal and the
 * page rows that made it (DriftTicket.rows), which is also the labelled data
 * `bench/jev-repair-probe.mjs --tickets` reads back.
 *
 * COST. The OFF arm SPENDS: its failing step goes to a real model recovery, so
 * it needs a provider key and it is the expensive half. The ON arm spends
 * nothing but fractions of a cent on Jev IF the heal holds; if the heal is
 * refused it falls to the same recovery and costs the same as OFF. Run the
 * halves deliberately, with --arm.
 *
 * USAGE (the app must already be running; this script never starts or stops it,
 * and never touches port 4180, which a live benchmark may own):
 *
 *   # a private app instance, drift off by default
 *   PORT=4191 node bench/app/server.mjs --fresh
 *
 *   # the free half: Jev on, no conventional model unless a heal is refused
 *   node bench/jev-heal-demo.mjs --arm on  --app-url http://127.0.0.1:4191/ \
 *     --flow fwrdj2 --skills bench/results/fwrdj2-skills --tag heal-on
 *
 *   # the baseline half: SPENDS model tokens on the recovery
 *   node bench/jev-heal-demo.mjs --arm off --app-url http://127.0.0.1:4191/ \
 *     --flow fwrdj2 --skills bench/results/fwrdj2-skills --tag heal-off \
 *     --provider openrouter --model z-ai/glm-5.3
 *
 * The store is COPIED per arm, so neither run's learning (promotions,
 * candidate evidence, a repair variant) leaks into the other or back into the
 * published store.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);

const opts = {
  arm: arg('--arm', 'on'),
  appUrl: arg('--app-url', process.env.APP_URL || 'http://127.0.0.1:4191/'),
  drift: arg('--drift', 'add-part-moved'),
  flow: arg('--flow', 'fwrdj2'),
  skills: arg('--skills', path.join('bench', 'results', 'fwrdj2-skills')),
  flowsDir: arg('--flows', path.join('bench', 'results', 'flows')),
  out: arg('--out', path.join('bench', 'results')),
  tag: arg('--tag', `heal-${Date.now().toString(36)}`),
  verify: argv.includes('--verify'),
  dryRun: argv.includes('--dry-run'),
};

if (!['on', 'off'].includes(opts.arm)) {
  console.error('--arm must be `on` or `off`; run the two halves separately so a token-spending half is never started by accident');
  process.exit(2);
}
// A skill store is keyed by ORIGIN (http_127.0.0.1_4180/), so a recording made
// on 4180 only replays on 4180: on any other port no skill binds, every step
// goes to model recovery in BOTH arms, and the A/B measures nothing (the first
// attempt did exactly this on 4191, 9/9 "recovered", 0 tickets). So the demo
// must drive the port the recording was made on — and because a drift injected
// there would change what a running sweep sees mid-flight, it insists the
// caller says no sweep is running. (Not 4190 either: Node's fetch refuses it
// as a WHATWG "bad port", while curl does not.)
if (new URL(opts.appUrl).port === '4180' && !argv.includes('--no-sweep-running')) {
  console.error('port 4180 is the bench app a sweep may be using: pass --no-sweep-running to confirm nothing else is driving it');
  process.exit(2);
}

const outDir = path.resolve(opts.out);
const srcStore = path.resolve(opts.skills);
const srcFlow = path.resolve(opts.flowsDir, `${opts.flow}.json`);
for (const p of [srcStore, srcFlow]) {
  if (!fs.existsSync(p)) {
    console.error(`missing ${p} — this demo replays an EXISTING recording; record one first (bench/sweep.mjs --flow ...)`);
    process.exit(2);
  }
}

const runid = `${opts.tag}`;
const armStore = path.join(outDir, `${runid}-skills`);
const armFlows = path.join(outDir, `${runid}-flows`);
fs.rmSync(armStore, { recursive: true, force: true });
fs.rmSync(armFlows, { recursive: true, force: true });
fs.cpSync(srcStore, armStore, { recursive: true });
fs.mkdirSync(armFlows, { recursive: true });
// Under this arm's own name, and pointed at this arm's app.
const flow = JSON.parse(fs.readFileSync(srcFlow, 'utf8'));
flow.name = runid;
if (flow.startUrl) flow.startUrl = new URL(new URL(flow.startUrl).pathname + new URL(flow.startUrl).hash, opts.appUrl).href;
fs.writeFileSync(path.join(armFlows, `${runid}.json`), JSON.stringify(flow, null, 2));

const post = async (p) => {
  const res = await fetch(new URL(p, opts.appUrl));
  return res.ok ? res.text() : `HTTP ${res.status}`;
};

const bin = process.platform === 'win32' ? 'sitelooper.cmd' : 'sitelooper';
const providerArgs = [];
for (const flag of ['--provider', '--model', '--recovery-model', '--fallback-model']) {
  if (argv.includes(flag)) providerArgs.push(flag, arg(flag));
}

console.error(`[heal-demo] arm=${opts.arm} drift=${opts.drift} app=${opts.appUrl} flow=${runid}`);
console.error(`[heal-demo] store copy: ${armStore}`);

if (opts.dryRun) {
  console.error('[heal-demo] --dry-run: prepared the arm store/flow and stopped before touching the app');
  process.exit(0);
}

// A replay against a dirty app produces numbers that look like results and are
// not (see sweep.mjs): reset first, and halt if the reset fails.
const reset = spawnSync(process.execPath, [path.join(here, 'reset-app.mjs'), '--target', 'repairdesk'], {
  stdio: 'inherit',
  env: { ...process.env, APP_URL: opts.appUrl },
});
if (reset.status !== 0) {
  console.error('[heal-demo] app reset FAILED — refusing to replay against a dirty app');
  process.exit(1);
}
console.error(`[heal-demo] drift -> ${await post(`/__drift?mode=${encodeURIComponent(opts.drift)}`)}`);

const env = {
  APP_URL: opts.appUrl,
  APP_EMAIL: process.env.APP_EMAIL || 'bench@example.com',
  APP_PASSWORD: process.env.APP_PASSWORD || 'bench-pass-1234',
  ...process.env,
  SITELOOPER_SKILLS: '1',
  SITELOOPER_SKILLS_DIR: armStore,
  SITELOOPER_FLOWS_DIR: armFlows,
  // The one variable under test.
  SITELOOPER_JEV: opts.arm === 'on' ? 'auto' : 'off',
};

const started = Date.now();
const run = spawnSync(bin, ['--session', runid, 'run', runid, '--var', `runid=${runid}`, '--json', ...providerArgs], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env,
  shell: process.platform === 'win32',
});
const wall = Date.now() - started;
const stderr = (run.stderr ?? Buffer.from('')).toString();
process.stderr.write(stderr);
fs.writeFileSync(path.join(outDir, `${runid}-progress.log`), stderr);
if (run.stdout?.length) fs.writeFileSync(path.join(outDir, `${runid}-flowrun.json`), run.stdout);
spawnSync(bin, ['stop', '--session', runid], { stdio: 'ignore', env, shell: process.platform === 'win32' });
// Put the app back the way it was found; a drift left on would silently
// poison whatever runs next against this instance.
console.error(`[heal-demo] drift -> ${await post('/__drift?mode=')}`);

let result = null;
try {
  result = JSON.parse(run.stdout.toString());
} catch {
  console.error('[heal-demo] the run produced no parseable result — see the progress log');
  process.exit(1);
}

// --- the report ---------------------------------------------------------------

const tickets = result.driftTickets ?? [];
if (tickets.length) fs.writeFileSync(path.join(outDir, `${runid}-drift.json`), JSON.stringify(tickets, null, 2));

const pad = (s, n) => String(s ?? '').padEnd(n);
console.log(`\n=== jev-heal-demo: arm ${opts.arm}, drift ${opts.drift} ===`);
console.log(`${pad('step', 10)} ${pad('status', 9)} ${pad('tier', 5)} ${pad('recovered', 10)} ${pad('turns', 6)} why`);
for (const s of result.steps ?? []) {
  console.log(`${pad(s.id, 10)} ${pad(s.status, 9)} ${pad(s.tier ?? '-', 5)} ${pad(s.recovered ? 'YES' : '', 10)} ${pad(s.turns ?? 0, 6)} ${(s.fellBack ?? s.reason ?? '').slice(0, 90)}`);
}
console.log(`\npassed ${result.passed}/${result.total}  wall ${(wall / 1000).toFixed(1)}s (daemon-reported ${(result.wallMs / 1000).toFixed(1)}s)`);
console.log(`model turns total: ${(result.steps ?? []).reduce((n, s) => n + (s.turns ?? 0), 0)}`);

const healed = tickets.filter((t) => t.healed);
console.log(`drift tickets: ${tickets.length} (${healed.length} healed inline)`);
for (const t of healed) {
  console.log(`  ${t.step}/${t.atStep ?? '?'} ${t.key ?? 'target'}: ${t.missedLocator} -> ${t.fallbackUsed}  [${t.rows?.length ?? 0} rows banked]  ${t.recovered ? 'the step then went to recovery' : 'verified by the step'}`);
}
const withRows = tickets.filter((t) => t.rows?.length).length;
console.log(`tickets carrying a live-page ballot (labelled data for jev-repair-probe --tickets): ${withRows}`);

// The per-instruction timing lines step 3 added go to the daemon's progress
// stream, not into the result — surface the ones for steps that recovered, so
// the headline "how long did the failure cost" is in the same place.
for (const line of stderr.split('\n')) {
  if (/recovering on|model \d+(\.\d+)?s|healed inline|replay\.heal/.test(line)) console.log(`  | ${line.trim().slice(0, 160)}`);
}

if (opts.verify) {
  const v = spawnSync(process.execPath, [path.join(here, 'verify-repairdesk.mjs'), runid], {
    encoding: 'utf8',
    env: { ...process.env, BENCH_OUT: outDir, APP_URL: opts.appUrl },
  });
  process.stdout.write(v.stdout ?? '');
  process.stderr.write(v.stderr ?? '');
}
