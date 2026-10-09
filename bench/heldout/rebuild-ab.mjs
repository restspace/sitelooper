#!/usr/bin/env node
/**
 * Rebuild A/B (compile reliability group 1, notes/CONTRACT-compile-g1.md):
 * the same-recording A/B (same-recording.mjs) compiles the PUBLISHED stores,
 * so it cannot see a change to how skills are compiled FROM a recording —
 * items 1(b) and 2 of group 1 are exactly that. This rebuilds each published
 * n1 recording's skills and flow offline with each code version
 * (bench/rebuild-flow.mjs: REBUILD_STORE_DIR + REBUILD_DUMP), then compiles
 * and runs the spec against a reset app. No model call anywhere; the
 * recording is held constant, only the code differs.
 *
 *   node bench/heldout/rebuild-ab.mjs --target kimai --code km [--runs 2]
 *
 * Needs: this checkout (AFTER code, built), /tmp/before (BEFORE code, built,
 * with THIS checkout's bench/rebuild-flow.mjs copied in so both sides rebuild
 * the same way), the app up and seeded. Recordings: results/ha<code><1-3> and
 * results/hb<code><1-3>, each its n1 script. Tags rb<code>-<a|b>-<base>-<k>.
 * The spec compiled here is the recording's alone (n1 stats, no replay
 * learning), the same for both versions.
 * Writes bench/results/rb<code>-summary.json; publish with
 *   node bench/publish-results.mjs --base rb<code>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const afterRoot = path.resolve(here, '..', '..');
const beforeRoot = '/tmp/before';
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const target = opt('target');
const code = opt('code');
const runs = Number(opt('runs', '2'));
if (!target || !code) { console.error('usage: rebuild-ab.mjs --target <t> --code <pk|km|gc> [--runs 2]'); process.exit(2); }
for (const root of [afterRoot, beforeRoot]) {
  if (!fs.existsSync(path.join(root, 'dist', 'cli.js'))) { console.error(`not built: ${root}`); process.exit(2); }
  if (!fs.existsSync(path.join(root, 'bench', 'rebuild-flow.mjs'))) { console.error(`no rebuild-flow.mjs in ${root}`); process.exit(2); }
}

const out = path.join(afterRoot, 'bench', 'results');
fs.mkdirSync(out, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), `rb${code}-`));
const sh = (cmd, args, o = {}) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...o });
const log = (m) => { console.log(`[rebuild-ab] ${m}`); fs.appendFileSync(path.join(out, `rb${code}-run.log`), `${m}\n`); };

const bases = ['a', 'b'].flatMap((arm) => [1, 2, 3].map((r) => `h${arm}${code}${r}`));
sh('git', ['fetch', '-q', 'origin', ...bases.map((b) => `+refs/heads/results/${b}:refs/remotes/origin/results/${b}`)], { cwd: afterRoot });

/** The n1 recording alone, in a directory of its own (rebuild-flow reads every <tag>-n*-script.jsonl it finds). */
function recordingDir(base) {
  const dir = path.join(work, 'rec', base);
  fs.mkdirSync(dir, { recursive: true });
  const file = `bench/results-published/${base}-n1-script.jsonl`;
  const r = sh('git', ['show', `origin/results/${base}:${file}`], { cwd: afterRoot });
  if (r.status !== 0) return null;
  fs.writeFileSync(path.join(dir, `${base}-n1-script.jsonl`), r.stdout);
  return dir;
}

/** Rebuild one recording with one code version: a fresh store and flow, kept as a pristine copy. */
function rebuild(version, base, recDir) {
  const root = version === 'a' ? afterRoot : beforeRoot;
  const dir = path.join(work, 'built', `${version}-${base}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const store = path.join(dir, 'skills');
  const flow = path.join(dir, `${base}.json`);
  const r = sh(process.execPath, [path.join(root, 'bench', 'rebuild-flow.mjs'), '--tag', base, '--dir', recDir], {
    cwd: root,
    env: { ...process.env, REBUILD_STORE_DIR: store, REBUILD_DUMP: flow },
  });
  fs.writeFileSync(path.join(out, `rb${code}-${version}-${base}-rebuild.log`), (r.stdout ?? '') + (r.stderr ?? ''));
  if (!fs.existsSync(flow) || !fs.existsSync(store)) return null;
  // Published for inspection: the rebuilt flow and store each version compiled.
  fs.cpSync(dir, path.join(out, `rb${code}-${version}-${base}-rebuilt`), { recursive: true });
  return { flow, store };
}

/** A fresh copy for one spec run, so no run sees another's writes. */
function copyOf(built, slot) {
  const dir = path.join(work, 'run', slot);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(built.store, path.join(dir, 'skills'), { recursive: true });
  const flow = path.join(dir, path.basename(built.flow));
  fs.copyFileSync(built.flow, flow);
  return { flow, skills: path.join(dir, 'skills') };
}

/** The verifier's per-objective verdicts for one runid (objectives 1 and 7 are report-only in every held-out-2 task). */
function verdict(text, runid) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.startsWith(`${runid}: objectives passed`));
  if (at < 0) return null;
  const objs = [];
  for (let i = at + 1; i < lines.length && /^\s+obj \d+:/.test(lines[i]); i++) {
    const m = lines[i].match(/obj (\d+): (PASS|FAIL|UNVERIFIABLE)/);
    if (m) objs.push({ n: Number(m[1]), v: m[2], line: lines[i].trim() });
  }
  const extra = lines.slice(Math.max(0, at - 12), at).filter((l) => /\*\*\* (DUPLICATE|EXTRA)/.test(l) && l.includes(runid)).map((l) => l.trim());
  const state = objs.filter((o) => o.n !== 1 && o.n !== 7);
  return { score: (lines[at].match(/(\d+\/\d+)/) ?? [])[1], stateClean: state.length > 0 && state.every((o) => o.v === 'PASS') && !extra.length, failed: objs.filter((o) => o.v !== 'PASS').map((o) => o.line), extra };
}

function runOne(version, base, k, built) {
  const root = version === 'a' ? afterRoot : beforeRoot;
  const tag = `rb${code}-${version}-${base}-${k}`;
  if (!built) {
    log(`${tag}: rebuild produced no flow/store`);
    return { tag, version, base, k, rebuildFailed: true, compiled: false, refusal: ['rebuild failed'] };
  }
  const rec = copyOf(built, `${version}-${base}-${k}`);
  const t0 = Date.now();
  const spec = sh(process.execPath, [path.join(root, 'bench', 'spec-replay.mjs'), '--flow', rec.flow, '--skills', rec.skills, '--tag', tag, '--target', target, '--reset', '--out', out], { cwd: root });
  fs.writeFileSync(path.join(out, `${tag}-spec-run.log`), (spec.stdout ?? '') + (spec.stderr ?? ''));
  let res = null;
  try { res = JSON.parse(fs.readFileSync(path.join(out, `${tag}-spec-result.json`), 'utf8')); } catch { /* none */ }
  const ver = sh(process.execPath, [path.join(afterRoot, 'bench', `verify-${target}.mjs`), tag], { cwd: afterRoot, env: { ...process.env, BENCH_OUT: out } });
  const vtext = (ver.stdout ?? '') + (ver.stderr ?? '');
  fs.writeFileSync(path.join(out, `${tag}-verify.log`), vtext);
  const compiled = Boolean(res?.compiled);
  const v = compiled ? verdict(vtext, tag) : null;
  const refusal = compiled ? null : (fs.existsSync(path.join(out, `${tag}-spec-compile.log`)) ? fs.readFileSync(path.join(out, `${tag}-spec-compile.log`), 'utf8').split('\n').filter((l) => /^error |refused/.test(l)).slice(0, 3) : ['no compile log']);
  const row = {
    tag, version, base, k, compiled, refusal,
    pwPassed: compiled ? res.exitCode === 0 : null,
    stateClean: Boolean(v?.stateClean), score: v?.score ?? null,
    failed: v?.failed ?? [], extra: v?.extra ?? [],
    driftCount: res?.driftCount ?? null,
    errors: (res?.tests ?? []).filter((t) => !t.ok).map((t) => String(t.error ?? '').slice(0, 300)),
    wallMs: Date.now() - t0,
  };
  row.silentPass = row.pwPassed === true && !row.stateClean;
  log(`${tag}: ${compiled ? `pw ${row.pwPassed ? 'pass' : 'fail'}, verifier ${row.score} state ${row.stateClean ? 'clean' : 'NOT clean'}${row.silentPass ? ' SILENT' : ''}, drift ${row.driftCount}` : `refused ${refusal.join(' | ').slice(0, 200)}`}`);
  return row;
}

const built = {};
for (const base of bases) {
  const recDir = recordingDir(base);
  for (const v of ['a', 'b']) {
    built[`${v}-${base}`] = recDir ? rebuild(v, base, recDir) : null;
    log(`rebuilt ${v} ${base}: ${built[`${v}-${base}`] ? 'ok' : recDir ? 'FAILED' : 'no n1 script'}`);
  }
}

const rows = [];
for (let k = 1; k <= runs; k++) {
  for (const [i, base] of bases.entries()) {
    const order = (k + i) % 2 === 0 ? ['a', 'b'] : ['b', 'a'];
    for (const v of order) rows.push(runOne(v, base, k, built[`${v}-${base}`]));
  }
}
const tally = (v) => {
  const r = rows.filter((x) => x.version === v);
  return { runs: r.length, stateClean: r.filter((x) => x.stateClean).length, refused: r.filter((x) => !x.compiled).length, pwPassed: r.filter((x) => x.pwPassed).length, silentPasses: r.filter((x) => x.silentPass).length, honest: r.filter((x) => x.compiled && x.pwPassed === x.stateClean).length, compiled: r.filter((x) => x.compiled).length, drift: r.reduce((n, x) => n + (x.driftCount ?? 0), 0) };
};
const summary = { target, code, runs, at: new Date().toISOString(), after: tally('a'), before: tally('b'), rows };
fs.writeFileSync(path.join(out, `rb${code}-summary.json`), JSON.stringify(summary, null, 2));
log(`after:  ${JSON.stringify(summary.after)}`);
log(`before: ${JSON.stringify(summary.before)}`);
fs.rmSync(work, { recursive: true, force: true });
