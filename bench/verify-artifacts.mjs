/**
 * Artifact-level checks on a finished sweep.
 *
 *   node bench/verify-artifacts.mjs fwrd23l [--dir bench/results]
 *
 * Sweep-to-sweep comparison cannot validate a fix: recording is model-driven,
 * so each sweep compiles a DIFFERENT procedure. fwrd19l produced three
 * `wait_for` steps with text="..." targets; fwrd20l and fwrd21l produced none,
 * and the drift that vanished with them looked like a fix. Step counts moved
 * 7/8/7 across three runs of the same task. Cost deltas between sweeps compare
 * different artifacts.
 *
 * What IS comparable is what the run produced. These checks read the compiled
 * store, the exported flow and the replay results, and answer questions with
 * one right answer regardless of which procedure the model happened to record.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RunLedger, scanForLeaks, inLocator, describeLeaks } from '../dist/skills/ledger.js';
import { looksLikeId } from '../dist/skills/shape.js';
import { publishedOutputs } from '../dist/skills/learn.js';
import { positionalExpr } from '../dist/daemon/recorder.js';
import { urlParts } from '../dist/skills/compile.js';

const args = process.argv.slice(2);
const tag = args.find((a) => !a.startsWith('--'));
const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : 'bench/results';
if (!tag) {
  console.error('usage: node bench/verify-artifacts.mjs <sweep-tag> [--dir bench/results]');
  process.exit(2);
}

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = (p) => fs.existsSync(p);

const flowPath = path.join(dir, 'flows', `${tag}.json`);
const skillsDir = path.join(dir, `${tag}-skills`);
// A REFUSED export leaves no flow, and that is exactly when the store most
// needs reading: the refusal message goes to the daemon's stderr, which the
// sweep harness does not capture. Check what can be checked and say so.
const hasFlow = exists(flowPath);
const flow = hasFlow ? read(flowPath) : { steps: [] };
if (!hasFlow) console.log(`note  no flow at ${flowPath} — run 1 never exported one (refused, or incomplete)`);
const store = exists(skillsDir)
  ? fs.readdirSync(skillsDir).filter((f) => f.endsWith('.json')).flatMap((f) => read(path.join(skillsDir, f)))
  : [];

/**
 * The recording run's ledger, reconstructed from what it left behind. The
 * daemon's own ledger is not persisted, so this approximates it from the three
 * sources that survive: the runid (the sweep names run 1 `<tag>-n1`), every
 * value the recording run REPORTED, and the id-like parts of every url its
 * instructions mention. It can only under-report, never invent — a value it
 * misses is a leak this check cannot see, not a false alarm.
 */
/**
 * The CLI's home dir, honouring the pre-rename env var and directory so an
 * older install still verifies.
 */
function sitelooperHome() {
  const env = process.env.SITELOOPER_HOME || process.env.SLEEP_WALKER_HOME || process.env.BROWSER_PILOT_HOME;
  if (env) return env;
  const base = process.env.USERPROFILE || process.env.HOME || '';
  for (const name of ['.sitelooper', '.sleep-walker', '.browser-pilot']) {
    const dir = path.join(base, name);
    if (exists(dir)) return dir;
  }
  return path.join(base, '.sitelooper');
}

/** Report entries from the recording session, for when no flow was exported. */
function sessionReports() {
  const home = sitelooperHome();
  const file = path.join(home, 'sessions', `${tag}-n1`, 'script.jsonl');
  if (!exists(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.k === 'report' && e.values) out.push({ id: `i${out.length + 1}`, values: e.values });
    } catch {
      /* a truncated last line is normal */
    }
  }
  return out;
}

/** Post-navigation urls the recording run actually landed on, in order. */
function sessionUrls() {
  const home = sitelooperHome();
  const candidates = [
    path.join(dir, `${tag}-n1-script.jsonl`), // published alongside the results
    path.join(home, 'sessions', `${tag}-n1`, 'script.jsonl'),
  ];
  const file = candidates.find(exists);
  if (!file) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      const url = e.k === 'step' ? e.diff?.url : e.k === 'instruction' ? e.url : undefined;
      if (url) out.push(url);
    } catch {
      /* a truncated last line is normal */
    }
  }
  return out;
}

function recordingLedger() {
  const l = new RunLedger();
  l.add(`${tag}-n1`, { from: 'var', name: 'runid' });
  // Ids from the urls the run LANDED on. This is the daemon's own source, and
  // without it the navigation-target check below is decorative: seeding the
  // ledger from the compiled `args.url` it then scans would make every url id
  // match itself. Only available when the sweep published the session log.
  // ONE url parser — the daemon's own urlParts — so the labels this ledger
  // sees are the labels idPositionPart and the numeric-query exclusion were
  // written against. The hand-rolled parser here labeled odoo's hash params
  // `menu_id`/`action` instead of `q.menu_id`/`q.action`, so the ledger
  // narrowing that fixed fwod29's 16 false navigation leaks never applied to
  // this script's own reconstruction, and the FAIL survived the fix.
  for (const url of sessionUrls()) {
    l.addUrlIds(url, 'recorded', urlParts(url));
  }
  // Prefer the flow's `recorded` values; without a flow (a refused export) fall
  // back to the session recording, which holds the same report entries. A
  // ledger seeded from the runid alone finds nothing and reads as a pass.
  const groups = flow.steps?.length
    ? flow.steps.map((st) => ({ id: st.id, values: st.recorded ?? {} }))
    : sessionReports();
  for (const st of groups) {
    for (const [name, value] of Object.entries(st.values ?? {})) {
      // Only REFERENCES, not every reported word. The recording run reported
      // status 'Ready', which is also half of the app's own `status-to-Ready`
      // test hook and its `Mark Ready` button — flagging those would be the
      // over-slotting the plan warns about, where a run value and an app
      // constant happen to coincide.
      if (typeof value === 'string' && looksLikeId(value, 'first-run')) l.add(value, { from: 'output', step: st.id, name });
    }
  }
  for (const sk of store) {
    const text = `${sk.provenance?.instruction ?? ''} ${sk.preconditions?.urlPattern ?? ''}`;
    for (const url of text.match(/https?:\/\/[^\s'")]+/g) ?? []) {
      // A stored pattern's own {{v3}} marker is not a value.
      l.addUrlIds(url, 'recorded', urlParts(url).filter((p) => !p.value.includes('{{')));
    }
  }
  return l;
}

let failed = false;
const fail = (m) => {
  failed = true;
  console.log(`FAIL  ${m}`);
};
const pass = (m) => console.log(`ok    ${m}`);

// 1. No value this run made may sit in a locator or a precondition, where it
//    moves a step onto another record without saying so.
const ledger = recordingLedger();
const leaks = [];
for (const sk of store) leaks.push(...scanForLeaks(sk, ledger, sk.id));
leaks.push(...scanForLeaks(flow, ledger, 'flow'));
// `inLocator`, not the product's `fatal`: this is a REPORTER, and the two want
// different bars. `fatal` now refuses only when something better than the
// token's spelling kinded the value, because there a false positive bins a
// recording. Here a false positive costs a look, so keep flagging every
// identifier that reached a locator — including the shape-based ones the
// export gate has stopped refusing over. Same reasoning as the navigation
// check below, which lives here for exactly this reason.
const locatorLeaks = leaks.filter((l) => l.kind === 'identifier' && inLocator(l));
if (locatorLeaks.length) {
  const guessed = locatorLeaks.filter((l) => l.basis === 'shape').length;
  fail(`${locatorLeaks.length} locator leak(s) — a run value reached a locator or precondition` +
    (guessed ? ` (${guessed} kinded by shape alone: check each — a minted id here is a wrong-record bug, an app constant is a ledger false positive)` : ''));
  console.log(describeLeaks(locatorLeaks.slice(0, 12)));
} else {
  pass(`no locator leaks (${leaks.length} non-fatal, in reportTemplate/urlPattern/expectations)`);
}

// 2. Every {{step.output}} a later step depends on must be one a ZERO-MODEL
//    replay republishes. A tier-A replay honestly drops recorded values it
//    could not re-observe, so a ref to a model-named report value dies exactly
//    when the replay is at its best — and the step that needed it skips the
//    zero-model path entirely (fwrd21l: one such ref cost four steps).
const byId = new Map(store.map((s) => [s.id, s]));
/** What a ZERO-MODEL replay of this step republishes: labelled reads, plus report values that are pure slot fills. */
const publishes = new Map(
  flow.steps.map((s) => {
    const sk = s.skill ? byId.get(s.skill) : null;
    if (!sk) return [s.id, new Set(Object.keys(s.recorded ?? {}))];
    // A step's pin may be the HEAD of a segment chain whose later segment does
    // the read, so union the whole chain — the same rule the daemon's own
    // lintFlowRefs applies.
    const chain = sk.seq?.chain ? store.filter((o) => o.seq?.chain === sk.seq.chain) : [sk];
    return [s.id, new Set(chain.flatMap(publishedOutputs))];
  }),
);
// There is no "demonstrated stable" exemption any more: agreement between runs
// never resolves a reference to its recorded literal (flow.ts RunSpecific — a
// reset app reproduces a minted id exactly), so a reference its producer does
// not republish pays recovery every run whatever the evidence says. Run 1
// references everything on purpose (PLAN-evidence-over-shape.md), so a flow
// only one run has seen is a note, not a failure.
const unjudged = new Set();
const fragile = new Set();
for (const step of flow.steps) {
  for (const text of [step.instruction, ...Object.values(step.params ?? {})]) {
    for (const [, sid, out] of String(text).matchAll(/\{\{([\w-]+)\.([\w.#-]+)\}\}/g)) {
      if (out === 'url' || out.startsWith('url.')) continue; // provenance: republished every run
      const can = publishes.get(sid);
      if (!can || can.has(out) || can.has(out.split('#')[0])) continue;
      const producer = flow.steps.find((s) => s.id === sid);
      const ev = producer?.outputEvidence?.[out] ?? producer?.outputEvidence?.[out.split('#')[0]];
      if (!ev) {
        unjudged.add(`${step.id} needs {{${sid}.${out}}} — no run has judged it yet`);
        continue;
      }
      fragile.add(
        ev.differed
          ? `${step.id} needs {{${sid}.${out}}}, demonstrated volatile (${ev.differed}×) — recovery every run`
          : `${step.id} needs {{${sid}.${out}}}, not republished by ${sid} (agreed ${ev.same}×, which resolves nothing) — recovery every run`,
      );
    }
  }
}
if (!hasFlow) {
  console.log('skip  cross-step references (no flow was exported)');
} else if (fragile.size) {
  // Not a defect: a reference its producer does not republish MUST stay a
  // reference (a literal would act on the recording's record). It is a COST —
  // that step pays recovery on every run — and the fix is for the producing
  // skill to re-observe the value, so it is reported as a finding.
  fail(`${fragile.size} reference(s) are not republished by their producing step: those steps pay recovery on every run`);
  for (const f of [...fragile].slice(0, 10)) console.log(`      ${f}`);
} else if (unjudged.size) {
  // Expected for a flow only one run has seen. It becomes a finding only if a
  // replay ran and still did not settle it.
  console.log(`note  ${unjudged.size} reference(s) not yet judged — run 2 decides them`);
  for (const f of [...unjudged].slice(0, 6)) console.log(`      ${f}`);
} else {
  pass('every cross-step reference is provenance-backed or re-observed');
}

// 2b. A run value left literal in a NAVIGATION TARGET. fwgr11 went to
//     `/d/<run-1-uid>/{{runid}}-bench-dashboard`: the slug named this run, the
//     uid beside it named the last one, and the replay found everything it
//     expected on the wrong dashboard. A url is a locator for a page.
//
//     This lives HERE and not in the product's `fatal()`, where it spent one
//     release cycle. As a gate it refused fwod19 -- a clean 6/6 recording --
//     over `action=123` in `#action=123&cids=1&menu_id=81`, which is Odoo's
//     Discuss MENU id: identical on every run, present in the first
//     post-login navigation, and `looksLikeId("123")` is true. Telling
//     that apart from a minted uid needs a second run (PLAN-evidence-over-
//     shape.md), so as a gate it costs a whole sweep when wrong, while here it
//     costs a look. Report, do not enforce, what one run cannot establish.
const navLeaks = leaks.filter((l) => l.kind === 'identifier' && /(^|\.)args\.url$/.test(l.where));
if (navLeaks.length) {
  fail(`${navLeaks.length} navigation target(s) carry a value this run made`);
  console.log(describeLeaks(navLeaks.slice(0, 8)));
  console.log('      (check each: a minted record id here is a wrong-record bug; an app constant is a ledger false positive)');
} else {
  pass('no navigation target carries a run value');
}

// 3. Did any step resolve POSITIONALLY — by where an element sat rather than
//    by what it was? That silently acts on whatever sorted into that slot, and
//    it is the failure this whole plan exists to stop, so it is a finding even
//    when the run passes.
//
//    An anchored locator is NOT positional even though it usually ends in a
//    positional cell selector: `locator('#rows tr', { hasText: 'x7 Ticket' })
//    .locator('td:nth-of-type(2)')` names the record and then picks a cell
//    inside THAT row. Eyeballing drift files for "nth-of-type" flags every one
//    of those, which is how a clean repairdesk run first read as two
//    regressions.
const positional = positionalExpr; // ONE judgement, shared with repair triage — see recorder.ts
let positionalHits = 0;
for (const f of fs.readdirSync(dir).filter((n) => n.startsWith(`${tag}-n`) && n.endsWith('-drift.json'))) {
  for (const t of read(path.join(dir, f))) {
    if (!t.fallbackUsed || !positional(t.fallbackUsed)) continue;
    positionalHits += 1;
    console.log(`      ${f.replace(`${tag}-`, '').replace('-drift.json', '')} ${t.step}: ${t.fallbackUsed}`);
  }
}
if (positionalHits) fail(`${positionalHits} step(s) resolved by POSITION, which can act on the wrong record`);
else pass('no step resolved positionally');

// 4. Is the flow SELF-CONTAINED — does its first step establish the page it
//    works on, or does it assume one?
//
//    fwod16 recorded six steps that each began "You are on the Odoo quotation
//    S00021 form…", with no step that creates anything. Replayed against a
//    fresh database, step 1 verified a contact that did not exist and step 2
//    spent 600s looking for a quotation nobody had made. The flow was unusable
//    and it took a 25-minute sweep to find out, when the instruction text says
//    so plainly.
//
//    A first step that asserts its starting position is the signature: the
//    orchestrator decomposed the task into position-dependent instructions,
//    each of which only makes sense after the previous one.
const first = flow.steps[0];
if (!hasFlow) {
  console.log('skip  self-containment (no flow was exported)');
} else if (first && /^\s*(you are|the browser is|assuming|currently) (on|at|in)\b/i.test(first.instruction)) {
  fail(`the flow is not self-contained — step ${first.id} assumes a starting page instead of reaching it`);
  console.log(`      ${first.instruction.slice(0, 140)}`);
} else {
  pass('the flow establishes its own starting page');
}

// 5. How much of each replay ran without the model at all. Reported, not
//    asserted: the right number depends on the procedure the run recorded, and
//    a threshold here would just be another way of comparing two sweeps.
for (const f of fs.readdirSync(dir).filter((n) => /^\Q\E/.test(n) === false && n.startsWith(`${tag}-n`) && n.endsWith('-flowrun.json'))) {
  const run = read(path.join(dir, f));
  const steps = run.steps ?? [];
  const a = steps.filter((s) => s.tier === 'A').length;
  const turns = steps.reduce((n, s) => n + (s.turns ?? 0), 0);
  console.log(`      ${f.replace(`${tag}-`, '').replace('-flowrun.json', '')}: tier A ${a}/${steps.length}, ${turns} model turns, ${run.passed}/${run.total} passed`);
}

process.exit(failed ? 1 : 0);
