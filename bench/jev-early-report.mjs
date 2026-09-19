#!/usr/bin/env node
/**
 * Were Jev's LOW-confidence picks right? (PLAN-jev.md §5.1, the Kanboard question.)
 *
 *   node bench/jev-early-report.mjs <session|file.jsonl> [...]      # shadow runs (SITELOOPER_JEV_SHADOW=actor)
 *
 * On Kanboard the actor acts on ~2% of asks because its picks sit below the
 * gate. Whether to fix that with calibration (a lower, checked gate; agreement
 * across phrasings) or with a better question (sub-goals, regions, richer
 * descriptions) depends on one number this prints: of the element actions Jev
 * picked, by confidence band, how many did the model ALSO take —
 *
 *   same    the model's first action that turn
 *   early   the model took it later in the same turn's batch, or within the
 *           next LOOKAHEAD turns of the same instruction
 *   never   the model did not take it in that window
 *
 * The model is a proxy here, not the truth (it is sometimes wrong, and there
 * can be two valid next actions), so `never` is an upper bound on "wrong". But
 * `same + early` IS a lower bound on "right", and a band where that is ~90% is
 * a band the gate is throwing away.
 *
 * Actions are compared IN WORDS (the ballot's own descriptions, with the
 * volatile `[currently …]` state stripped), because candidate ids are per-ballot.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOOKAHEAD = 3;
const ELEMENT_OPS = new Set(['click', 'fill', 'type', 'select', 'check', 'uncheck']);
const BANDS = [
  [0.75, 1.01, '>=0.75'],
  [0.6, 0.75, '0.60-0.75'],
  [0.4, 0.6, '0.40-0.60'],
  [0.0001, 0.4, '<0.40'],
];

const home = process.env.SITELOOPER_HOME || path.join(os.homedir(), '.sitelooper');
const files = process.argv.slice(2).map((a) => (a.endsWith('.jsonl') ? a : path.join(home, 'sessions', a, 'system-one.jsonl')));
if (!files.length) {
  console.error('usage: node bench/jev-early-report.mjs <session|system-one.jsonl> [...]');
  process.exit(2);
}
const norm = (s) => String(s ?? '').replace(/ \[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const tally = {};
const examples = { never: [], early: [] };
let disagreedOrders = 0;
let asked = 0;
for (const file of files) {
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.site === 'actor.turn');
  // Instructions: the turn counter restarts.
  const groups = [];
  for (const r of rows) {
    if (!groups.length || r.detail.turn <= groups.at(-1).at(-1).detail.turn) groups.push([]);
    groups.at(-1).push(r);
  }
  for (const g of groups) {
    for (const [i, r] of g.entries()) {
      asked++;
      const d = r.detail;
      if (/option orders disagreed/.test(r.why ?? '')) disagreedOrders++;
      if (!ELEMENT_OPS.has(d.jevOperation) || !d.jevPickIs || !(r.confidence > 0)) continue;
      const pick = norm(d.jevPickIs);
      const did = (row) => [...(row.detail.modelActionIs ?? []), ...(row.detail.modelThenIs ?? [])].map(norm);
      let verdict = 'never';
      if ((d.modelActionIs ?? []).map(norm).includes(pick)) verdict = 'same';
      else if (g.slice(i, i + 1 + LOOKAHEAD).some((row) => did(row).includes(pick))) verdict = 'early';
      const band = BANDS.find(([lo, hi]) => r.confidence >= lo && r.confidence < hi)[2];
      const t = (tally[band] ??= { same: 0, early: 0, never: 0 });
      t[verdict]++;
      if (verdict !== 'same' && examples[verdict].length < 12) {
        examples[verdict].push(`${r.confidence.toFixed(2)} ${d.jevPickIs.slice(0, 90)}  | model: ${d.modelTool} ${(d.modelActionIs ?? [])[0]?.slice(0, 60) ?? d.modelTarget ?? ''}`);
      }
    }
  }
}

console.log(`asks ${asked}; the two option orders disagreed on ${disagreedOrders}`);
console.log('band        picks  same  early  never   model also took it');
for (const [, , band] of BANDS) {
  const t = tally[band] ?? { same: 0, early: 0, never: 0 };
  const n = t.same + t.early + t.never;
  console.log(`${band.padEnd(11)} ${String(n).padStart(5)} ${String(t.same).padStart(5)} ${String(t.early).padStart(6)} ${String(t.never).padStart(6)}   ${n ? Math.round((100 * (t.same + t.early)) / n) + '%' : '-'}`);
}
for (const k of ['early', 'never']) {
  console.log(`\n${k}:`);
  for (const e of examples[k]) console.log('  ' + e);
}
