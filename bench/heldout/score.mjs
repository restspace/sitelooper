#!/usr/bin/env node
/**
 * Score the held-out comparison (notes/HELDOUT-PROTOCOL.md, "Scoring, fixed
 * now") from the published results branches, nothing else:
 *
 *   git fetch origin 'refs/heads/results/h*:refs/remotes/origin/results/h*'
 *   node bench/heldout/score.mjs [--json]
 *
 * For every app x repetition it reads results/hs<code><rep> (sitelooper) and
 * results/he<code><rep> (e2e) and reports, per arm:
 *   1. clean normal runs (n1-n3): verifier all PASS, no DUPLICATE / EXTRA line
 *   2. clean no-model run: sitelooper's compiled spec (report-only objectives may
 *      be UNVERIFIABLE), e2e's strict-cache run
 *   3. model-free replays (n2, n3): sitelooper every step tier A with 0 turns;
 *      e2e every act self-finalized, or an act that took no action
 *   4. cost (USD) and wall clock per run
 */
import { execFileSync } from 'node:child_process';

const APPS = { dx: 'directus', ml: 'mealie', bs: 'bookstack' };
const REPS = [1, 2, 3];
const json = process.argv.includes('--json');

const show = (base, file) => {
  try {
    return execFileSync('git', ['show', `origin/results/${base}:bench/results-published/${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
};
const showJson = (base, file) => {
  const t = show(base, file);
  try { return t ? JSON.parse(t) : null; } catch { return null; }
};

/**
 * One runid's verdict from verifier output: the `<runid>: objectives passed`
 * block, its objective lines, and any DUPLICATE / EXTRA line printed for it
 * (the verifiers print those just before the summary line).
 */
function verdict(text, runid, { reportOnlyMayBeUnverifiable = false } = {}) {
  if (!text) return null;
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.startsWith(`${runid}: objectives passed`));
  if (at < 0) return null;
  let from = at - 1;
  while (from >= 0 && !/objectives passed|^\[sweep\]|^=== /.test(lines[from])) from--;
  const extra = lines.slice(from + 1, at).filter((l) => /\*\*\* (DUPLICATE|EXTRA)/.test(l)).map((l) => l.trim());
  const objs = [];
  for (let i = at + 1; i < lines.length && /^\s+obj \d+:/.test(lines[i]); i++) {
    const m = lines[i].match(/obj (\d+): (PASS|FAIL|UNVERIFIABLE)/);
    if (m) objs.push({ n: Number(m[1]), v: m[2], line: lines[i].trim() });
  }
  const failed = objs.filter((o) => o.v === 'FAIL' || (o.v === 'UNVERIFIABLE' && !reportOnlyMayBeUnverifiable));
  return {
    score: (lines[at].match(/(\d+\/\d+)/) ?? [])[1],
    clean: objs.length > 0 && failed.length === 0 && extra.length === 0,
    failed: failed.map((o) => o.line),
    extra,
  };
}

const rows = [];
for (const [code, app] of Object.entries(APPS)) {
  for (const rep of REPS) {
    const sl = `hs${code}${rep}`, ee = `he${code}${rep}`;
    const row = { app, rep, sitelooper: null, e2e: null };

    const sweepLog = show(sl, `${sl}-sweep.log`);
    if (sweepLog) {
      const sweep = showJson(sl, `${sl}-sweep.json`);
      const runs = [1, 2, 3].map((n) => {
        const runid = `${sl}-n${n}`;
        const v = verdict(sweepLog, runid);
        const r = sweep?.rows?.find((x) => x.n === n);
        let modelFree = null;
        if (n > 1) {
          const fr = showJson(sl, `${runid}-flowrun.json`);
          modelFree = fr ? fr.steps.every((s) => s.tier === 'A' && !s.turns) : false;
        }
        return { runid, ...v, usd: r?.total_usd ?? null, wall_s: r?.wall_s ?? null, modelFree };
      });
      const specVerify = show(sl, `${sl}-spec-verify.log`);
      const spec = specVerify
        ? verdict(specVerify, `${sl}-spec`, { reportOnlyMayBeUnverifiable: true })
        : { clean: false, score: 'refused', failed: [(show(sl, `${sl}-spec-spec-compile.log`) ?? show(sl, `${sl}-spec-compile.log`) ?? 'no spec output').trim().split('\n').slice(-2).join(' ')], extra: [] };
      row.sitelooper = { runs, noModel: { runid: `${sl}-spec`, ...spec } };
    }

    const eSweep = showJson(ee, `${ee}-e2e-sweep.json`);
    if (eSweep) {
      const runOf = (tag) => {
        const runid = `${ee}-${tag}`;
        const v = verdict(show(ee, `${runid}-verify.log`), runid);
        const res = showJson(ee, `${runid}-e2e-result.json`);
        const acts = (res?.steps ?? []).filter((s) => s.kind === 'act');
        const modelFree = tag === 'n1' ? null
          : acts.length > 0 && acts.every((s) => s.ok && (s.cache?.mode === 'self-finalized' || s.actions === 0));
        return { runid, ...v, usd: res?.usage?.usd ?? null, wall_s: res ? Math.round(res.wallMs / 1000) : null, modelFree, cache: res?.cache ?? null };
      };
      row.e2e = { runs: ['n1', 'n2', 'n3'].map(runOf), noModel: runOf('strict') };
    }
    rows.push(row);
  }
}

const tally = (arm) => {
  const t = { sweeps: 0, cleanRuns: 0, runs: 0, cleanNoModel: 0, modelFreeReplays: 0, replays: 0, usd: 0 };
  for (const r of rows) {
    const a = r[arm];
    if (!a) continue;
    t.sweeps++;
    for (const run of a.runs) {
      t.runs++;
      if (run.clean) t.cleanRuns++;
      if (run.modelFree !== null) { t.replays++; if (run.modelFree) t.modelFreeReplays++; }
      t.usd += run.usd ?? 0;
    }
    if (a.noModel?.clean) t.cleanNoModel++;
  }
  return t;
};

if (json) {
  console.log(JSON.stringify({ rows, totals: { sitelooper: tally('sitelooper'), e2e: tally('e2e') } }, null, 2));
} else {
  const cell = (run) => !run ? '—' : `${run.score ?? '?'}${run.clean ? '' : '✗'}${run.modelFree === false ? '·m' : ''}`;
  console.log('app        rep | sitelooper n1 n2 n3 | spec      | e2e n1 n2 n3        | strict');
  for (const r of rows) {
    const s = r.sitelooper, e = r.e2e;
    console.log(`${r.app.padEnd(10)} ${r.rep}   | ${s ? s.runs.map(cell).join(' ') : 'not published'} | ${s ? `${s.noModel?.score ?? '?'}${s.noModel?.clean ? '' : '✗'}` : '—'} | ${e ? e.runs.map(cell).join(' ') : 'not published'} | ${e ? `${e.noModel?.score ?? '?'}${e.noModel?.clean ? '' : '✗'}` : '—'}`);
  }
  console.log('\n✗ = not clean (a FAIL, an EXTRA/DUPLICATE line, or unscored); ·m = a replay that used the model for acting\n');
  for (const arm of ['sitelooper', 'e2e']) {
    const t = tally(arm);
    console.log(`${arm.padEnd(10)}: clean normal runs ${t.cleanRuns}/${t.runs}, clean no-model runs ${t.cleanNoModel}/${t.sweeps}, model-free replays ${t.modelFreeReplays}/${t.replays}, total $${t.usd.toFixed(2)} over ${t.sweeps} sweep(s)`);
  }
  console.log('\nNot clean, with the reason:');
  for (const r of rows) for (const arm of ['sitelooper', 'e2e']) {
    const a = r[arm];
    if (!a) continue;
    for (const run of [...a.runs, { ...a.noModel, runid: a.noModel?.runid ?? `${arm} no-model` }]) {
      if (!run || run.clean) continue;
      console.log(`  ${run.runid ?? '?'}: ${[...(run.failed ?? []), ...(run.extra ?? [])].join(' | ') || 'no verdict found'}`);
    }
  }
}
