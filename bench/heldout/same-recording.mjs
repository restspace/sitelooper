#!/usr/bin/env node
/**
 * Held-out 2, same-recording A/B (notes/HELDOUT2-PROTOCOL.md, Log 2026-10-06):
 * compile the SAME published recordings with both code versions and run each
 * compiled spec against a reset app. No model call anywhere, so the recording
 * variance that dominated the sweep comparison drops out and only the
 * compile/runtime code differs.
 *
 *   node bench/heldout/same-recording.mjs --target planka --code pk [--runs 2]
 *
 * Needs: this checkout (the AFTER code, built), /tmp/before (the BEFORE code,
 * built — the same worktree the h2 box prompts make), the app up and seeded.
 * Recordings: results/ha<code><1-3> and results/hb<code><1-3>, each its flow
 * (<base>.json) and store (<base>-skills/), copied fresh for every run.
 * Tags: sr<code>-<a|b>-<base>-<k> (a = after code, b = before code). Order
 * alternates per run so neither version always runs first on a reset app.
 * Writes bench/results/sr<code>-summary.json; publish with
 *   node bench/publish-results.mjs --base sr<code>
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
if (!target || !code) { console.error('usage: same-recording.mjs --target <t> --code <pk|km|gc> [--runs 2]'); process.exit(2); }
for (const root of [afterRoot, beforeRoot]) if (!fs.existsSync(path.join(root, 'dist', 'cli.js'))) { console.error(`not built: ${root}`); process.exit(2); }

const out = path.join(afterRoot, 'bench', 'results');
fs.mkdirSync(out, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), `sr${code}-`));
const sh = (cmd, args, o = {}) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...o });
const log = (m) => { console.log(`[same-recording] ${m}`); fs.appendFileSync(path.join(out, `sr${code}-run.log`), `${m}\n`); };

const bases = ['a', 'b'].flatMap((arm) => [1, 2, 3].map((r) => `h${arm}${code}${r}`));
sh('git', ['fetch', '-q', 'origin', ...bases.map((b) => `+refs/heads/results/${b}:refs/remotes/origin/results/${b}`)], { cwd: afterRoot });

/** A fresh copy of one recording's flow and store, so no run can see another's writes. */
function recording(base, slot) {
  const dir = path.join(work, `${base}-${slot}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const tar = sh('git', ['archive', '--format=tar', `origin/results/${base}`, `bench/results-published/${base}.json`, `bench/results-published/${base}-skills`], { cwd: afterRoot, encoding: 'buffer' });
  if (tar.status !== 0) return null;
  sh('tar', ['-x', '-C', dir], { input: tar.stdout, encoding: 'buffer' });
  const pub = path.join(dir, 'bench', 'results-published');
  return { flow: path.join(pub, `${base}.json`), skills: path.join(pub, `${base}-skills`) };
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

function runOne(version, base, k) {
  const root = version === 'a' ? afterRoot : beforeRoot;
  const tag = `sr${code}-${version}-${base}-${k}`;
  const rec = recording(base, `${version}${k}`);
  if (!rec) return { tag, version, base, k, missing: true };
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
    errors: (res?.tests ?? []).filter((t) => !t.ok).map((t) => String(t.error ?? '').slice(0, 300)),
    wallMs: Date.now() - t0,
  };
  row.silentPass = row.pwPassed === true && !row.stateClean;
  log(`${tag}: ${compiled ? `pw ${row.pwPassed ? 'pass' : 'fail'}, verifier ${row.score} state ${row.stateClean ? 'clean' : 'NOT clean'}${row.silentPass ? ' SILENT' : ''}` : `refused ${refusal.join(' | ').slice(0, 200)}`}`);
  return row;
}

const rows = [];
for (let k = 1; k <= runs; k++) {
  for (const [i, base] of bases.entries()) {
    const order = (k + i) % 2 === 0 ? ['a', 'b'] : ['b', 'a'];
    for (const v of order) rows.push(runOne(v, base, k));
  }
}
const tally = (v) => {
  const r = rows.filter((x) => x.version === v && !x.missing);
  return { runs: r.length, stateClean: r.filter((x) => x.stateClean).length, refused: r.filter((x) => !x.compiled).length, pwPassed: r.filter((x) => x.pwPassed).length, silentPasses: r.filter((x) => x.silentPass).length, honest: r.filter((x) => x.compiled && x.pwPassed === x.stateClean).length, compiled: r.filter((x) => x.compiled).length };
};
const summary = { target, code, runs, at: new Date().toISOString(), after: tally('a'), before: tally('b'), rows };
fs.writeFileSync(path.join(out, `sr${code}-summary.json`), JSON.stringify(summary, null, 2));
log(`after:  ${JSON.stringify(summary.after)}`);
log(`before: ${JSON.stringify(summary.before)}`);
fs.rmSync(work, { recursive: true, force: true });
