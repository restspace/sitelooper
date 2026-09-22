#!/usr/bin/env node
/**
 * Offline measurement for site C of notes/PLAN-jev.md — the read-back cascade
 * (`src/agent/readback.ts`). No browser, no conventional model; `--jev` adds
 * live System One calls for the ambiguous values only.
 *
 *   node bench/readback-offline.mjs
 *   node bench/readback-offline.mjs --sessions fwrdj3-n1,fwrdj4-n1 --dist /tmp/dist-sitec --json
 *   node bench/readback-offline.mjs --jev            # live ballot on the ambiguous values
 *
 * WHAT IT REPLAYS, AND WHAT IT CANNOT
 *
 * A recording holds everything about the decision except the page. It holds
 * the reported values, the read-back steps that were filed and under which
 * label, and — this is what makes an offline replay possible at all — each
 * instruction's `startText`: the aria snapshot of the page as that instruction
 * BEGAN. Nothing navigates between one instruction's report and the next
 * instruction's first look, so instruction N+1's `startText` is the page
 * instruction N's read-back synthesis ran against.
 *
 * It is a PROXY for the DOM, in three ways that all understate the code path:
 *
 *  - accessible nodes, not elements. A value shown in a plain <div> or a <p>
 *    with no role may have no line at all (it is often folded into an ancestor
 *    node's name), so this counts it ABSENT where the live sweep would find
 *    exactly one element. The `line` tier — a value on a wrapper's own line —
 *    is exactly what the proxy is worst at.
 *  - the recorded dialect is FLAT: no indentation, so there is no ancestry and
 *    the "smallest element" reduction cannot run. A `row` line and its `cell`
 *    line are siblings here, so the only reduction left is the exact-over-line
 *    preference, and a value the row and the cell both show EXACTLY counts as
 *    ambiguous where the live sweep drops the row as an ancestor.
 *  - form controls carry their value in the node name, so a value only a
 *    control holds looks like an element here; the live sweep counts it as an
 *    occurrence and offers nothing (captureReadBackAt cannot read a control).
 *
 * The straggler set is reconstructed, not recorded: a reported value is
 * straggler-LIKE when the instruction filed no read-back labelled with its
 * name and no read of the instruction's own returned it. That is the set
 * `captureReadBack` refused, which is the set the cascade sees — except that
 * it also contains the values the prose-identifier path pinned unlabelled,
 * which is why `pinnedUnlabelled` is reported separately.
 *
 * THE LIVE A/B, which measures the thing itself rather than a proxy:
 *
 *   node bench/harness.mjs --app repairdesk --runs 1 --tag rbC-off
 *   SITELOOPER_JEV=off node bench/harness.mjs --app repairdesk --runs 1 --tag rbC-on
 *
 * and compare `inner.timing`: the `locate` turn rows (model time) against the
 * `locate(code)` / `locate(jev)` rows this change writes in their place. One
 * repairdesk recording is ~$0.08.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const JSON_OUT = argv.includes('--json');
const USE_JEV = argv.includes('--jev');
const SESSIONS = String(arg('--sessions', 'fwrdj3-n1,fwrdj4-n1')).split(',').filter(Boolean);
const HOME = process.env.SITELOOPER_HOME || path.join(os.homedir(), '.sitelooper');
const distRoot = path.resolve(here, String(arg('--dist', '../dist')));
const dist = (rel) => pathToFileURL(path.join(distRoot, rel)).href;

const { displays, displayersOf, READ_BACK_MAX_VALUE_CHARS, MAX_CANDIDATES } = await import(dist('agent/readback.js'));

const fold = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** One session's script.jsonl, grouped into instructions. */
function groupsOf(session) {
  const file = path.join(HOME, 'sessions', session, 'script.jsonl');
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const groups = [];
  let cur = null;
  for (const entry of lines) {
    if (entry.k === 'instruction') {
      cur = { instruction: entry, steps: [], report: null };
      groups.push(cur);
    } else if (cur) {
      if (entry.k === 'report') cur.report = entry;
      else cur.steps.push(entry);
    }
  }
  return groups;
}

/** The accessible-node lines of a recorded startText, as candidate elements. */
function elementsOf(startText) {
  if (!startText) return null;
  const out = [];
  startText.split('\n').forEach((line, i) => {
    const m = /^\s*-\s*([^"]*?)\s*"([\s\S]*)"\s*$/.exec(line);
    if (!m) return;
    out.push({ path: `line:${i}`, text: m[2], tag: m[1].trim() || 'node' });
  });
  return out;
}

/** What each instruction's read-back synthesis was left holding. */
function stragglersOf(group) {
  if (!group.report || group.report.status !== 'success') return [];
  const values = Object.entries(group.report.values ?? {});
  const readBacks = group.steps.filter((s) => s.args?.target === '(read-back)');
  const labelled = new Set(readBacks.filter((s) => s.label).map((s) => s.label));
  const unlabelled = new Set(readBacks.filter((s) => !s.label).map((s) => fold(JSON.parse(s.result ?? '""'))));
  const reads = group.steps
    .filter((s) => (s.tool === 'read' || s.tool === 'read_all') && s.args?.target !== '(read-back)')
    .map((s) => String(s.result ?? ''));
  return values
    .filter(([name, value]) => value && !labelled.has(name) && !reads.some((r) => r.includes(String(value))))
    .map(([name, value]) => ({ name, value: String(value), pinnedUnlabelled: unlabelled.has(fold(value)) }));
}

/**
 * The verdict the code decider would reach, given this page. Mirrors
 * `sourceReadBacks` exactly, minus what only a live DOM can supply.
 */
function verdictFor(value, elements) {
  const folded = fold(value);
  if (!folded) return 'empty';
  if (folded.length > READ_BACK_MAX_VALUE_CHARS) return 'prose';
  if (!elements) return 'unknown';
  const shown = elements.filter((e) => displays(e.text, value) !== null);
  const displayers = displayersOf(elements, value);
  if (displayers.length > MAX_CANDIDATES) return 'list';
  if (displayers.length === 1) return 'code';
  if (displayers.length > 1) return 'ambiguous';
  // Nothing displays it. Absence is only PROVEN when nothing contains it
  // either — the live sweep counts occurrences it cannot offer.
  return shown.length || elements.some((e) => fold(e.text).includes(folded)) ? 'unsourceable' : 'absent';
}

const KINDS = ['code', 'ambiguous', 'absent', 'prose', 'unsourceable', 'list', 'unknown', 'empty'];
const totals = Object.fromEntries(KINDS.map((k) => [k, 0]));
const rows = [];
const ballots = [];

for (const session of SESSIONS) {
  let groups;
  try {
    groups = groupsOf(session);
  } catch (err) {
    console.error(`[skip] ${session}: ${err.message}`);
    continue;
  }
  const timingFile = path.join(HOME, 'sessions', session, 'timing.jsonl');
  const timing = fs.existsSync(timingFile)
    ? fs.readFileSync(timingFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    : [];
  groups.forEach((group, i) => {
    const stragglers = stragglersOf(group);
    if (!stragglers.length) return;
    const elements = elementsOf(groups[i + 1]?.instruction?.startText);
    const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
    const detail = [];
    for (const s of stragglers) {
      const verdict = verdictFor(s.value, elements);
      counts[verdict] += 1;
      totals[verdict] += 1;
      detail.push({ ...s, verdict });
      if (verdict === 'ambiguous') ballots.push({ session, step: i, name: s.name, value: s.value, candidates: displayersOf(elements, s.value) });
    }
    const locate = (timing[i]?.turns ?? []).filter((t) => (t.tools ?? []).includes('locate'));
    const modelMs = locate.reduce((n, t) => n + (t.modelMs ?? 0), 0);
    // The model call survives only if something is left for it.
    const left = counts.ambiguous + counts.unsourceable + counts.list + counts.unknown;
    rows.push({ session, step: i, stragglers: stragglers.length, ...counts, locateCalls: locate.length, modelMs, wouldStillCall: left > 0, detail });
  });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ totals, rows }, null, 2));
} else {
  console.log('session      step  strag  code  ambig  absent  prose  other  locate  modelMs  model still called?');
  for (const r of rows) {
    console.log(
      `${r.session.padEnd(12)} ${String(r.step).padStart(4)} ${String(r.stragglers).padStart(6)} ${String(r.code).padStart(5)} ` +
        `${String(r.ambiguous).padStart(6)} ${String(r.absent).padStart(7)} ${String(r.prose).padStart(6)} ` +
        `${String(r.unsourceable + r.list + r.unknown + r.empty).padStart(6)} ${String(r.locateCalls).padStart(7)} ${String(r.modelMs).padStart(8)}  ${r.wouldStillCall ? 'yes' : 'NO'}`,
    );
  }
  const saved = rows.filter((r) => !r.wouldStillCall);
  const savedMs = saved.reduce((n, r) => n + r.modelMs, 0);
  const allMs = rows.reduce((n, r) => n + r.modelMs, 0);
  console.log('');
  console.log(`totals: ${JSON.stringify(totals)}`);
  console.log(`instructions with a straggler: ${rows.length}; model call skipped on ${saved.length} of them`);
  console.log(`locate model time: ${(allMs / 1000).toFixed(1)}s recorded, ${(savedMs / 1000).toFixed(1)}s of it on instructions that would no longer call`);
  console.log(`ambiguous values that would reach a ballot: ${ballots.length}`);
}

// --- the calibration probe (optional) ----------------------------------------
//
// `--probe` runs LABELLED ballots: the cases below are the shapes site C
// actually meets, taken from the repairdesk recordings, each with the answer
// the page itself settles. The gate is not read off raw accuracy but off where
// the WRONG answers stop: it must sit above every wrong-but-confident case and
// below as many right ones as possible. A `none` on a case whose answer is a
// row is a deferral (costs what the tool cost before), not a wrong answer.

const PROBE_CASES = [
  {
    id: 'part-price-vs-total',
    why: 'fwrdj4-n1 04-add: $250.00 is Part B\'s price cell AND the parts total, which equals it while one part is unpriced',
    instruction: "add a second part named 'RD Part B' with cost 200 and markup 25; report the price the app computes",
    name: 'new_part_price',
    value: '$250.00',
    candidates: [
      { path: 'p0', tag: 'td', text: '$250.00', column: 'Price', row: 'fwrdj4-n1 RD Part B $200.00 25% 1 No supplier $250.00 Edit Delete' },
      { path: 'p1', tag: 'td', text: '$250.00', column: 'Price', row: 'Total (price × quantity) $250.00' },
    ],
    want: 'p0',
  },
  {
    id: 'total-vs-part-price',
    why: 'the same two elements, asked for the TOTAL instead',
    instruction: 'report the parts table total for this ticket',
    name: 'parts_table_total',
    value: '$250.00',
    candidates: [
      { path: 'p0', tag: 'td', text: '$250.00', column: 'Price', row: 'fwrdj4-n1 RD Part B $200.00 25% 1 No supplier $250.00 Edit Delete' },
      { path: 'p1', tag: 'td', text: '$250.00', column: 'Price', row: 'Total (price × quantity) $250.00', testid: 'parts-total' },
    ],
    want: 'p1',
  },
  {
    id: 'ref-breadcrumb-vs-detail',
    why: 'fwod26: the record reference sits in the breadcrumb and in the detail field; the field is the record',
    instruction: "create a repair ticket titled 'RD Bench Ticket' and report its reference",
    name: 'ticket_reference',
    value: 'RD-1021',
    candidates: [
      { path: 'p0', tag: 'span', text: 'RD-1021', row: 'Tickets / RD-1021', section: 'Repair tickets' },
      { path: 'p1', tag: 'p', text: 'RD-1021', testid: 'ticket-ref', heading: 'fwrdj4-n1 RD Bench Ticket' },
    ],
    want: 'p1',
  },
  {
    id: 'status-detail-vs-list',
    why: 'the ticket under work shows Draft in its status badge; other tickets show Draft in the list behind it',
    instruction: 'report the current status of ticket RD-1021',
    name: 'ticket_current_status',
    value: 'Draft',
    candidates: [
      { path: 'p0', tag: 'td', text: 'Draft', column: 'Status', row: 'RD-1014 Under-counter fridge door misaligned Marlow Bakery Draft 1 2026-01-23' },
      { path: 'p1', tag: 'span', text: 'Draft', testid: 'ticket-status', heading: 'fwrdj4-n1 RD Bench Ticket' },
    ],
    want: 'p1',
  },
  {
    id: 'error-line-repeated',
    why: 'fwrdj4-n1 06-refuse: the same unmet-precondition line in the alert and in the summary above it',
    instruction: "attempt to mark RD-1021 Ready and report the refusal verbatim",
    name: 'error_bullet_1',
    value: 'Part "fwrdj4-n1 RD Part A" has no supplier',
    candidates: [
      { path: 'p0', tag: 'li', text: 'Part "fwrdj4-n1 RD Part A" has no supplier', testid: 'error-unmet', section: 'Ticket is not ready' },
      { path: 'p1', tag: 'p', text: 'Part "fwrdj4-n1 RD Part A" has no supplier', section: 'Parts' },
    ],
    want: 'p0',
  },
  {
    id: 'duplicate-rows',
    why: 'two tickets of the same status in a list: no element is that value\'s own place, and a coin flip would pin the wrong run\'s record (fwod9)',
    instruction: 'report the statuses shown in the tickets list',
    name: 'first_row_status',
    value: 'Ready',
    candidates: [
      { path: 'p0', tag: 'td', text: 'Ready', column: 'Status', row: 'RD-1009 Espresso grinder jams Cafe Nord Ready 2 2026-01-19' },
      { path: 'p1', tag: 'td', text: 'Ready', column: 'Status', row: 'RD-1007 Dishwasher leaks Pinehurst Ready 1 2026-01-17' },
    ],
    want: null,
  },
  {
    id: 'customer-detail-vs-list',
    why: 'the customer name on the ticket under work, and the same customer in the list row behind it',
    instruction: 'report the customer on ticket RD-1021',
    name: 'ticket_customer',
    value: 'Bench Test Customer',
    candidates: [
      { path: 'p0', tag: 'td', text: 'Bench Test Customer', column: 'Customer', row: 'RD-1021 fwrdj4-n1 RD Bench Ticket Bench Test Customer Draft 0 2026-09-18' },
      { path: 'p1', tag: 'p', text: 'Customer: Bench Test Customer · Raised 2026-09-18', testid: 'ticket-customer', heading: 'fwrdj4-n1 RD Bench Ticket' },
    ],
    want: 'p1',
  },
  {
    id: 'runid-substring',
    why: 'fwrdj4-n1 02-create: the runid appears inside the title, the part names and the search box — it has no own element',
    instruction: "create a repair ticket titled 'fwrdj4-n1 RD Bench Ticket'",
    name: 'test_id',
    value: 'fwrdj4-n1',
    candidates: [
      { path: 'p0', tag: 'h1', text: 'fwrdj4-n1 RD Bench Ticket', testid: 'ticket-title' },
      { path: 'p1', tag: 'td', text: 'fwrdj4-n1 RD Part A', column: 'Name', row: 'fwrdj4-n1 RD Part A $100.00 25% 1 No supplier $125.00' },
      { path: 'p2', tag: 'td', text: 'fwrdj4-n1 RD Part B', column: 'Name', row: 'fwrdj4-n1 RD Part B $200.00 25% 1 No supplier $250.00' },
    ],
    want: null,
  },
];

if (argv.includes('--probe')) {
  const s1 = await import(dist('agent/system-one.js'));
  const { readBackLocateSite } = await import(dist('agent/readback-jev.js'));
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
  const repeat = Number(arg('--repeat', 3));
  console.log('\n--- calibration probe (labelled) ---');
  console.log('case                       want   n  picked          conf   verdict');
  const outcomes = [];
  for (const c of PROBE_CASES) {
    for (let n = 1; n <= repeat; n++) {
      // One value per request: each case is its own page, and a state holding
      // eight unrelated pages is the large-irrelevant-state weakness.
      const reading = await readBackLocateSite
        .run(client, { instruction: c.instruction, items: [{ name: c.name, value: c.value, candidates: c.candidates }] }, {})
        .catch((err) => ({ error: err.message }));
      if (!reading || reading.error) {
        console.log(`${c.id.padEnd(26)} ${String(c.want).padEnd(6)} ${n}  ask failed: ${reading?.error ?? 'none'}`);
        continue;
      }
      const picked = reading.value?.[0]?.path ?? null;
      const detail = String(Object.values(reading.detail ?? {})[0] ?? '');
      const conf = reading.confidence;
      // Before the gate: what the reading SAYS, right or wrong.
      const said = /^(\w+)\s/.exec(detail)?.[1] ?? 'none';
      const deferred = picked === null;
      // The ballot labels options `c<index>`; a case names its answer by the
      // candidate's path, so the two are compared through the index.
      const wanted = c.want === null ? 'none' : `c${c.candidates.findIndex((x) => x.path === c.want)}`;
      const right = said === wanted;
      outcomes.push({ id: c.id, want: c.want, said, conf, right, deferred });
      console.log(
        `${c.id.padEnd(26)} ${String(c.want).padEnd(6)} ${n}  ${said.padEnd(15)} ${conf.toFixed(2)}   ${right ? 'right' : 'WRONG'}${deferred ? ' (deferred)' : ''}`,
      );
    }
  }
  const wrong = outcomes.filter((o) => !o.right);
  const rightPicks = outcomes.filter((o) => o.right && o.said !== 'none');
  console.log('');
  console.log(`right: ${outcomes.filter((o) => o.right).length}/${outcomes.length}; wrong: ${wrong.length}`);
  if (wrong.length) console.log(`highest confidence on a WRONG answer: ${Math.max(...wrong.map((o) => o.conf)).toFixed(2)}`);
  if (rightPicks.length) {
    const cs = rightPicks.map((o) => o.conf).sort((a, b) => a - b);
    console.log(`right picks' confidence: min ${cs[0].toFixed(2)}, median ${cs[Math.floor(cs.length / 2)].toFixed(2)}, max ${cs[cs.length - 1].toFixed(2)}`);
    for (const gate of [0.5, 0.6, 0.7, 0.8, 0.85, 0.9]) {
      const acted = outcomes.filter((o) => o.said !== 'none' && o.conf >= gate);
      console.log(`  gate ${gate}: acts on ${acted.length} (${acted.filter((o) => o.right).length} right, ${acted.filter((o) => !o.right).length} wrong)`);
    }
  }
  console.log(`\njev: ${usage.requests} request(s), ${usage.inputTokens} input tokens`);
}

// --- the live ballot (optional) ----------------------------------------------

if (USE_JEV && ballots.length) {
  const s1 = await import(dist('agent/system-one.js'));
  const { readBackLocateSite } = await import(dist('agent/readback-jev.js'));
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
  console.log('\n--- live ballot on the ambiguous values ---');
  const bySession = new Map();
  for (const b of ballots) {
    const key = `${b.session}#${b.step}`;
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(b);
  }
  for (const [key, items] of bySession) {
    const started = Date.now();
    const reading = await readBackLocateSite
      .run(client, { instruction: key, items: items.map((i) => ({ name: i.name, value: i.value, candidates: i.candidates })) }, {})
      .catch((err) => ({ error: err.message }));
    const ms = Date.now() - started;
    if (!reading || reading.error) {
      console.log(`${key}: ${reading?.error ?? 'nothing to ask'} (${ms}ms)`);
      continue;
    }
    console.log(`${key}: ${ms}ms, ${reading.options} options, confidence ${reading.confidence.toFixed(2)}`);
    for (const [name, detail] of Object.entries(reading.detail ?? {})) console.log(`   ${name}: ${detail}`);
  }
  console.log(`\njev: ${usage.requests} request(s), ${usage.inputTokens} input tokens`);
}
