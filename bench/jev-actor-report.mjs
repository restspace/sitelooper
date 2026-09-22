#!/usr/bin/env node
/**
 * THE q MEASUREMENT for notes/PLAN-jev.md §4c — the shadow actor's numbers.
 *
 *   node bench/jev-actor-report.mjs                        # every session that has actor rows
 *   node bench/jev-actor-report.mjs fwrdj2-n1 fwrdj2-n2    # named sessions
 *   node bench/jev-actor-report.mjs --dir path/to/session  # any directory holding system-one.jsonl
 *   node bench/jev-actor-report.mjs --json                 # the same numbers, machine-readable
 *
 * WHAT IT IS FOR
 *
 * §4c's whole bet rests on ONE unknown: q, the share of inner-model TIME a
 * System One actor could take. Everything else in the speedup formula is
 * measured (p from timing.jsonl, r from the two latencies). This script turns
 * the shadow's log into q — and, just as importantly, into the reasons q is
 * not higher, which is where the next piece of work is.
 *
 *   new/old = (1 - p) + p x ((1 - q) + q/r)
 *
 * TWO NUMBERS, NOT ONE. Coverage (was the model's action on the ballot?) and
 * agreement (did Jev pick it?) fail independently, and only their product
 * bounds q. A generator that never offers the right action caps the tier
 * however well the picking works, so both are printed, always, apart.
 *
 * WEIGHTED BY MODEL MS, NOT BY CALL COUNT. The recommendations are explicit
 * about why: the calls that remain hard may be the slowest ones, and a
 * coverage figure counted per call would flatter a tier that takes only the
 * cheap turns.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const all = (n) => argv.reduce((acc, a, i) => (argv[i - 1] === n ? [...acc, a] : acc), []);
const JSON_OUT = has('--json');
const GATES = [0.5, 0.7, 0.85, 0.95];
const SITE = 'actor.turn';

const home = process.env.SITELOOPER_HOME || path.join(os.homedir(), '.sitelooper');
const named = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--dir');
const dirs = [
  ...all('--dir').map((d) => path.resolve(d)),
  ...named.map((s) => path.join(home, 'sessions', s)),
];
if (!dirs.length) {
  const root = path.join(home, 'sessions');
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root)) {
      const dir = path.join(root, entry);
      if (fs.existsSync(path.join(dir, 'system-one.jsonl'))) dirs.push(dir);
    }
  }
}

const readJsonl = (file) =>
  fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    : [];

/** Every actor row, and every instruction's timing, across the sessions asked for. */
const rows = [];
const timings = [];
for (const dir of dirs) {
  for (const r of readJsonl(path.join(dir, 'system-one.jsonl'))) if (r.site === SITE) rows.push({ ...r, session: path.basename(dir) });
  for (const t of readJsonl(path.join(dir, 'timing.jsonl'))) timings.push({ ...t, session: path.basename(dir) });
}

if (!rows.length) {
  console.error(
    `no '${SITE}' rows found in ${dirs.length} session(s).\n` +
      `Run a recording with the shadow on:  SITELOOPER_JEV_SHADOW=actor sitelooper ...\n` +
      `(searched: ${dirs.slice(0, 5).join(', ')}${dirs.length > 5 ? ` and ${dirs.length - 5} more` : ''})`,
  );
  process.exit(1);
}

// --- the readings ------------------------------------------------------------------

const d = (r) => r.detail ?? {};
/** Turns whose action this generator models at all — the denominator of coverage. */
const inScope = rows.filter((r) => d(r).coverage !== 'non-candidate-tool');
const decidable = inScope.filter((r) => d(r).coverage !== 'unmatchable');
const covered = decidable.filter((r) => d(r).coverage === 'matched' || d(r).coverage === 'ambiguous');
const ms = (list) => list.reduce((n, r) => n + (d(r).modelMs || 0), 0);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');
const totalMs = ms(rows);

/** One row per turn TYPE: which kinds of turn are takeable is the deliverable. */
function byType(list) {
  const out = new Map();
  for (const r of list) {
    const key = d(r).modelTool ?? '(none)';
    const b = out.get(key) ?? { turns: 0, modelMs: 0, covered: 0, agreed: 0, decidable: 0, targetChecked: 0 };
    b.turns++;
    b.modelMs += d(r).modelMs || 0;
    if (d(r).coverage !== 'unmatchable' && d(r).coverage !== 'non-candidate-tool') b.decidable++;
    if (d(r).coverage === 'matched' || d(r).coverage === 'ambiguous') {
      b.covered++;
      if (r.agrees) b.agreed++;
      if (d(r).targetChecked) b.targetChecked++;
    }
    out.set(key, b);
  }
  return [...out.entries()].sort((a, b) => b[1].modelMs - a[1].modelMs);
}

/**
 * q at a confidence gate: the share of MODEL TIME spent on turns this tier
 * would have taken AND got right (by the model's own action as the label).
 * The denominator is every turn's model time, non-candidate tools included —
 * a turn the tier cannot touch is time it cannot save, and leaving it out
 * would be the most flattering error available here.
 */
function atGate(gate) {
  const confident = covered.filter((r) => r.confidence >= gate);
  const right = confident.filter((r) => r.agrees);
  const wrong = confident.filter((r) => !r.agrees);
  return {
    gate,
    turns: confident.length,
    q: totalMs ? ms(right) / totalMs : 0,
    qByCount: rows.length ? right.length / rows.length : 0,
    falseAccept: confident.length ? wrong.length / confident.length : 0,
    falseAcceptMs: ms(confident) ? ms(wrong) / ms(confident) : 0,
  };
}

// p, measured: the share of an instruction's wall-clock spent waiting on the
// inner model. From timing.jsonl, which step 3 exists to produce; a run
// without it says so rather than guessing one.
const p = timings.length
  ? timings.reduce((n, t) => n + (t.modelMs || 0), 0) / Math.max(1, timings.reduce((n, t) => n + (t.totalMs || 0), 0))
  : null;
// r, measured: how much faster the replaced decision is. Mean over mean, not
// the mean of ratios — what the formula divides is total time, not per-turn
// speedups.
const meanModelMs = rows.length ? totalMs / rows.length : 0;
const meanJevMs = rows.length ? rows.reduce((n, r) => n + (d(r).jevMs || r.ms || 0), 0) / rows.length : 0;
const r = meanJevMs ? meanModelMs / meanJevMs : null;
const speedup = (q) => (p === null || r === null ? null : 1 / (1 - p + p * (1 - q + q / r)));

const coverageCounts = {};
for (const row of rows) coverageCounts[d(row).coverage ?? '(none)'] = (coverageCounts[d(row).coverage ?? '(none)'] ?? 0) + 1;

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        sessions: dirs.map((x) => path.basename(x)),
        turns: rows.length,
        coverage: coverageCounts,
        p,
        r,
        meanModelMs,
        meanJevMs,
        gates: GATES.map((g) => ({ ...atGate(g), speedup: speedup(atGate(g).q) })),
        byType: Object.fromEntries(byType(rows)),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// --- the print -----------------------------------------------------------------------

const bar = (s) => `\n${s}\n${'-'.repeat(s.length)}`;
console.log(`shadow actor — ${rows.length} turn(s) over ${dirs.length} session(s): ${dirs.map((x) => path.basename(x)).join(', ')}`);
console.log(`model time observed: ${(totalMs / 1000).toFixed(1)}s across these turns; mean ${Math.round(meanModelMs)}ms/turn, jev mean ${Math.round(meanJevMs)}ms/turn`);

console.log(bar('1. turns by tool — weighted by the model time each costs'));
console.log('tool            turns   model s   share    covered   agreed   target-checked');
for (const [tool, b] of byType(rows)) {
  console.log(
    `${tool.padEnd(15)} ${String(b.turns).padStart(5)} ${(b.modelMs / 1000).toFixed(1).padStart(9)} ${pct(b.modelMs, totalMs).padStart(7)} ` +
      `${pct(b.covered, b.decidable).padStart(9)} ${pct(b.agreed, b.covered).padStart(8)} ${pct(b.targetChecked, b.covered).padStart(15)}`,
  );
}

console.log(bar('2. coverage — could the model\'s action even be picked?'));
for (const [k, n] of Object.entries(coverageCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${String(n).padStart(5)}  ${pct(n, rows.length)}`);
console.log(`  covered, of the turns we could decide: ${covered.length}/${decidable.length} = ${pct(covered.length, decidable.length)} by count, ${pct(ms(covered), ms(decidable))} by model ms`);
console.log(`  UNMATCHABLE turns are excluded from both numerator and denominator — they are missing data, not evidence.`);

console.log(bar('3. agreement, by confidence gate'));
console.log('gate    turns   agree(count)   agree(model ms)   false-accept   false-accept(ms)');
for (const g of GATES) {
  const a = atGate(g);
  const confident = covered.filter((x) => x.confidence >= g);
  const right = confident.filter((x) => x.agrees);
  console.log(
    `${g.toFixed(2)}  ${String(a.turns).padStart(6)}   ${pct(right.length, confident.length).padStart(12)}   ${pct(ms(right), ms(confident)).padStart(15)}   ` +
      `${(100 * a.falseAccept).toFixed(1).padStart(12)}%   ${(100 * a.falseAcceptMs).toFixed(1).padStart(15)}%`,
  );
}

console.log(bar('4. q — the share of model TIME this tier would take, and the speedup it implies'));
console.log(`p (model share of wall-clock, measured${p === null ? ', MISSING' : ''}): ${p === null ? 'no timing.jsonl in these sessions — rerun after step 3 landed' : (100 * p).toFixed(1) + '%'}`);
console.log(`r (model ms / jev ms, measured): ${r === null ? '—' : r.toFixed(1) + 'x'}`);
console.log('gate     q(model ms)   q(count)    implied speedup');
for (const g of GATES) {
  const a = atGate(g);
  const s = speedup(a.q);
  console.log(`${g.toFixed(2)}   ${(100 * a.q).toFixed(1).padStart(10)}%   ${(100 * a.qByCount).toFixed(1).padStart(7)}%    ${s === null ? '—' : s.toFixed(2) + 'x'}`);
}

console.log(bar('5. the top disagreements — these need a human, not a number'));
const disagreements = covered
  .filter((x) => !x.agrees)
  .sort((a, b) => (d(b).modelMs || 0) - (d(a).modelMs || 0))
  .slice(0, 15);
for (const x of disagreements) {
  console.log(
    `  [${x.session} turn ${d(x).turn}] ${d(x).modelMs}ms model — model: ${d(x).modelTool} ${d(x).modelTarget ?? ''}\n` +
      `      jev (${x.confidence.toFixed(2)}, ${d(x).turnType}): ${d(x).jevPick} = ${d(x).jevOperation}${d(x).kindConflict ? ' [kind conflict]' : ''}`,
  );
}
if (!disagreements.length) console.log('  (none)');

console.log(bar('6. what these numbers do and do not say'));
console.log(
  [
    '- AGREEMENT WITH THE MODEL IS NOT CORRECTNESS. The model\'s action is a proxy label, and it is often',
    '  the wrong action — recordings need recovery precisely because of that. A disagreement above may be',
    '  Jev being right; only reading them settles it, which is why section 5 exists.',
    '- q here is an UPPER BOUND on what an acting tier would save on these turns and a LOWER bound on the',
    '  work left: it assumes a taken turn costs only Jev\'s latency, with no extra observation, no failed',
    '  action, and no change in planning quality. The doc\'s formula holds all other work constant.',
    '- Turns matched at the level of the MOVE (read, wait, observe, report) had no target checked. The',
    '  "target-checked" column says how much of each tool\'s agreement rests on an element actually',
    '  identified; a low figure there means the agreement is about timing, not aim.',
    '- Coverage is measured against ONE observation revision taken while the model was thinking. A page',
    '  that changed between that look and the action shows up as a coverage miss.',
    '- p is over whole instructions (timing.jsonl); the turns logged here may be a subset of them.',
  ].join('\n'),
);
