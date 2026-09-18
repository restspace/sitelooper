#!/usr/bin/env node
/**
 * Is the System One tier what PLAN-jev.md assumes it is? Live calls, no browser.
 *
 *   npm run build && node bench/jev-probe.mjs
 *   node bench/jev-probe.mjs --fanout 50,100,200 --repeat 5 --raw
 *
 * WHY THIS EXISTS
 *
 * Every site in the plan rests on three claims the docs state but do not
 * quantify, and one the client encodes from a secondary source:
 *
 *   1. WIRE SHAPE. system-one.ts validates replies strictly, from field names
 *      read off typesafe-sdk-js v0.6.0. If the host says otherwise, every ask
 *      throws and the tier is silently dead. `--raw` prints one unparsed reply.
 *   2. LATENCY. "Very fast" is the premise of inline replay healing (B) and
 *      the per-action observer (G). The docs give no number.
 *   3. FREE QUESTIONS. "More questions add no latency" is what makes fan-out
 *      of questions on one state the default. Measured: 1 vs 10 vs 40.
 *   4. FAN-OUT. Sharded map/reduce only works if N concurrent requests cost
 *      about one request of wall-clock. Measured at 50/100/200 shards, under
 *      the client's real concurrency cap and deadline.
 *
 * It also asks a handful of questions with known answers, including the
 * round-26 case (an order id inside a clock time). That is a smoke test of
 * judgement, NOT a calibration: thresholds come from the decision log.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = (rel) => pathToFileURL(path.join(here, '..', 'dist', rel)).href;
const s1 = await import(dist('agent/system-one.js'));
const { choice, noul, score, mapReduce, topK } = s1;

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const REPEAT = Number(arg('--repeat', 5));
const FANOUT = String(arg('--fanout', '50,100,200')).split(',').map(Number).filter(Boolean);

const config = s1.resolveSystemOneConfig();
if (!config.enabled) {
  console.error(`System One is not enabled (mode=${config.mode}): set ${config.keyEnvVars.join(' or ')}.`);
  process.exit(2);
}
const usage = { inputTokens: 0, outputTokens: 0, requests: 0 };
const client = s1.buildSystemOne(config, (_m, u) => {
  usage.inputTokens += u.inputTokens;
  usage.outputTokens += u.outputTokens;
  usage.requests += 1;
});

const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
const stats = (xs) => `p50 ${pct(xs, 50)}ms  p90 ${pct(xs, 90)}ms  max ${Math.max(...xs)}ms`;

// A page like the ones the repair proposer sees.
const ELEMENTS = [
  'button "Discard"', 'button "Save record"', 'textbox "Customer"', 'textbox "Order reference"',
  'link "Quotations"', 'button "Send by email"', 'combobox "Payment terms"', 'button "Confirm"',
  'checkbox "Is a company"', 'link "Orders"', 'button "Add a product"', 'textbox "Expiration"',
];
const state = {
  procedure: 'Save the quotation',
  deadLocators: ['role=button name="Save"', '#o_form_button_save'],
  controlKind: 'button',
  elements: Object.fromEntries(ELEMENTS.map((e, i) => [`e${i}`, e])),
};
const which = choice(
  'Which element serves the purpose the dead locators described?',
  { ...Object.fromEntries(ELEMENTS.map((e, i) => [`e${i}`, e])), none: 'No element on the page serves that purpose' },
);

// --- 1. wire shape -------------------------------------------------------------
console.log(`# System One probe — ${config.model} @ ${config.baseUrl}\n`);
if (argv.includes('--raw')) {
  const res = await fetch(config.baseUrl + '/v1/systemone', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, state, questions: { which, gone: noul('The control is gone from this page entirely.'), fit: score('How well does e1 match?', ['not at all', 'partly', 'exactly']) } }),
  });
  console.log(`## raw reply (HTTP ${res.status})\n${JSON.stringify(await res.json(), null, 1)}\n`);
}

let ok = true;
try {
  const r = await client.ask(state, {
    which,
    gone: noul('The control the dead locators described is gone from this page entirely.'),
    fit: score('How well does element e1 match the dead locators?', ['not at all', 'partly', 'exactly']),
  });
  console.log(`## wire shape: OK — served by "${r.model}", ${r.usage.inputTokens} input tokens, ${r.ms}ms`);
  console.log(`   which=${r.answers.which.choice} (${r.answers.which.confidence.toFixed(2)})  gone=${r.answers.gone.noul.toFixed(2)}  fit=${r.answers.fit.score.toFixed(2)} (${r.answers.fit.confidence.toFixed(2)})\n`);
} catch (err) {
  ok = false;
  console.log(`## wire shape: FAILED — ${err.message}\n   re-run with --raw and fix parseAnswers in src/agent/system-one.ts\n`);
}
if (!ok) process.exit(1);

// --- 2 + 3. latency, and whether extra questions are free ----------------------
console.log('## latency by questions per request');
for (const n of [1, 10, 40]) {
  const questions = Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i}`, i === 0 ? which : noul(`Element e${i % ELEMENTS.length} is a button.`)]));
  const ms = [];
  for (let i = 0; i < REPEAT; i++) ms.push((await client.ask(state, questions, { timeoutMs: 15_000 })).ms);
  console.log(`   ${String(n).padStart(2)} question(s): ${stats(ms)}`);
}

// --- 4. fan-out ----------------------------------------------------------------
console.log('\n## fan-out: N shards, one score each (the focused-snapshot shape)');
for (const n of FANOUT) {
  const shards = Array.from({ length: n }, (_, i) => ELEMENTS[i % ELEMENTS.length]);
  const started = Date.now();
  const res = await mapReduce(
    client,
    shards,
    (el) => ({ state: { instruction: 'Save the quotation', element: el }, questions: { rel: score('How relevant is this element to carrying out the instruction?', ['irrelevant', 'related', 'the control to use']) } }),
    { timeoutMs: 30_000 },
  );
  if (!res) console.log(`   ${String(n).padStart(3)} shards: FAILED (a shard errored or missed 30s) after ${Date.now() - started}ms`);
  else console.log(`   ${String(n).padStart(3)} shards: ${res.ms}ms wall, ${res.usage.inputTokens} tokens; top: ${topK(res.shards, (s) => s.answers.rel.score, 1)[0].shard}`);
}

// --- judgement smoke test ------------------------------------------------------
console.log('\n## known-answer smoke test (not a calibration)');
const CASES = [
  { name: 'repair picks the renamed Save button', state, q: which, want: (a) => a.choice === 'e1', show: (a) => `${a.choice} (${a.confidence.toFixed(2)})` },
  {
    name: 'round 26: order id 12 inside the clock time 12:45 is a coincidence',
    state: { reportedValue: { label: 'order id', value: '12' }, line: 'cell "Created 2026-09-02 12:45"' },
    q: noul('In this line, the digits "12" are the reported order id, rather than an unrelated part of another value.'),
    want: (a) => a.noul < 0.5, show: (a) => a.noul.toFixed(2),
  },
  {
    name: 'order id S00012 in a heading IS the reported value',
    state: { reportedValue: { label: 'order reference', value: 'S00012' }, line: 'heading "S00012"' },
    q: noul('In this line, the text "S00012" is the reported order reference, rather than an unrelated part of another value.'),
    want: (a) => a.noul > 0.5, show: (a) => a.noul.toFixed(2),
  },
  {
    name: 'fwgr8: "bench" inside a dashboard slug is not the reported tag',
    state: { reportedValue: { label: 'tags', value: 'bench' }, url: '/d/fwgr8-n1-bench-dashboard/edit' },
    q: noul('In this URL, the word "bench" is the dashboard\'s reported tag value, rather than simply part of the dashboard\'s own name.'),
    want: (a) => a.noul < 0.5, show: (a) => a.noul.toFixed(2),
  },
  {
    name: 'a toast is specific to this run, not a consequence to expect every time',
    state: { procedure: 'Create a ticket', addedLine: 'status "Saved at 14:02:11"' },
    q: noul('This line would appear identically on every future run of the procedure.'),
    want: (a) => a.noul < 0.5, show: (a) => a.noul.toFixed(2),
  },
];
let pass = 0;
for (const c of CASES) {
  try {
    const a = (await client.ask(c.state, { q: c.q }, { timeoutMs: 15_000 })).answers.q;
    const good = c.want(a);
    pass += good ? 1 : 0;
    console.log(`   ${good ? 'ok  ' : 'MISS'} ${c.name} → ${c.show(a)}`);
  } catch (err) {
    console.log(`   ERR  ${c.name} → ${err.message}`);
  }
}
console.log(`   ${pass}/${CASES.length}`);

const usd = (usage.inputTokens * 0.042) / 1e6;
console.log(`\n## cost: ${usage.requests} requests, ${usage.inputTokens} input tokens ≈ $${usd.toFixed(5)}`);
