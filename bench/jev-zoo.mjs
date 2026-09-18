#!/usr/bin/env node
/**
 * THE REGRESSION ZOO for PLAN-jev.md sites I and J — record-time value/occurrence
 * triage and expectation triage, both ADVISORY.
 *
 *   node bench/jev-zoo.mjs                      # the labelled zoo, live
 *   node bench/jev-zoo.mjs --corpus             # ...and the noise rate on real recordings
 *   node bench/jev-zoo.mjs --dist ./dist-step2  # a private build (the repo dist is shared)
 *   node bench/jev-zoo.mjs --only occurrence --verbose
 *
 * WHY THIS EXISTS
 *
 * The plan's gate for promoting I/J past advisory is two-sided, and one side
 * is usually forgotten: "sides with the eventual fix on the named cases AND
 * stays quiet on the corpus". A triage that catches every fwgr8 and also
 * disputes a fifth of an ordinary session has not helped anyone — every one of
 * those disputes would, once promoted, cost a model turn.
 *
 * So this prints four things, in this order of importance:
 *
 *  1. Accuracy against TRUTH (what the eventual fix decided), with a confusion
 *     table and every miss named. Truth, not the rule's answer.
 *  2. The 2x2 of rule vs Jev vs truth: where Jev is right and the rules wrong
 *     (the case for promotion), and where the rules are right and Jev wrong
 *     (the case against).
 *  3. A reliability table — confidence bucket to accuracy. Thresholds come
 *     from here, never from the docs' generic 0.5/0.9, and never transfer
 *     between primitives.
 *  4. With --corpus, the disagreement rate over the published recordings in
 *     bench/fixtures/recordings: how loud the log would be on ordinary data.
 *
 * The enumerators are the product's own (src/skills/triage.ts): every
 * `ruleSaid` printed here is what `substitute`/`replaceToken`/the mask chain
 * actually returned, not a second implementation of them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const has = (n) => argv.includes(n);

// The repo's `dist/` is shared with whatever else is building; a private
// --dist keeps a bench run from racing a build.
const DIST = path.resolve(here, '..', arg('--dist', 'dist'));
const load = (rel) => import(pathToFileURL(path.join(DIST, rel)).href);

const s1 = await load('agent/system-one.js');
const triage = await load('skills/triage.js');
const jev = await load('skills/triage-jev.js');
const { replaceToken } = await load('skills/flow.js');

const ONLY = arg('--only', '');
const VERBOSE = has('--verbose');
const CORPUS_LIMIT = Number(arg('--corpus-limit', 8));

const config = s1.resolveSystemOneConfig();
if (!config.enabled) {
  console.error(`System One is not enabled (mode=${config.mode}): set ${config.keyEnvVars.join(' or ')}.`);
  process.exit(2);
}
const usage = { inputTokens: 0, requests: 0 };
const client = s1.buildSystemOne(config, (_m, u) => {
  usage.inputTokens += u.inputTokens;
  usage.requests += 1;
});

const zoo = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'jev-zoo.json'), 'utf8'));

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const pad = (s, n) => String(s).padEnd(n);

// --- the zoo, turned into decisions by the product's own enumerators --------

/** One occurrence case -> the ThreadingDecision the compiler/exporter would have produced. */
function occurrenceCase(c) {
  const values = [{ value: c.input.value, label: c.input.label, whereReadFrom: c.input.from, ...(c.input.obtained ? { source: c.input.obtained } : {}) }];
  const sites = [{ kind: c.input.kind, where: c.id, text: c.input.text, ...(c.input.via ? { via: c.input.via } : {}) }];
  const all = triage.threadingDecisions(values, sites);
  const d = all[c.input.nth ?? 0];
  if (!d) throw new Error(`${c.id}: the value does not occur in the text (occurrence ${c.input.nth ?? 0} of ${all.length})`);
  return d;
}

function expectationCase(c) {
  const entries = [
    { k: 'instruction', text: c.input.procedure },
    { k: 'step', tool: c.input.tool, args: {}, locators: {}, diff: { url: '', alerts: [], added: [c.input.line] } },
  ];
  // `slots` is what the compiler substitutes before any mask runs. A zoo case
  // that carries one is representing the production shape: the line the daemon
  // hands the site already has `{{vN}}` where the procedure's own values were.
  const slots = new Map(Object.entries(c.input.slots ?? {}));
  const [d] = triage.expectationDecisions({ entries, slots });
  if (!d) throw new Error(`${c.id}: the line produced no decision`);
  return { ...d, where: c.id };
}

// --- reporting --------------------------------------------------------------

/**
 * Score one site's verdicts against truth AND against the rules.
 *
 * `agrees` on a verdict is Jev-vs-RULE. Truth is the third axis, and the whole
 * point: a disagreement where Jev is right is the argument for promotion, and
 * one where the rule is right is the argument against.
 */
function score(name, rows, labels) {
  const [neg, pos] = labels; // [the "leave it alone" label, the "act" label]
  const scored = rows.filter((r) => r.truth !== undefined && r.jevSaid !== undefined);
  const hit = scored.filter((r) => r.jevSaid === r.truth);
  const ruleHit = scored.filter((r) => r.ruleSaid === r.truth);
  console.log(`\n=== ${name} — ${scored.length} case(s) ===`);
  console.log(`accuracy   jev ${pad(pct(hit.length, scored.length), 8)} (${hit.length}/${scored.length})`);
  console.log(`           rule ${pad(pct(ruleHit.length, scored.length), 7)} (${ruleHit.length}/${scored.length})`);

  // Confusion, truth down the side and Jev across the top.
  const cell = (t, j) => scored.filter((r) => r.truth === t && r.jevSaid === j).length;
  console.log(`\nconfusion (rows = truth, cols = jev)`);
  console.log(`              ${pad(neg, 14)}${pad(pos, 14)}`);
  for (const t of [neg, pos]) console.log(`  ${pad(t, 12)}${pad(cell(t, neg), 14)}${pad(cell(t, pos), 14)}`);

  // The argument for and against promotion.
  const both = (jevRight, ruleRight) => scored.filter((r) => (r.jevSaid === r.truth) === jevRight && (r.ruleSaid === r.truth) === ruleRight);
  console.log(`\nrule vs jev (against truth)`);
  console.log(`  both right           ${both(true, true).length}`);
  console.log(`  jev right, rule wrong ${both(true, false).length}   <- the case FOR promotion`);
  console.log(`  rule right, jev wrong ${both(false, true).length}   <- the case AGAINST`);
  console.log(`  both wrong            ${both(false, false).length}`);
  for (const r of both(true, false)) console.log(`    + ${pad(r.id, 34)} truth=${pad(r.truth, 12)} rule=${r.ruleSaid} (${r.rule})`);
  for (const r of both(false, true)) console.log(`    - ${pad(r.id, 34)} truth=${pad(r.truth, 12)} jev=${r.jevSaid} conf=${r.confidence.toFixed(2)}`);

  // Reliability. Thresholds are read off this, per site and per primitive.
  const buckets = [
    ['0.00-0.20', 0, 0.2],
    ['0.20-0.40', 0.2, 0.4],
    ['0.40-0.60', 0.4, 0.6],
    ['0.60-0.80', 0.6, 0.8],
    ['0.80-1.00', 0.8, 1.01],
  ];
  console.log(`\nreliability (confidence bucket -> accuracy)`);
  for (const [label, lo, hi] of buckets) {
    const inBucket = scored.filter((r) => r.confidence >= lo && r.confidence < hi);
    if (!inBucket.length) continue;
    const right = inBucket.filter((r) => r.jevSaid === r.truth).length;
    console.log(`  ${pad(label, 12)}${pad(`n=${inBucket.length}`, 8)}${pct(right, inBucket.length)}`);
  }

  const misses = scored.filter((r) => r.jevSaid !== r.truth);
  if (misses.length) {
    console.log(`\nmisses (${misses.length})`);
    for (const r of misses) {
      console.log(`  ${pad(r.id, 34)} truth=${pad(r.truth, 12)} jev=${pad(r.jevSaid, 12)} conf=${r.confidence.toFixed(2)}  rule=${r.ruleSaid}`);
      if (r.note) console.log(`      ${r.note}`);
      if (VERBOSE && r.probe) console.log(`      ${JSON.stringify(r.probe)}`);
    }
  }
  const unscored = rows.filter((r) => r.truth === undefined || r.jevSaid === undefined);
  if (unscored.length) console.log(`\nnot scored: ${unscored.length} (${unscored.map((r) => r.id).join(', ')})`);
  return { n: scored.length, jev: hit.length, rule: ruleHit.length };
}

// --- site I -----------------------------------------------------------------

if (ONLY !== 'expectation') {
  const cases = zoo.occurrence.map((c) => ({ c, d: occurrenceCase(c) }));
  const verdicts = await jev.triageOccurrences(client, cases.map((x) => x.d));
  if (!verdicts) {
    console.error('triage.occurrence: the fan-out did not complete — nothing to score (all-or-nothing, by design)');
  } else {
    const byIndex = new Map(verdicts.map((v) => [v.decision.where + '\u0000' + v.decision.span[0], v]));
    const rows = cases.map(({ c, d }) => {
      const v = byIndex.get(d.where + '\u0000' + d.span[0]);
      return {
        id: c.id,
        truth: c.truth,
        note: c.note,
        ruleSaid: d.ruleSaid,
        rule: d.rule,
        jevSaid: v?.jevSaid,
        confidence: v?.confidence ?? 0,
        probe: v ? { token: d.enclosingToken, minted: v.value.minted, typed: v.value.typed, clock: v.value.clock, stable: v.value.stable } : undefined,
      };
    });
    score('triage.occurrence (is this occurrence the value, or a coincidence?)', rows, ['coincidence', 'same']);
  }
}

// --- site J -----------------------------------------------------------------

if (ONLY !== 'occurrence') {
  const cases = zoo.expectation.map((c) => ({ c, d: expectationCase(c) }));
  const verdicts = await jev.triageExpectations(client, cases.map((x) => x.d));
  if (!verdicts) {
    console.error('triage.expectation: the fan-out did not complete — nothing to score');
  } else {
    const byLine = new Map(verdicts.map((v) => [v.decision.where, v]));
    const rows = cases.map(({ c, d }) => {
      const v = byLine.get(d.where);
      const answer = triage.ruleAnswer(d);
      return {
        id: c.id,
        // A line the rules dropped for identifying no element was never asked
        // J's question (triage.ts ruleAnswer) — reported, never scored.
        truth: answer === 'uninformative' ? undefined : c.truth,
        note: (c.note ? c.note + ' ' : '') + (answer === 'uninformative' ? '[rule answer: uninformative]' : ''),
        ruleSaid: answer,
        rule: d.rule,
        jevSaid: v?.jevSaid,
        confidence: v?.confidence ?? 0,
        probe: v ? { masked: d.masked } : undefined,
      };
    });
    score('triage.expectation (would this line be on the page on every run?)', rows, ['this-run', 'every-run']);
  }
}

// --- the corpus: how loud would this be on ordinary data? -------------------

/**
 * The slot map the compiler would have built, approximated for an offline
 * corpus run: compile's rule is "any literal the agent typed that also occurs
 * as a whole token in the instruction becomes a slot", and `replaceToken` is
 * the token half of it. The approximation is here and not in src/ because the
 * real caller (the export path) has the compiled skill's params in hand and
 * needs no guess. Without it every `admin` and every typed title reads as the
 * app's own value and maskMinted fires on half the corpus.
 */
function approximateSlots(entries) {
  const slots = new Map();
  let instruction = '';
  let n = 0;
  for (const e of entries) {
    if (e.k === 'instruction') instruction = e.text;
    if (e.k !== 'step') continue;
    for (const [key, value] of Object.entries(e.args ?? {})) {
      if (!['value', 'text', 'option'].includes(key) || typeof value !== 'string' || value.length < 2) continue;
      if (replaceToken(instruction, value, ' ') === instruction) continue;
      if ([...slots.values()].includes(value)) continue;
      slots.set(`v${++n}`, value);
    }
  }
  return slots;
}

if (has('--corpus')) {
  const dir = path.join(here, 'fixtures', 'recordings');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('-script.jsonl')).slice(0, CORPUS_LIMIT);
  console.log(`\n=== corpus noise (${files.length} published recording(s)) ===`);
  console.log(`How often Jev contradicts the shape rules on ORDINARY data, and how much of that`);
  console.log(`survives a confidence gate. Promoted to a veto, every surviving row is a threading`);
  console.log(`refusal or a dropped expectation line: read the columns as a cost, not a finding.\n`);
  console.log(`${pad('recording', 14)}${pad('pairs', 7)}${pad('all', 8)}${pad('>=.4', 8)}${pad('>=.6', 8)}${pad('lines', 7)}${pad('all', 8)}${pad('>=.4', 8)}${pad('>=.6', 8)}`);
  const total = { pairs: 0, lines: 0 };
  const dis = { p: [0, 0, 0], l: [0, 0, 0] };
  const rate = (v, n) => [pct(v[0], n), pct(v[1], n), pct(v[2], n)];
  for (const f of files) {
    const entries = fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const runid = f.replace('-script.jsonl', '');
    const slots = approximateSlots(entries);
    const pairs = triage.threadingDecisions(triage.recordedValues(entries, { runid }), triage.recordedTexts(entries));
    const lines = triage.expectationDecisions({ entries, slots });
    const [occ, exp] = await Promise.all([
      jev.triageOccurrences(client, pairs, { timeoutMs: 120_000 }),
      jev.triageExpectations(client, lines, { timeoutMs: 120_000 }),
    ]);
    if (!occ || !exp) {
      console.log(`${pad(runid, 14)}the fan-out did not complete (all-or-nothing) — no rows`);
      continue;
    }
    const scoredExp = exp.filter((v) => v.agrees !== undefined);
    const count = (rows, lo) => rows.filter((r) => !r.agrees && r.confidence >= lo).length;
    const p = [count(occ, 0), count(occ, 0.4), count(occ, 0.6)];
    const l = [count(scoredExp, 0), count(scoredExp, 0.4), count(scoredExp, 0.6)];
    total.pairs += occ.length;
    total.lines += scoredExp.length;
    for (let i = 0; i < 3; i++) {
      dis.p[i] += p[i];
      dis.l[i] += l[i];
    }
    const [pa, pb, pc] = rate(p, occ.length);
    const [la, lb, lc] = rate(l, scoredExp.length);
    console.log(`${pad(runid, 14)}${pad(occ.length, 7)}${pad(pa, 8)}${pad(pb, 8)}${pad(pc, 8)}${pad(scoredExp.length, 7)}${pad(la, 8)}${pad(lb, 8)}${pad(lc, 8)}`);
    if (VERBOSE) {
      for (const r of occ.filter((x) => !x.agrees && x.confidence >= 0.6).slice(0, 6)) {
        console.log(`    pair  ${pad(JSON.stringify(r.decision.value), 18)} in ${pad(JSON.stringify(r.decision.enclosingToken), 28)} rule=${pad(r.decision.ruleSaid, 12)} jev=${pad(r.jevSaid, 12)} ${r.confidence.toFixed(2)}`);
      }
      for (const r of scoredExp.filter((x) => !x.agrees && x.confidence >= 0.6).slice(0, 6)) {
        console.log(`    line  ${pad(JSON.stringify(r.decision.slotted).slice(0, 56), 58)} rule=${pad(triage.ruleAnswer(r.decision), 12)} jev=${pad(r.jevSaid, 10)} ${r.confidence.toFixed(2)}`);
      }
    }
  }
  const [pa, pb, pc] = rate(dis.p, total.pairs);
  const [la, lb, lc] = rate(dis.l, total.lines);
  console.log(`${pad('TOTAL', 14)}${pad(total.pairs, 7)}${pad(pa, 8)}${pad(pb, 8)}${pad(pc, 8)}${pad(total.lines, 7)}${pad(la, 8)}${pad(lb, 8)}${pad(lc, 8)}`);
}

console.log(`\nspend: ${usage.requests} request(s), ${usage.inputTokens} input tokens (~$${((usage.inputTokens / 1e6) * 0.042).toFixed(4)})`);
