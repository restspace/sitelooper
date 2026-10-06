#!/usr/bin/env node
/**
 * Does a tool say when it failed? For every held-out run, set the tool's own
 * verdict against the app-side verifier's (bench/heldout/score.mjs reads the
 * same branches):
 *
 *   silent wrong  the tool reported success, the verifier found a failure
 *   loud          the verifier found a failure and the tool flagged something
 *   false alarm   the tool flagged something, the verifier found the run clean
 *   clean         both say success
 *
 * The tool's own verdict, per run:
 *   sitelooper n1      every objective "DONE" in the orchestrator's final report
 *   sitelooper n2/n3   the flowrun's status and every step's status are "success"
 *   sitelooper spec    the compiled spec ran and passed (a refused compile is loud)
 *   e2e (every run)    every act, assert and extract in the run returned ok
 *
 *   git fetch origin 'refs/heads/results/h*:refs/remotes/origin/results/h*'
 *   node bench/heldout/honesty.mjs
 */
import { execFileSync } from 'node:child_process';

const APPS = { dx: 'directus', ml: 'mealie', bs: 'bookstack' };
const show = (base, file) => {
  try {
    return execFileSync('git', ['show', `origin/results/${base}:bench/results-published/${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
};
const showJson = (base, file) => { try { return JSON.parse(show(base, file)); } catch { return null; } };

/** The verifier's verdict for one runid: clean, and the objective numbers that failed. */
function verified(text, runid, reportOnlyMayBeUnverifiable = false) {
  if (!text) return null;
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.startsWith(`${runid}: objectives passed`));
  if (at < 0) return null;
  let from = at - 1;
  while (from >= 0 && !/objectives passed|^\[sweep\]|^=== /.test(lines[from])) from--;
  const extra = lines.slice(from + 1, at).some((l) => /\*\*\* (DUPLICATE|EXTRA)/.test(l));
  const failed = [];
  for (let i = at + 1; i < lines.length && /^\s+obj \d+:/.test(lines[i]); i++) {
    const m = lines[i].match(/obj (\d+): (PASS|FAIL|UNVERIFIABLE)/);
    if (m && (m[2] === 'FAIL' || (m[2] === 'UNVERIFIABLE' && !reportOnlyMayBeUnverifiable))) failed.push(Number(m[1]));
  }
  return { clean: !failed.length && !extra, failed, extra };
}

const runs = [];
const add = (arm, kind, runid, claimed, claimedObjs, v, note = '') => {
  if (!v && claimed === null) return;
  runs.push({ arm, kind, runid, claimed, claimedObjs, v, note });
};

for (const code of Object.keys(APPS)) {
  for (const rep of [1, 2, 3]) {
    const sl = `hs${code}${rep}`, ee = `he${code}${rep}`;
    const log = show(sl, `${sl}-sweep.log`);
    if (log) {
      // n1: the orchestrator's final report, one line per objective.
      const res = showJson(sl, `${sl}-n1-sitelooper-result.json`);
      const lines = String(res?.finalText ?? '').split('\n');
      const done = new Set(lines.map((l) => l.match(/^\s*\**(\d+)\.?\**\s*[.:)-]?\s*\**DONE/i)?.[1]).filter(Boolean).map(Number));
      const failedClaims = lines.some((l) => /^\s*\**\d+\.?\**\s*[.:)-]?\s*\**FAILED/i.test(l));
      add('sitelooper', 'record', `${sl}-n1`, !failedClaims && done.size > 0, done, verified(log, `${sl}-n1`));
      for (const n of [2, 3]) {
        const fr = showJson(sl, `${sl}-n${n}-flowrun.json`);
        const ok = fr ? fr.status === 'success' && fr.steps.every((s) => s.status === 'success') : null;
        add('sitelooper', 'replay', `${sl}-n${n}`, ok, null, verified(log, `${sl}-n${n}`),
          fr && !ok ? fr.steps.filter((s) => s.status !== 'success').map((s) => `${s.id}:${s.status}`).join(' ') : '');
      }
      const spec = showJson(sl, `${sl}-spec-spec-result.json`);
      const specV = verified(show(sl, `${sl}-spec-verify.log`), `${sl}-spec`, true);
      if (spec) add('sitelooper', 'no-model', `${sl}-spec`, spec.exitCode === 0 && spec.stats?.failed === 0, null, specV);
      else add('sitelooper', 'no-model', `${sl}-spec`, false, null, { clean: false, failed: ['refused'], extra: false }, 'compile refused');
    }
    if (showJson(ee, `${ee}-e2e-sweep.json`)) {
      for (const tag of ['n1', 'n2', 'n3', 'strict']) {
        const runid = `${ee}-${tag}`;
        const r = showJson(ee, `${runid}-e2e-result.json`);
        const steps = r?.steps ?? [];
        const objOk = new Set();
        const byObj = {};
        for (const s of steps) if (/^obj\d+$/.test(s.id)) (byObj[s.id] ??= []).push(s);
        for (const [id, ss] of Object.entries(byObj)) if (ss.every((s) => s.ok)) objOk.add(Number(id.slice(3)));
        add('e2e', tag === 'n1' ? 'record' : tag === 'strict' ? 'no-model' : 'replay', runid,
          steps.length ? steps.every((s) => s.ok) : null, objOk, verified(show(ee, `${runid}-verify.log`), runid),
          steps.filter((s) => !s.ok).map((s) => `${s.kind} ${s.id}:${s.code}`).join(' '));
      }
    }
  }
}

const cat = (r) => !r.v ? 'unscored' : r.v.clean ? (r.claimed ? 'clean' : 'false alarm') : (r.claimed ? 'SILENT WRONG' : 'loud');
for (const arm of ['sitelooper', 'e2e']) {
  console.log(`\n== ${arm}`);
  for (const kind of ['record', 'replay', 'no-model', 'all']) {
    const rs = runs.filter((r) => r.arm === arm && (kind === 'all' || r.kind === kind));
    const c = {};
    for (const r of rs) c[cat(r)] = (c[cat(r)] ?? 0) + 1;
    const bad = (c['SILENT WRONG'] ?? 0) + (c.loud ?? 0);
    console.log(`  ${kind.padEnd(9)} ${rs.length} runs: clean ${c.clean ?? 0}, failed ${bad} (silent ${c['SILENT WRONG'] ?? 0}, loud ${c.loud ?? 0}), false alarm ${c['false alarm'] ?? 0}`);
  }
  // Objective level, where the tool states a per-objective verdict (sitelooper's
  // recording report; every e2e run).
  let claimedButFailed = 0, failedObjs = 0;
  for (const r of runs.filter((r) => r.arm === arm && r.claimedObjs && r.v)) {
    for (const n of r.v.failed.filter((x) => typeof x === 'number')) {
      failedObjs++;
      if (r.claimedObjs.has(n)) claimedButFailed++;
    }
  }
  console.log(`  objectives the verifier failed where the tool gave a per-objective verdict: ${failedObjs}, of which the tool claimed ${claimedButFailed} as done`);
}
console.log('\nEvery failed run:');
for (const r of runs) {
  const c = cat(r);
  if (c === 'SILENT WRONG' || c === 'loud') console.log(`  ${c.padEnd(12)} ${r.runid.padEnd(14)} verifier failed ${r.v.failed.join(',')}${r.v.extra ? ' +extra' : ''}${r.note ? `  tool flagged: ${r.note}` : ''}`);
}
