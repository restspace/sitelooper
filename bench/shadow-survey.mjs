#!/usr/bin/env node
/**
 * shadow-survey: re-judge published recordings with the CURRENT shadow rules.
 *
 *   node bench/shadow-survey.mjs <runid>-n1-script.jsonl [...] [--json out.json] [--all]
 *
 * For each recording: its journal coverage, then every successful instruction
 * (a resumed one joined to the attempt it resumes, as the daemon learns it)
 * compiled as learnFromInstruction does (carryOpener over the entries before
 * it), and the shadow rows (skills/shadow.ts) its journal gives. Prints the
 * disagreements (all rows with --all) and a per-rule agree/disagree count.
 * Offline and model-free; reads the built engine in dist/ (npm run build).
 *
 * The daemon's own shadow.jsonl on a results branch was written by the code
 * that ran the sweep; this is what the code under test says about the same
 * recordings.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = (rel) => pathToFileURL(path.join(root, 'dist', rel)).href;
const { parseScript } = await import(dist('daemon/recorder.js'));
const { carryOpener, compileSkills } = await import(dist('skills/compile.js'));
const { shadowVerdicts } = await import(dist('skills/shadow.js'));

const argv = process.argv.slice(2);
const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--json');
const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
const showAll = argv.includes('--all');

/** Instruction groups: [start, end] entry indices, a resume joined to the attempt before it. */
function groups(entries) {
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.k !== 'instruction') continue;
    if (e.resume && out.length) {
      out[out.length - 1].resumed = true;
      continue;
    }
    out.push({ start: i, resumed: false });
  }
  return out.map((g, n) => {
    const next = out[n + 1]?.start ?? entries.length;
    const reports = entries.slice(g.start, next).map((e, j) => [e, g.start + j]).filter(([e]) => e.k === 'report');
    const last = reports[reports.length - 1];
    return { ...g, end: next, report: last ? last[0] : null };
  });
}

const summary = {};
const out = [];
for (const file of files) {
  const runid = path.basename(file).replace(/-script\.jsonl$/, '');
  const entries = parseScript(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).entries;
  const steps = entries.filter((e) => e.k === 'step');
  const journaled = steps.filter((s) => s.journal);
  const readBacks = steps.filter((s) => s.args?.target === '(read-back)').length;
  const events = steps.flatMap((s) => [...(s.journal?.ev ?? []), ...(s.journal?.gap?.ev ?? [])]);
  const cover = {
    runid,
    steps: steps.length,
    journaled: journaled.length,
    readBacks,
    otherUnjournaled: steps.length - journaled.length - readBacks,
    events: events.length,
    unknown: events.filter((e) => e.c?.[0] === 'unknown').length,
    ambiguous: events.filter((e) => e.also !== undefined).length,
  };
  const rows = [];
  for (const g of groups(entries)) {
    if (g.report?.status !== 'success') continue;
    const head = entries[g.start];
    const own = carryOpener(entries.slice(0, g.start), entries.slice(g.start, g.end).filter((e) => !(e.k === 'report' || (e.k === 'instruction' && e.resume))));
    let skills = [];
    try {
      skills = compileSkills({
        entries: own,
        instruction: head.text,
        report: { status: 'success', summary: g.report.summary ?? '', evidence: { values: g.report.values ?? {} } },
        session: runid,
        knownValues: { 'var:runid': runid.replace(/-n\d$/, '') + '-' + (runid.match(/n\d$/)?.[0] ?? 'n1') },
        before: entries.slice(0, g.start),
      });
    } catch (err) {
      rows.push({ rule: '(compile error)', fact: String(err?.message ?? err).slice(0, 200), heuristic: '', agree: true });
      continue;
    }
    for (const r of shadowVerdicts(own, skills, entries.slice(0, g.start))) rows.push({ ...r, instruction: head.text.slice(0, 70) });
  }
  for (const r of rows) {
    summary[r.rule] ??= { agree: 0, disagree: 0 };
    summary[r.rule][r.agree ? 'agree' : 'disagree']++;
  }
  out.push({ cover, rows });
  console.log(`\n=== ${runid}: ${cover.steps} steps, ${cover.journaled} journaled (+${cover.readBacks} read-backs, ${cover.otherUnjournaled} other unjournaled), ${cover.events} events, ${cover.unknown} unknown, ${cover.ambiguous} ambiguous`);
  for (const r of rows) {
    if (r.agree && !showAll) continue;
    console.log(`  [${r.agree ? 'agree' : 'DISAGREE'}] ${r.rule} ${r.seq !== undefined ? '#' + r.seq : ''} ${r.step ?? ''}`);
    console.log(`      fact: ${r.fact}`);
    console.log(`      heuristic: ${r.heuristic}`);
  }
}
console.log('\n=== by rule (agree / disagree)');
for (const [rule, c] of Object.entries(summary).sort()) console.log(`  ${rule.padEnd(18)} ${c.agree} / ${c.disagree}`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ summary, runs: out }, null, 2));
