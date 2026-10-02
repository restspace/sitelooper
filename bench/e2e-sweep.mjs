#!/usr/bin/env node
/**
 * e2e-sweep — the tester-army `e2e` framework (https://e2e.tester.army) run
 * through the same protocol as a sitelooper flow sweep, scored by the same
 * app-side verifier.
 *
 *   node bench/e2e-sweep.mjs --target ghost --base e2gh1
 *
 *   <base>-n1      records: every agent step runs on the model, and e2e's
 *                  replay cache keeps the steps a later check verified
 *   <base>-n2,-n3  replays against a RESET app: cached steps rerun without a
 *                  model, and a step whose recording no longer fits is handed
 *                  to the model (e2e's default)
 *   <base>-strict  the same against a reset app with `--strict-cache` and the
 *                  cache read-only: a recording that does not replay FAILS
 *                  instead of handing off. The nearest thing e2e has to a
 *                  compiled script; its assert/extract steps still call the
 *                  model, by design.
 *
 * Per run it writes, under --out (bench/results):
 *   <runid>-e2e-result.json   steps, cache outcome per act, usage, finalText
 *   <runid>-e2e-report.json   e2e's own report.json, untouched
 *   <runid>-e2e-run.log       the run's console output (with --debug tables)
 *   <runid>-verify.log        bench/verify-<target>.mjs output
 * and once per run a copy of the replay cache, <base>-e2e-cache-<tag>/.
 *
 * The test itself is bench/e2e-arm/tests/flow.e2e.ts, derived from the task
 * file by bench/e2e-arm/task.mjs. OPENROUTER_API_KEY must be set.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_DEFAULTS } from './app-defaults.mjs';
import { resetTarget } from './app-reset.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const arm = path.join(here, 'e2e-arm');

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const target = opt('--target');
const base = opt('--base');
const k = Number(opt('--k', '3'));
const model = opt('--model', 'openai/gpt-6-luna');
const outDir = path.resolve(opt('--out', path.join(here, 'results')));
const noStrict = argv.includes('--no-strict');
if (!target || !base || !APP_DEFAULTS[target]) {
  console.error('usage: e2e-sweep.mjs --target <name> --base <runid> [--k 3] [--model openai/gpt-6-luna] [--out bench/results] [--no-strict]');
  process.exit(2);
}
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 12)) {
  console.error(`e2e needs Node.js 22.12 or newer; this is ${process.version}`);
  process.exit(2);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY is not set');
  process.exit(2);
}
if (!fs.existsSync(path.join(arm, 'node_modules', 'e2e'))) {
  console.error('bench/e2e-arm is not installed: run `npm ci` in bench/e2e-arm first');
  process.exit(2);
}

for (const [key, value] of Object.entries(APP_DEFAULTS[target])) process.env[key] ??= value;
fs.mkdirSync(outDir, { recursive: true });
const rates = JSON.parse(fs.readFileSync(path.join(here, 'rates.json'), 'utf8'))[model] ?? null;
const e2eVersion = JSON.parse(fs.readFileSync(path.join(arm, 'node_modules', 'e2e', 'package.json'), 'utf8')).version;
const cacheDir = path.join(arm, '.e2e', 'cache');
fs.rmSync(cacheDir, { recursive: true, force: true });

/** Tokens and cost as e2e's own report states them (the provider's reported cost), plus ours at bench/rates.json. */
function usageOf(report) {
  const u = report?.run?.usage;
  if (!u) return null;
  const tokens = u.modelTokens ?? 0;
  const cached = u.modelCachedTokens ?? 0;
  return {
    modelTokens: tokens, modelCachedTokens: cached, usd: u.estimatedCostUsd ?? null,
    // Input and output are not split in the run total, so this prices every token as input: a floor.
    usdAtRatesFloor: rates ? ((tokens - cached) * rates.input + cached * (rates.cacheRead ?? rates.input)) / 1e6 : null,
  };
}

const e2eBin = path.join(arm, 'node_modules', 'e2e', 'dist', 'cli', 'bin.js');
const cli = fs.existsSync(e2eBin) ? [process.execPath, [e2eBin]] : ['npx', ['e2e']];

async function one(tag, { strict = false } = {}) {
  const runid = `${base}-${tag}`;
  console.log(`\n=== ${runid}${strict ? ' (strict cache, read-only)' : ''} ===`);
  try {
    await resetTarget(target);
  } catch (e) {
    console.log(`reset-failed: ${e.message}`);
    return { runid, verdict: 'reset-failed' };
  }
  const steplog = path.join(outDir, `${runid}-e2e-steps.json`);
  fs.rmSync(steplog, { force: true });
  const env = {
    ...process.env,
    BENCH_TARGET: target,
    BENCH_RUNID: runid,
    BENCH_STEPLOG: steplog,
    BENCH_E2E_MODEL: model,
    BENCH_E2E_CACHE: strict ? 'read-only' : 'read-write',
    E2E_TELEMETRY_DISABLED: '1',
    NO_COLOR: '1',
  };
  delete env.CI; // CI mode would add a retry and make the cache read-only
  const t0 = Date.now();
  const run = spawnSync(cli[0], [...cli[1], 'run', 'tests/flow.e2e.ts', '--reporter', 'list', '--debug', ...(strict ? ['--strict-cache'] : [])], {
    cwd: arm, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: cli[0] === 'npx',
  });
  const wallMs = Date.now() - t0;
  const log = `${run.stdout ?? ''}\n--- stderr ---\n${run.stderr ?? ''}`;
  fs.writeFileSync(path.join(outDir, `${runid}-e2e-run.log`), log);
  console.log(log.split('\n').slice(-45).join('\n'));

  let report = null;
  const reportPath = path.join(arm, '.e2e', 'report.json');
  if (fs.existsSync(reportPath)) {
    fs.copyFileSync(reportPath, path.join(outDir, `${runid}-e2e-report.json`));
    try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch { /* left null */ }
    fs.rmSync(reportPath, { force: true });
  }
  if (fs.existsSync(cacheDir)) fs.cpSync(cacheDir, path.join(outDir, `${base}-e2e-cache-${tag}`), { recursive: true });

  let steps = [], finalText = '';
  try { ({ steps, finalText } = JSON.parse(fs.readFileSync(steplog, 'utf8'))); } catch { /* the test never wrote one */ }
  const acts = steps.filter((s) => s.kind === 'act');
  const mode = (m) => acts.filter((s) => s.ok && s.cache?.mode === m).length;
  const cache = {
    acts: acts.length,
    replayed: mode('self-finalized'),
    handedOff: mode('agent-concluded'),
    missed: mode('missed'),
    failed: acts.filter((s) => !s.ok).length,
    stale: acts.filter((s) => s.code === 'REPLAY_STALE').length,
    actModelCalls: acts.reduce((n, s) => n + (s.modelCalls ?? 0), 0),
    reasons: acts.filter((s) => s.cache?.reason).map((s) => `${s.id}:${s.cache.mode}:${s.cache.reason}${s.cache.derived ? `(${s.cache.derived})` : ''}`),
  };
  const result = {
    arm: 'e2e', e2eVersion, target, runid, model, strict, reset: true,
    exitCode: run.status, wallMs, cache, usage: usageOf(report), steps, finalText,
    machine: { platform: process.platform, arch: process.arch, node: process.version, cpus: os.cpus().length, memGb: Math.round(os.totalmem() / 2 ** 30) },
  };
  fs.writeFileSync(path.join(outDir, `${runid}-e2e-result.json`), JSON.stringify(result, null, 2));

  // repair-desk keeps its own mutation log; the verifier reads the copy.
  if (target === 'repairdesk') {
    try {
      const res = await fetch(new URL('/__log', process.env.APP_URL));
      if (res.ok) fs.writeFileSync(path.join(outDir, `${runid}-mutationlog.json`), await res.text());
    } catch { /* the verifier will say so */ }
  }
  const v = spawnSync(process.execPath, [path.join(here, `verify-${target}.mjs`), runid], { encoding: 'utf8', env: { ...process.env, BENCH_OUT: outDir } });
  const vout = `${v.stdout ?? ''}${v.stderr ?? ''}`;
  fs.writeFileSync(path.join(outDir, `${runid}-verify.log`), vout);
  console.log(vout.trim());
  const passed = (vout.match(/objectives passed (\d+\/\d+)/) ?? vout.match(/summary: (\d+\/\d+) objectives PASS/) ?? [, '?'])[1];
  return { runid, verdict: passed, clean: v.status === 0, exit: run.status, wallS: Math.round(wallMs / 1000), cache, usd: result.usage?.usd ?? null };
}

const table = [];
for (let n = 1; n <= k; n++) table.push(await one(`n${n}`));
if (!noStrict) table.push(await one('strict', { strict: true }));

console.log('\n=== e2e sweep summary ===');
console.log('run | objectives | verifier clean | e2e exit | wall s | acts replayed/handed-off/missed/failed | act model calls | usd');
for (const r of table) {
  if (!r.cache) { console.log(`${r.runid} | ${r.verdict}`); continue; }
  const c = r.cache;
  console.log(`${r.runid} | ${r.verdict} | ${r.clean} | ${r.exit} | ${r.wallS} | ${c.replayed}/${c.handedOff}/${c.missed}/${c.failed} of ${c.acts} | ${c.actModelCalls} | ${r.usd == null ? '?' : r.usd.toFixed(4)}`);
  if (c.reasons.length) console.log(`    ${c.reasons.join('  ')}`);
}
fs.writeFileSync(path.join(outDir, `${base}-e2e-sweep.json`), JSON.stringify(table, null, 2));
