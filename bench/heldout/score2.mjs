#!/usr/bin/env node
/**
 * Score held-out 2 (notes/HELDOUT2-PROTOCOL.md, "Scoring, fixed now") from the
 * published results branches, nothing else:
 *
 *   git fetch origin 'refs/heads/results/h[ab]*:refs/remotes/origin/results/h[ab]*'
 *   node bench/heldout/score2.mjs [--json]
 *
 * Arms: results/ha<code><rep> (after = feat/spec-reliability), results/hb<code><rep>
 * (before = main e34fd2d7). Objectives 1 and 7 of every held-out-2 task are
 * report-only; the headline counts STATE objectives (2-6) of the compiled spec.
 */
import { execFileSync } from 'node:child_process';

const APPS = { pk: 'planka', km: 'kimai', gc: 'grocy' };
const REPS = [1, 2, 3];
const REPORT_ONLY = new Set([1, 7]);
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

/** One runid's verdict from verifier output (the same parse as score.mjs), split into state and report objectives. */
function verdict(text, runid) {
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
  const state = objs.filter((o) => !REPORT_ONLY.has(o.n));
  const stateFailed = state.filter((o) => o.v !== 'PASS');
  const allFailed = objs.filter((o) => o.v !== 'PASS');
  return {
    score: (lines[at].match(/(\d+\/\d+)/) ?? [])[1],
    clean: objs.length > 0 && allFailed.length === 0 && extra.length === 0,
    stateClean: state.length > 0 && stateFailed.length === 0 && extra.length === 0,
    reportPassed: objs.filter((o) => REPORT_ONLY.has(o.n) && o.v === 'PASS').length,
    failed: allFailed.map((o) => o.line),
    extra,
  };
}

function arm(base) {
  const sweepLog = show(base, `${base}-sweep.log`);
  if (!sweepLog) return null;
  const sweep = showJson(base, `${base}-sweep.json`);
  const runs = [1, 2, 3].map((n) => {
    const runid = `${base}-n${n}`;
    const v = verdict(sweepLog, runid);
    const r = sweep?.rows?.find((x) => x.n === n);
    let modelFree = null;
    if (n > 1) {
      const fr = showJson(base, `${runid}-flowrun.json`);
      modelFree = fr ? fr.steps.every((s) => s.tier === 'A' && !s.turns && !s.pinStopped) : false;
    }
    return { runid, ...v, usd: r?.total_usd ?? null, wall_s: r?.wall_s ?? null, modelFree };
  });
  const tag = `${base}-spec`;
  // spec-replay names its files after its --tag, which is already <base>-spec.
  const res = showJson(base, `${tag}-spec-result.json`);
  const v = verdict(show(base, `${tag}-verify.log`), tag);
  const compileLog = show(base, `${tag}-spec-compile.log`) ?? show(base, `${tag}-compile.log`) ?? '';
  const refusedCodes = [...new Set([...compileLog.matchAll(/\b(demoted-pin|unproven-pin|unsourced-ref|unbound-pin|unbound-slot|unfilled-slot|no-procedure|needs-rerecord|missing-skill|assert-procedure|literal-credential)\b/g)].map((m) => m[1]))];
  const compiled = Boolean(res?.compiled);
  const pwPassed = compiled ? res.exitCode === 0 : null;
  const spec = {
    runid: tag,
    compiled,
    refusedCodes: compiled ? [] : refusedCodes,
    pwPassed,
    ...(v ?? { score: compiled ? 'unscored' : 'refused', clean: false, stateClean: false, failed: [], extra: [] }),
  };
  // Honest: Playwright's verdict agrees with the app's state objectives. A refusal is honest (it claims nothing).
  spec.honest = compiled ? (v ? pwPassed === v.stateClean : null) : true;
  spec.silentPass = compiled && pwPassed === true && v ? !v.stateClean : false;
  const cvLog = show(base, `${base}-cv-build.log`);
  const cvTag = `${base}-cv-spec`;
  const cv = cvLog ? { buildLine: (cvLog.match(/build --converge.*$/m) ?? [''])[0], ...(verdict(show(base, `${cvTag}-verify.log`), cvTag) ?? { stateClean: false, score: 'unscored' }) } : null;
  return { runs, spec, cv };
}

const rows = [];
for (const [code, app] of Object.entries(APPS)) for (const rep of REPS) rows.push({ app, rep, after: arm(`ha${code}${rep}`), before: arm(`hb${code}${rep}`) });

const tally = (key) => {
  const t = { sweeps: 0, specClean: 0, specRan: 0, honest: 0, silentPass: 0, refused: 0, refusedCodes: {}, modelFree: 0, replays: 0, cleanRuns: 0, runs: 0, usd: 0, reportPassed: 0, cvRan: 0, cvClean: 0 };
  for (const r of rows) {
    const a = r[key];
    if (!a) continue;
    t.sweeps++;
    for (const run of a.runs) {
      t.runs++;
      if (run.clean) t.cleanRuns++;
      if (run.modelFree !== null) { t.replays++; if (run.modelFree) t.modelFree++; }
      t.usd += run.usd ?? 0;
    }
    if (a.spec.stateClean) t.specClean++;
    if (a.spec.compiled) { t.specRan++; if (a.spec.honest) t.honest++; if (a.spec.silentPass) t.silentPass++; t.reportPassed += a.spec.reportPassed ?? 0; }
    else { t.refused++; for (const c of a.spec.refusedCodes) t.refusedCodes[c] = (t.refusedCodes[c] ?? 0) + 1; }
    if (a.cv) { t.cvRan++; if (a.cv.stateClean) t.cvClean++; }
  }
  return t;
};

const totals = { after: tally('after'), before: tally('before') };
if (json) {
  console.log(JSON.stringify({ rows, totals }, null, 2));
} else {
  const cell = (run) => !run ? '—' : `${run.score ?? '?'}${run.clean ? '' : '✗'}${run.modelFree === false ? '·m' : ''}`;
  const specCell = (s) => !s.compiled ? `refused(${s.refusedCodes.join(',') || '?'})` : `${s.score ?? '?'}${s.stateClean ? '' : '✗'} pw:${s.pwPassed ? 'pass' : 'fail'}${s.silentPass ? ' SILENT' : ''}`;
  console.log('app      rep | arm    | n1 n2 n3              | spec                               | converge');
  for (const r of rows) for (const key of ['after', 'before']) {
    const a = r[key];
    console.log(`${r.app.padEnd(8)} ${r.rep}   | ${key.padEnd(6)} | ${a ? a.runs.map(cell).join(' ').padEnd(21) : 'not published'.padEnd(21)} | ${a ? specCell(a.spec).padEnd(34) : '—'.padEnd(34)} | ${a?.cv ? `${a.cv.score}${a.cv.stateClean ? '' : '✗'}` : '—'}`);
  }
  console.log('\n✗ = not clean; ·m = a replay that used the model; spec ✗ counts state objectives (2-6) only\n');
  for (const key of ['after', 'before']) {
    const t = totals[key];
    console.log(`${key.padEnd(6)}: HEADLINE clean compiled spec ${t.specClean}/${t.sweeps} | honest spec ${t.honest}/${t.specRan} (silent passes ${t.silentPass}) | refused ${t.refused} ${JSON.stringify(t.refusedCodes)} | model-free replays ${t.modelFree}/${t.replays} | clean normal runs ${t.cleanRuns}/${t.runs} | spec report objectives passed ${t.reportPassed} | converge clean ${t.cvClean}/${t.cvRan} | $${t.usd.toFixed(2)}`);
  }
  const d = totals.after.specClean - totals.before.specClean;
  const reg = totals.before.cleanRuns - totals.after.cleanRuns;
  console.log(`\nPre-registered decision: headline difference ${d >= 0 ? '+' : ''}${d} (needs >= +2), normal-run regression ${reg} (must be <= 2) → ${d >= 2 && reg <= 2 ? 'IMPROVEMENT' : 'no measurable difference'}${totals.after.sweeps < 9 || totals.before.sweeps < 9 ? ' (INCOMPLETE: not all 9 sweeps per arm published)' : ''}`);
  console.log('\nNot clean, with the reason:');
  for (const r of rows) for (const key of ['after', 'before']) {
    const a = r[key];
    if (!a) continue;
    for (const run of [...a.runs, a.spec]) if (run && !run.clean) console.log(`  ${run.runid}: ${[...(run.failed ?? []), ...(run.extra ?? [])].join(' | ') || (run.refusedCodes?.length ? `refused: ${run.refusedCodes.join(', ')}` : 'no verdict found')}`);
  }
}
