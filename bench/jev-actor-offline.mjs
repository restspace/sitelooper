#!/usr/bin/env node
/**
 * OFFLINE half of notes/PLAN-jev.md step 5: the actor's question, replayed from
 * stored recordings, before any paid model run.
 *
 *   node bench/jev-actor-offline.mjs --dist ./dist-step5          # the fixture recordings
 *   node bench/jev-actor-offline.mjs --dist ./dist-step5 --session fwrdj2-n1
 *   node bench/jev-actor-offline.mjs --dist ./dist-step5 --dry    # no Jev: coverage only, free
 *   node bench/jev-actor-offline.mjs --dist ./dist-step5 --limit 40 --verbose
 *
 * WHAT IS AND IS NOT REPLAYABLE — read this before believing the numbers.
 *
 * The recordings do NOT carry page state per step. `snapshot` is not in the
 * recorder's RECORDABLE set, so snapshot turns leave no trace at all; `result`
 * is stored only for `read`/`read_all` (RESULT_TOOLS), so the `[page: …]`
 * block the loop folds into a click's result is never persisted; and no
 * transcript is written to the session dir. Grepping the 1,966 fixture lines
 * for a snapshot block returns nothing.
 *
 * What IS stored is one real page reading per instruction:
 * `RecordedInstruction.startText` — the dialect-2 snapshot lines of the page
 * the instruction started on, captured by the loop itself (offerSkills), whole
 * unless `startTextComplete` says otherwise. So exactly one turn per
 * instruction can be replayed honestly: the FIRST action, against the REAL
 * control set that was in front of the agent, with the recorder's own locator
 * chain as the label.
 *
 * That makes this a genuine but PARTIAL probe, and its bias is knowable:
 *
 *  - first-action turns only. Any observe/read turns the agent spent before
 *    acting are invisible, so the tool mix here is not a run's tool mix.
 *  - `startText` is snapshot LINES, so a control is known by role, name, value
 *    and state — never by testid, id or placeholder, and never by which dialog
 *    or row it sits in. Both the ballot and the matching are therefore weaker
 *    here than they are live: descriptions carry less, and a chain headed by a
 *    testid is unmatchable rather than matched.
 *  - no history: the first action of an instruction has none, which is the one
 *    case where the state this builds is complete.
 *
 * Read it as a FLOOR on coverage and a rough read on agreement. The live
 * shadow is the measurement; this is what says whether it is worth running.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const has = (n) => argv.includes(n);

// The repo's dist/ is shared with whatever else is building; a private --dist
// keeps a bench run from racing a build.
const DIST = path.resolve(here, '..', arg('--dist', 'dist'));
const load = (rel) => import(pathToFileURL(path.join(DIST, rel)).href);

const s1mod = await load('agent/system-one.js');
const actor = await load('agent/actor.js');
const actorJev = await load('agent/actor-jev.js');

const DRY = has('--dry');
const VERBOSE = has('--verbose');
const LIMIT = Number(arg('--limit', 0)) || Infinity;

let client = null;
if (!DRY) {
  const config = s1mod.resolveSystemOneConfig();
  if (!config.enabled) {
    console.error('no TypeSafe key resolved — run with --dry for the coverage half, or set SITELOOPER_JEV_API_KEY.');
    process.exit(1);
  }
  client = s1mod.buildSystemOne(config);
}

// --- the cases -----------------------------------------------------------------------

const sessionArg = arg('--session', '');
const home = process.env.SITELOOPER_HOME || path.join(os.homedir(), '.sitelooper');
const files = sessionArg
  ? [path.join(home, 'sessions', sessionArg, 'script.jsonl')]
  : fs
      .readdirSync(path.join(here, 'fixtures', 'recordings'))
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(here, 'fixtures', 'recordings', f));

/**
 * `- role "name" [checked] [disabled]: value` — execution/snapshot.ts
 * renderLines, dialect 2 — back into the controls this instruction's agent was
 * looking at. Anything the line form never carried (testid, id, placeholder,
 * the enclosing dialog or row) is simply absent, which is a real limitation of
 * the offline probe and not a gap to fill with a guess.
 */
const LINE = /^\s*-\s+([a-z]+)\s+"((?:[^"\\]|\\.)*)"(\s+\[checked\])?(\s+\[disabled\])?(?::\s*(.*))?$/;
const TAG_FOR = { button: 'button', link: 'a', textbox: 'input', searchbox: 'input', spinbutton: 'input', combobox: 'select', checkbox: 'input', radio: 'input' };

function controlsFrom(startText) {
  const out = [];
  for (const line of String(startText ?? '').split('\n')) {
    const m = LINE.exec(line);
    if (!m) continue;
    const [, role, rawName, checked, disabled, value] = m;
    const name = rawName.replace(/\\"/g, '"');
    const control = { id: `c${out.length}`, tag: TAG_FOR[role] ?? 'div', role };
    if (name) control.name = name;
    if (checked) control.checked = true;
    else if (role === 'checkbox' || role === 'radio') control.checked = false;
    if (disabled) control.disabled = true;
    if (value) control.value = value.trim();
    if (role === 'textbox' || role === 'searchbox') control.type = 'text';
    if (role === 'spinbutton') control.type = 'number';
    if (role === 'checkbox') control.type = 'checkbox';
    out.push(control);
  }
  return out;
}

/** One replayable case: the page as it was, the instruction, and the action taken on it. */
const cases = [];
for (const file of files) {
  const entries = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((e) => !(e.k === 'step' && e.failed)); // a failed action (RecordedStep.failed) is evidence, never a gesture
  let open = null;
  for (const e of entries) {
    if (e.k === 'instruction') {
      open = { instruction: e, steps: [] };
      continue;
    }
    if (e.k === 'report') {
      if (open) pushCase(path.basename(file), open);
      open = null;
      continue;
    }
    if (e.k === 'step' && open) open.steps.push(e);
  }
  if (open) pushCase(path.basename(file), open);
}

function pushCase(source, group) {
  const { instruction, steps } = group;
  // Dialect 1 and 2 render the same `- role "name"[ state]: value` shape; 2
  // adds ` [disabled]` and sees shadow/frame content. The regex reads both,
  // and the published fixtures are all dialect 1 (startDialect absent).
  if (!instruction.startText) return;
  const first = steps.find((s) => !s.via); // a replayed step was not a decision
  if (!first) return;
  const controls = controlsFrom(instruction.startText);
  if (controls.length < 3) return;
  cases.push({
    source,
    instruction: instruction.text,
    complete: instruction.startTextComplete !== false,
    observation: { id: `${source}:${cases.length}`, url: instruction.url ?? '', controls, truncated: instruction.startTextComplete === false },
    step: first,
  });
}

const chosen = cases.slice(0, LIMIT);
console.log(`${chosen.length} replayable first-action turn(s) from ${files.length} recording(s)${DRY ? ' (dry: coverage only)' : ''}`);
if (!chosen.length) process.exit(0);

// --- coverage, then agreement ----------------------------------------------------------

const results = [];
const started = Date.now();
for (const c of chosen) {
  const { candidates, values } = actor.buildCandidates({ observation: c.observation, instruction: c.instruction });
  const action = actorJev.modelActionOf(
    { id: 'x', name: c.step.tool, args: c.step.args ?? {}, rawArgs: '' },
    [c.step],
  );
  const match = actorJev.matchModelAction(candidates, action);
  const row = { ...c, candidates: candidates.length, values: values.length, action, match, jev: null, ms: 0 };
  if (client && candidates.length >= 3) {
    const at = Date.now();
    row.jev = await actorJev.actorTurnSite
      .run(client, { instruction: c.instruction, observation: c.observation, candidates, values, history: [] }, {})
      .catch((err) => ({ error: String(err?.message ?? err) }));
    row.ms = Date.now() - at;
  }
  results.push(row);
  if (VERBOSE) {
    const picked = row.jev?.chosen ? candidates.find((x) => x.id === row.jev.chosen) : null;
    console.log(
      `  [${c.source}] ${c.instruction.slice(0, 60)}\n` +
        `      model: ${action.tool} ${action.chain?.[0]?.name ?? action.raw ?? ''} -> ${match.coverage}${match.why ? ` (${match.why})` : ''}\n` +
        (row.jev ? `      jev:   ${row.jev.chosen} (${(row.jev.confidence ?? 0).toFixed(2)}) ${picked?.description?.slice(0, 80) ?? row.jev.why ?? ''}\n` : ''),
    );
  }
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');
const count = (fn) => results.filter(fn).length;

console.log(`\ncoverage (the ballot carried the action the agent took)`);
const buckets = {};
for (const r of results) buckets[r.match.coverage] = (buckets[r.match.coverage] ?? 0) + 1;
for (const [k, n] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${String(n).padStart(4)}  ${pct(n, results.length)}`);
const decidable = results.filter((r) => r.match.coverage !== 'unmatchable' && r.match.coverage !== 'non-candidate-tool');
const coveredRows = decidable.filter((r) => r.match.coverage === 'matched' || r.match.coverage === 'ambiguous');
console.log(`  covered, of what could be decided: ${coveredRows.length}/${decidable.length} = ${pct(coveredRows.length, decidable.length)}`);

console.log(`\nby tool`);
const tools = {};
for (const r of results) {
  const b = (tools[r.action.tool] ??= { n: 0, covered: 0, decidable: 0, agreed: 0 });
  b.n++;
  if (r.match.coverage !== 'unmatchable' && r.match.coverage !== 'non-candidate-tool') b.decidable++;
  if (r.match.coverage === 'matched' || r.match.coverage === 'ambiguous') {
    b.covered++;
    if (r.jev?.chosen && r.match.ids.includes(r.jev.chosen)) b.agreed++;
  }
}
for (const [tool, b] of Object.entries(tools).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${tool.padEnd(14)} ${String(b.n).padStart(4)}   covered ${pct(b.covered, b.decidable).padStart(7)}   agreed ${pct(b.agreed, b.covered).padStart(7)}`);
}

if (client) {
  const agreed = (r) => r.jev?.chosen && r.match.ids.includes(r.jev.chosen);
  console.log(`\nagreement, by confidence gate (of the ${coveredRows.length} covered turns)`);
  console.log('gate    turns   agreed   false-accept');
  for (const gate of [0, 0.5, 0.7, 0.85, 0.95]) {
    const at = coveredRows.filter((r) => (r.jev?.confidence ?? 0) >= gate);
    const right = at.filter(agreed);
    console.log(`${gate.toFixed(2)}  ${String(at.length).padStart(6)}   ${pct(right.length, at.length).padStart(6)}   ${pct(at.length - right.length, at.length).padStart(12)}`);
  }
  console.log(`\nlatency: ${Math.round(results.reduce((n, r) => n + r.ms, 0) / results.length)}ms mean per turn, ${((Date.now() - started) / 1000).toFixed(1)}s total`);

  console.log(`\ndisagreements (a human decides these — the agent's action is a proxy label, not the truth)`);
  let shown = 0;
  for (const r of coveredRows) {
    if (agreed(r) || shown >= 15) continue;
    shown++;
    const { candidates } = actor.buildCandidates({ observation: r.observation, instruction: r.instruction });
    const picked = candidates.find((x) => x.id === r.jev?.chosen);
    console.log(
      `  [${r.source}] ${r.instruction.slice(0, 70)}\n` +
        `      agent: ${r.action.tool} ${r.action.chain?.[0]?.name ?? r.action.raw ?? ''}\n` +
        `      jev  : ${picked?.description?.slice(0, 90) ?? r.jev?.why ?? '(deferred)'} (${(r.jev?.confidence ?? 0).toFixed(2)})`,
    );
  }
  if (!shown) console.log('  (none)');
}

console.log(
  `\nCAVEATS — this probe replays the FIRST action of each instruction only, against startText (snapshot\n` +
    `lines), so controls have no testid/id/placeholder and no dialog or row context. Coverage here is a\n` +
    `FLOOR; a chain headed by a testid reads as unmatchable rather than matched, and descriptions carry\n` +
    `less than they do live. ${count((r) => !r.complete)} case(s) had an incomplete startText.`,
);
