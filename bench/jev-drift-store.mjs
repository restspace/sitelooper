#!/usr/bin/env node
/**
 * Calibration harness for site B of notes/PLAN-jev.md — inline replay healing.
 *
 * WHY THIS EXISTS. The `replay.heal` gate was lowered 0.9 -> 0.6 on **n=4**:
 * four asks against one real repairdesk drift (`add-part-moved`), all correct,
 * at 0.59-0.86 (notes/PLAN-jev.md, "Steps 4-5 results"). Four observations of one
 * control on one app cannot set a threshold that decides whether a click fires
 * on a live page with nothing but code guards behind it. What a gate needs is
 * a RELIABILITY CURVE: many dead-chain cases, spread across apps, tools and
 * kinds of rename, each with a known right answer, so accuracy can be read per
 * confidence bucket and the gate chosen as the lowest one that accepts no
 * wrong pick.
 *
 * THE IDEA: DRIFT THE STORE, NOT THE APP. We cannot rename a control inside
 * Odoo, Grafana or Kanboard. But the healer cannot tell "the app renamed the
 * control" from "the stored chain describes the control with names the app no
 * longer uses": in both, every rung of the chain misses and the live page
 * holds the real control. So a case is a COPY of a recorded store with ONE
 * step's locator chain rewritten into a plausible OLD description of the same
 * control — a synonym rename, a dropped suffix, a stale testid, a moved path —
 * while `recordedKind` and the candidate families stay exactly as recorded,
 * because those are what the ballot is filtered on and what the pick is
 * checked against.
 *
 * GROUND TRUTH IS FREE. The app did not change, so the ORIGINAL chain still
 * names the right element, and it names it several ways at once (testid,
 * role+name, label, id — the recorder's own order). A proposal is CORRECT when
 * it agrees with any rung of the original chain on a field an element can only
 * have one of, WRONG when it contradicts one, and UNDECIDABLE otherwise —
 * counted in neither column, never guessed. (bench/jev-drift-lib.mjs)
 *
 * WHAT IT IS NOT
 *
 *  - Not an A/B of healing against model recovery. That is
 *    `bench/jev-heal-demo.mjs`, which measures what a heal SAVES on one real
 *    drift. This one measures how often a heal is RIGHT, over many cases, and
 *    runs with model recovery disabled by default so a failed heal costs
 *    nothing but the failure.
 *  - Not a test of the perturbation's realism. A store rewrite is a stand-in
 *    for app drift, and the one real drift we have (`add-part-moved`) scored
 *    markedly lower than the synthetic probe's cases. Treat a gate read off
 *    this data as an upper bound on Jev's difficulty, and keep the real drift
 *    in the sample.
 *  - Not a repair tool. It never writes to the store it was pointed at; every
 *    case gets its own copy, and the originals are what correctness is judged
 *    against.
 *
 * USAGE
 *
 *   # what the store offers, no app, no spend
 *   node bench/jev-drift-store.mjs --dry-run \
 *     --flow fwrdj2 --skills bench/results/fwrdj2-skills --flows bench/results/flows \
 *     --app-url http://127.0.0.1:4180/ --target repairdesk --tag dry
 *
 *   # the real thing: one drifted step per replay, gate 0, no model recovery
 *   node bench/jev-drift-store.mjs \
 *     --flow fwrdj2 --skills bench/results/fwrdj2-skills --flows bench/results/flows \
 *     --app-url http://127.0.0.1:4180/ --target repairdesk --tag rdcal
 *
 *   # a slice of a long store (--steps takes an index, a comma list or a range)
 *   node bench/jev-drift-store.mjs --steps 1-20 … --tag odcal
 *
 *   # score a finished run again, e.g. after fixing the scorer — no app, no spend
 *   node bench/jev-drift-store.mjs --rescore --flow fwrdj2 --skills … --tag rdcal
 *
 * THE THREE TRAPS, all of which have cost a run before
 *
 *  - A skill store is keyed by ORIGIN. A recording made on :4180 replays only
 *    on :4180; on any other port no skill binds, every step goes to recovery
 *    and the harness measures nothing (jev-heal-demo.mjs burned ~$0.15 this
 *    way). So `--app-url` must carry the store's own origin, and this script
 *    refuses otherwise rather than producing numbers.
 *  - Never port 4190: Node's fetch rejects it as a WHATWG "bad port".
 *  - The `sitelooper` on PATH is a DIFFERENT checkout. This script always runs
 *    this worktree's own `bin/sitelooper.js` through `process.execPath`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_DEFAULTS } from './app-defaults.mjs';
import {
  bucketLabel,
  gateTable,
  judgeProposal,
  parsePickedRow,
  perturbChain,
  recommendGate,
  reliability,
  splitBy,
} from './jev-drift-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);

const opts = {
  flow: arg('--flow'),
  skills: arg('--skills'),
  flowsDir: arg('--flows'),
  appUrl: arg('--app-url', process.env.APP_URL),
  target: arg('--target'),
  tag: arg('--tag', `drift${Date.now().toString(36)}`),
  steps: arg('--steps', 'all'),
  mode: arg('--mode', 'rename'),
  gate: arg('--gate', '0'),
  dist: arg('--dist', path.join(repo, 'dist')),
  out: arg('--out', path.join(repo, 'bench', 'results')),
  timeoutMs: Number(arg('--timeout', '420000')),
  dryRun: argv.includes('--dry-run'),
  // Re-read a finished run's artefacts and score them again, without touching
  // an app. Case enumeration is a pure function of the store and the mode, so
  // the ids line up; what changes is the scorer. Half an hour of browser time
  // should not have to be spent again to fix a label.
  rescore: argv.includes('--rescore'),
  // Model recovery is OFF unless explicitly asked for: a heal that defers
  // falls to a real agent recovery, which is the expensive half of every run
  // in this family and has nothing to do with what is being calibrated.
  noModel: !argv.includes('--model'),
  keepStores: argv.includes('--keep-stores'),
};

const die = (msg) => {
  console.error(`[drift-store] ${msg}`);
  process.exit(2);
};

if (!opts.flow || !opts.skills) die('--flow and --skills are required');
if (!['rename', 'strip', 'both'].includes(opts.mode)) die('--mode must be rename, strip or both');
if (!opts.dryRun && !opts.rescore && (!opts.appUrl || !opts.target)) die('--app-url and --target are required for a real run');

// ---------------------------------------------------------------- the store

/**
 * Both store layouts are read through the compiled `SkillStore`: a directory
 * per origin (`http_127.0.0.1_4180/s_*.json`, what the daemon writes today)
 * and the older whole-file-per-origin form the published `results-published/*-skills`
 * still carry. Writing goes through the same object, which always writes the
 * new layout — and since `list()` puts the per-id files ahead of the legacy
 * file, a perturbed skill shadows its legacy twin without editing it.
 */
const dist = path.resolve(opts.dist);
const { SkillStore } = await import(pathToUrl(path.join(dist, 'skills', 'store.js')));
const { unhealableWhy } = await import(pathToUrl(path.join(dist, 'skills', 'replay.js')));
const { candidateExpr } = await import(pathToUrl(path.join(dist, 'daemon', 'recorder.js')));
const { locatorFromRow } = await import(pathToUrl(path.join(dist, 'skills', 'repair-jev.js')));

function pathToUrl(p) {
  return new URL(`file://${p.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '/$1')}`).href;
}

const srcStore = path.resolve(opts.skills);
if (!fs.existsSync(srcStore)) die(`no store at ${srcStore}`);

// The flow lives either in an explicit --flows directory (the sweep layout) or
// beside the store as `<name>.json` (the published layout). Both, in that order.
const flowCandidates = [
  ...(opts.flowsDir ? [path.resolve(opts.flowsDir, `${opts.flow}.json`)] : []),
  path.join(path.dirname(srcStore), `${opts.flow}.json`),
  path.join(path.dirname(srcStore), 'flows', `${opts.flow}.json`),
];
const srcFlowPath = flowCandidates.find((p) => fs.existsSync(p));
if (!srcFlowPath) die(`no flow "${opts.flow}.json" in any of:\n  ${flowCandidates.join('\n  ')}`);
const srcFlow = JSON.parse(fs.readFileSync(srcFlowPath, 'utf8'));

const storeOrigin = srcFlow.origin ?? new URL(srcFlow.startUrl).origin;
if (!opts.dryRun && !opts.rescore) {
  const url = new URL(opts.appUrl);
  if (url.port === '4190') die("port 4190 is a WHATWG 'bad port': Node's fetch refuses it, so the resets cannot run");
  if (url.origin !== storeOrigin) {
    die(
      `--app-url ${url.origin} is not the store's origin ${storeOrigin}.\n` +
        `             A skill store is keyed by origin, so on any other port NO skill binds: every step\n` +
        `             goes to model recovery and the harness measures nothing. Run the app on ${storeOrigin}.`,
    );
  }
}

// ---------------------------------------------------------------- printing

const pad = (s, n) => String(s ?? '').padEnd(n);
const exprOf = (c) => {
  try {
    return candidateExpr(c);
  } catch {
    return JSON.stringify(c);
  }
};
function summarise(list, key) {
  const counts = new Map();
  for (const c of list) counts.set(c[key], (counts.get(c[key]) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}=${n}`)
    .join(' ');
}

// ---------------------------------------------------------------- the cases

/**
 * A case is one (flow step, skill, step tag, locator key) whose chain the
 * BLAST RADIUS policy would let a healer act on — `unhealableWhy` is imported
 * rather than restated, so the denominator is the policy's own and a refusal
 * is reported with the policy's own words. Everything it refuses is listed too:
 * a calibration that quietly drops the steps it could not use is a calibration
 * of the steps it happened to like.
 */
function enumerateCases() {
  const store = new SkillStore(srcStore);
  const cases = [];
  const refused = [];
  const modes = opts.mode === 'both' ? ['rename', 'strip'] : [opts.mode];
  for (const flowStep of srcFlow.steps ?? []) {
    const skill = flowStep.skill ? store.get(flowStep.skill) : null;
    if (!skill) {
      refused.push({ flowStep: flowStep.id, skill: flowStep.skill ?? '(none)', tag: '-', key: '-', why: 'the flow step pins no procedure this store holds' });
      continue;
    }
    for (const [i, step] of (skill.steps ?? []).entries()) {
      const tag = String(i + 1);
      for (const key of ['target', 'source']) {
        const chain = step.locators?.[key] ?? [];
        if (!chain.length) continue;
        const why = unhealableWhy(step, key, tag);
        if (why) {
          refused.push({ flowStep: flowStep.id, skill: skill.id, tag, key, tool: step.tool, why });
          continue;
        }
        for (const mode of modes) {
          const drifted = perturbChain(chain, mode);
          if (drifted.chain.every((c, n) => c === chain[n])) {
            refused.push({ flowStep: flowStep.id, skill: skill.id, tag, key, tool: step.tool, why: 'every rung is a parameter slot — nothing to drift without changing which record the step works on' });
            continue;
          }
          cases.push({
            flowStep: flowStep.id,
            skill: skill.id,
            tag,
            key,
            tool: step.tool,
            mode,
            transform: drifted.headline,
            rungs: drifted.rungs,
            undrifted: drifted.undrifted,
            original: chain,
            drifted: drifted.chain,
          });
        }
      }
    }
  }
  // One case per (procedure, step, key, mode), not per flow step: a flow that
  // uses one procedure twice would otherwise drift the same chain twice and
  // the second run would ask about a step the first already answered.
  const unique = [];
  const seen = new Map();
  for (const c of cases) {
    const k = `${c.skill}|${c.tag}|${c.key}|${c.mode}`;
    if (seen.has(k)) {
      (seen.get(k).alsoUsedBy ??= []).push(c.flowStep);
      continue;
    }
    seen.set(k, c);
    unique.push(c);
  }
  unique.forEach((c, i) => {
    c.n = i + 1;
    c.id = `${opts.tag}-c${String(i + 1).padStart(2, '0')}`;
  });
  return { cases: unique, refused };
}

/** `--steps all`, a single index, a comma list, or a range — so a long store can be split across sessions. */
function selectCases(all, spec) {
  if (spec === 'all') return all;
  const wanted = new Set();
  for (const part of String(spec).split(',')) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) for (let i = Number(range[1]); i <= Number(range[2]); i++) wanted.add(i);
    else if (/^\d+$/.test(part)) wanted.add(Number(part));
  }
  return all.filter((c) => wanted.has(c.n));
}

const { cases, refused } = enumerateCases();
const selected = selectCases(cases, opts.steps);
if (!selected.length) die(`no healable case selected (${cases.length} in the flow; --steps ${opts.steps})`);

// ---------------------------------------------------------------- dry run

if (opts.dryRun) {
  console.log(`\n=== ${opts.flow} @ ${srcStore} (origin ${storeOrigin}) ===`);
  console.log(`${cases.length} healable case(s) from ${(srcFlow.steps ?? []).length} flow step(s); ${refused.length} chain(s) the policy refuses\n`);
  for (const c of selected) {
    console.log(`#${c.n} ${c.id}  ${c.flowStep}/${c.skill} step ${c.tag} ${c.key} (${c.tool})  mode=${c.mode} transform=${c.transform}`);
    for (const [i, before] of c.original.entries()) {
      const after = c.drifted[i];
      const same = after === before;
      console.log(`    ${same ? ' = ' : ' ->'} ${pad(c.rungs[i].transform ?? 'kept', 12)} ${exprOf(before)}${same ? '' : `\n         ${pad('', 12)} ${exprOf(after)}`}`);
    }
    console.log('');
  }
  const byWhy = new Map();
  for (const r of refused) byWhy.set(r.why, (byWhy.get(r.why) ?? 0) + 1);
  console.log('refused by the BLAST RADIUS policy (unhealableWhy), so not part of the denominator:');
  for (const [why, n] of [...byWhy].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${why}`);
  console.log(`\nsplit by tool:      ${summarise(cases, 'tool')}`);
  console.log(`split by transform: ${summarise(cases, 'transform')}`);
  console.log(`split by mode:      ${summarise(cases, 'mode')}`);
  process.exit(0);
}

// ---------------------------------------------------------------- the run

const outDir = path.resolve(opts.out);
fs.mkdirSync(outDir, { recursive: true });

// A rescore describes the run that produced the artefacts, not the flags it
// was invoked with, so what the caller did not repeat is read back.
if (opts.rescore) {
  try {
    const prior = JSON.parse(fs.readFileSync(path.join(outDir, `${opts.tag}-drift-store.json`), 'utf8'));
    opts.target ??= prior.target;
    opts.appUrl ??= prior.app;
    opts.gate = prior.gate ?? opts.gate;
    opts.noModel = prior.noModel ?? opts.noModel;
  } catch {
    /* a rescore of a run whose report was deleted still works; the header is thinner */
  }
}

/**
 * A private SITELOOPER_HOME, which is also how `--no-model` works.
 *
 * The provider key resolves as flag > env > `~/.sitelooper/config.json`
 * (llm.ts `resolveProviderConfig`), and `OpenAICompatProvider.complete` throws
 * BEFORE any request when the resolved key is empty. So a home whose config
 * carries the TypeSafe key and no `apiKey`, plus an environment with every
 * provider key removed, makes model recovery fail in microseconds with no
 * network call, no retry and no spend — while Jev, which this is calibrating,
 * still works. A deferred heal then costs exactly one failed step, not a
 * 10-40 turn recovery.
 *
 * It doubles as isolation: sessions (and `system-one.jsonl`, which is the
 * dataset) land under this home, not in the user's own.
 */
function makeHome() {
  const home = path.join(outDir, `${opts.tag}-home`);
  // A rescore reads the home a finished run left behind; it must not clear it.
  if (opts.rescore) return home;
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(path.join(home, 'sessions'), { recursive: true });
  let config = {};
  const real = path.join(os.homedir(), '.sitelooper', 'config.json');
  try {
    config = JSON.parse(fs.readFileSync(real, 'utf8'));
  } catch {
    config = {};
  }
  if (opts.noModel) delete config.apiKey;
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify(config, null, 2));
  if (opts.noModel && !config.jevApiKey && !process.env.TYPESAFE_API_KEY && !process.env.SITELOOPER_JEV_API_KEY) {
    die('no TypeSafe key in ~/.sitelooper/config.json or the environment — every case would defer with nothing asked');
  }
  return home;
}

const home = makeHome();
const PROVIDER_KEY_VARS = ['SITELOOPER_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GLM_API_KEY', 'ZHIPU_API_KEY', 'NOVITA_API_KEY'];

function baseEnv() {
  const env = { ...(APP_DEFAULTS[opts.target] ?? {}), ...process.env };
  if (opts.noModel) for (const v of PROVIDER_KEY_VARS) delete env[v];
  return {
    ...env,
    APP_URL: opts.appUrl,
    SITELOOPER_HOME: home,
    SITELOOPER_SKILLS: '1',
    SITELOOPER_JEV: 'auto',
    // Gate 0 by default: the healer acts whenever its CODE guards pass, so
    // every pick's confidence is observed instead of censored below a gate.
    // The gate columns in the report are then computed from that, at every
    // candidate value at once, from one set of runs.
    SITELOOPER_JEV_GATES: JSON.stringify({ 'replay.heal': Number(opts.gate) }),
  };
}

const cli = (args, env, timeoutMs) =>
  spawnSync(process.execPath, [path.join(repo, 'bin', 'sitelooper.js'), ...args], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });

/**
 * Reset the app, with patience. One failed reset used to fail the case and
 * move on — so when Grafana stopped answering, 68 cases "ran" in a few seconds
 * each and the summary looked like a result (grcal, 2026-09-18). A reset is
 * retried, and a run whose resets keep failing STOPS: on a remote box nobody is
 * watching, and a fast wrong answer is worse than an early exit.
 */
const RESET_TRIES = 4;
const RESET_WAIT_MS = 15_000;
const MAX_CONSECUTIVE_RESET_FAILURES = 2;
let consecutiveResetFailures = 0;
function resetApp() {
  for (let i = 0; i < RESET_TRIES; i++) {
    const r = spawnSync(process.execPath, [path.join(here, 'reset-app.mjs'), '--target', opts.target], {
      stdio: ['inherit', 'pipe', 'inherit'],
      env: { ...process.env, APP_URL: opts.appUrl },
    });
    if (r.status === 0) {
      consecutiveResetFailures = 0;
      return true;
    }
    if (i < RESET_TRIES - 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RESET_WAIT_MS);
  }
  consecutiveResetFailures += 1;
  return false;
}

/** A finished case's artefacts, read back off disk — see `--rescore`. */
function replayCase(c) {
  let flowrun = null;
  try {
    flowrun = JSON.parse(fs.readFileSync(path.join(outDir, `${c.id}-flowrun.json`), 'utf8'));
  } catch {
    return { error: `no ${c.id}-flowrun.json in ${outDir} — this case was never run under tag "${opts.tag}"` };
  }
  return { flowrun, decisions: readDecisions(path.join(home, 'sessions', c.id, 'system-one.jsonl')), wallMs: null };
}

/** One case: a copy of the store with ONE chain drifted, a flow under its own name, one replay. */
function runCase(c) {
  const caseStore = path.join(outDir, `${c.id}-skills`);
  const caseFlows = path.join(outDir, `${c.id}-flows`);
  fs.rmSync(caseStore, { recursive: true, force: true });
  fs.rmSync(caseFlows, { recursive: true, force: true });
  fs.cpSync(srcStore, caseStore, { recursive: true });
  fs.mkdirSync(caseFlows, { recursive: true });

  if (!c.baseline) {
    const store = new SkillStore(caseStore);
    const skill = store.get(c.skill);
    const step = skill.steps[Number(c.tag) - 1];
    step.locators[c.key] = c.drifted;
    store.put(skill, { overwrite: true });
  }

  const flow = { ...srcFlow, name: c.id };
  if (flow.startUrl) {
    const u = new URL(flow.startUrl);
    flow.startUrl = new URL(u.pathname + u.search + u.hash, opts.appUrl).href;
  }
  fs.writeFileSync(path.join(caseFlows, `${c.id}.json`), JSON.stringify(flow, null, 2));

  if (!resetApp()) return { error: 'app reset failed — refusing to replay against a dirty app' };

  const env = { ...baseEnv(), SITELOOPER_SKILLS_DIR: caseStore, SITELOOPER_FLOWS_DIR: caseFlows };
  const started = Date.now();
  const run = cli(['--session', c.id, 'run', c.id, '--var', `runid=${c.id}`, '--json'], env, opts.timeoutMs);
  const wallMs = Date.now() - started;
  const stderr = (run.stderr ?? Buffer.from('')).toString();
  fs.writeFileSync(path.join(outDir, `${c.id}-progress.log`), stderr);
  cli(['stop', '--session', c.id], env, 60000);

  let flowrun = null;
  try {
    flowrun = JSON.parse((run.stdout ?? Buffer.from('')).toString());
    fs.writeFileSync(path.join(outDir, `${c.id}-flowrun.json`), JSON.stringify(flowrun, null, 2));
  } catch {
    /* scored as "no result", below */
  }
  const decisions = readDecisions(path.join(home, 'sessions', c.id, 'system-one.jsonl'));
  if (!opts.keepStores) {
    fs.rmSync(caseStore, { recursive: true, force: true });
    fs.rmSync(caseFlows, { recursive: true, force: true });
  }
  return { flowrun, decisions, wallMs, timedOut: run.error?.code === 'ETIMEDOUT' };
}

function readDecisions(file) {
  try {
    return fs
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
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- scoring

/** The value inside a rendered locator expression, e.g. page.getByTestId('x') -> x. */
function exprValue(expr) {
  const m = String(expr ?? '').match(/'((?:[^'\\]|\\.)*)'/);
  return m ? m[1] : null;
}

/**
 * Score one case from three sources that each know something the others do not:
 * the session's decision rows (what Jev answered, and at what confidence), the
 * flowrun's drift tickets (the locator the step actually RAN on, as an object),
 * and the ORIGINAL chain (which element that was supposed to be).
 *
 * ATTRIBUTION. A `replay.heal` row carries no skill/step/key — only the verdict
 * rows do — which is why this harness drifts exactly ONE step per replay: with
 * one dead chain there is one ask, and the mapping is not in doubt. A run that
 * produced several asks anyway (a second chain died on its own) is matched by
 * the picked row, and says so when it cannot be. See the report's `src diff`
 * note: two fields on the heal row would remove the join entirely.
 */
function scoreCase(c, out) {
  const base = {
    ...c,
    // As expressions rather than candidate objects: the report is read by
    // people, and the objects are already in the store this was derived from.
    original: c.original.map(exprOf),
    drifted: c.drifted.map(exprOf),
    wallMs: out.wallMs ?? null,
    asked: false,
    confidence: null,
    pickConfidence: null,
    reversedPick: null,
    chosen: null,
    pickedRow: null,
    optionsAgreed: null,
    guardsPassed: false,
    guardWhy: null,
    acted: false,
    verified: null,
    verdict: 'undecidable',
    verdictWhy: 'the case produced no answer to score',
    deadChain: false,
    outcome: 'no-result',
    proposal: null,
    turns: null,
  };
  if (out.error) return { ...base, outcome: 'run-error', verdictWhy: out.error };
  if (out.timedOut) return { ...base, outcome: 'timed-out', verdictWhy: `the replay exceeded --timeout ${opts.timeoutMs}ms` };
  if (!out.flowrun) return base;

  const flowStep = (out.flowrun.steps ?? []).find((s) => s.id === c.flowStep) ?? null;
  const turns = (out.flowrun.steps ?? []).reduce((n, s) => n + (s.turns ?? 0), 0);
  const heals = out.decisions.filter((d) => d.site === 'replay.heal');
  const verdicts = out.decisions.filter((d) => d.site === 'replay.heal.verdict');
  const mine = verdicts.filter((d) => d.detail?.skill === c.skill && String(d.detail?.step) === c.tag && d.detail?.key === c.key);
  const preAct = mine.find((d) => d.detail?.stage === 'pre-act') ?? null;
  const settled = mine.find((d) => d.detail?.stage === 'verified') ?? null;
  const ticket = (out.flowrun.driftTickets ?? []).find((t) => t.skill === c.skill && String(t.atStep) === c.tag && (t.key ?? 'target') === c.key) ?? null;

  // One drifted step => one ask. When a run produced several, pin ours by the
  // row Jev picked against the expression the verdict/ticket names.
  // A heal row now says which step it was for (heal-jev.ts detail.skill/step/
  // key), so attribution is a lookup. It has to be: a published Kanboard replay
  // has dead chains of its OWN on every run, so one drifted step produced
  // several asks and 23 of the first 29 kbcal cases were excluded as ambiguous.
  const myHeals = heals.filter((h) => h.detail?.skill === c.skill && String(h.detail?.step) === String(c.tag) && (h.detail?.key ?? 'target') === c.key);
  const labelled = heals.some((h) => h.detail?.skill !== undefined);
  let heal = myHeals.length ? myHeals[myHeals.length - 1] : !labelled && heals.length === 1 ? heals[0] : null;
  let ambiguousAttribution = false;
  if (!heal && !labelled && heals.length > 1) {
    const want = exprValue(preAct?.chosen ?? settled?.chosen ?? (ticket?.proposal ? candidateExpr(ticket.proposal) : null));
    heal = want ? heals.find((h) => String(h.detail?.pickedRow ?? '').includes(want)) ?? null : null;
    ambiguousAttribution = !heal;
  }

  const askedAtAll = heals.length > 0;
  const stepStruggled = !flowStep || flowStep.status !== 'success' || flowStep.recovered === true;
  // A ticket whose `fallbackUsed` is null is replay's own statement that
  // NOTHING in the chain resolved — the definition of the situation being
  // calibrated. It is the only honest signal for a dead READ: a read that
  // resolves nothing is skipped rather than failed, so the step still reports
  // success and the run still passes 9/9. Without this, every such case was
  // filed as "the perturbation did not kill the chain", which is the opposite
  // of what happened.
  const ticketSaysDead = Boolean(ticket && !ticket.fallbackUsed && !ticket.healed);
  const deadChain = askedAtAll || ticketSaysDead || stepStruggled;

  if (!heal) {
    return {
      ...base,
      turns,
      deadChain,
      outcome: ambiguousAttribution
        ? 'ambiguous-attribution'
        : askedAtAll
          ? 'ask-not-attributable'
          : deadChain
            ? 'no-ballot'
            : 'chain-not-dead',
      verdictWhy: ambiguousAttribution
        ? `${heals.length} heal asks in one run and none matched this step — excluded`
        : askedAtAll
          ? 'a heal was asked but could not be attributed to this step'
          : deadChain
            ? 'the chain died and NO ask was spent: the ballot was empty, i.e. the live page offers no INTERACTIVE element of the recorded kind. A read of a table cell or row is the usual shape — interactiveRows lists controls, and a `td` is not one.'
            : 'the drifted chain still resolved: the perturbation did not kill it, so this is not a dead-chain case',
    };
  }

  const why = String(heal.why ?? '');
  const optionsAgreed = !/disagreed/.test(why);
  const noneWon = heal.chosen === 'none' || why === 'none';
  const vetoed = /judged the control gone/.test(why);
  const guardsPassed = optionsAgreed && !noneWon && !vetoed && !preAct;

  const picked = parsePickedRow(heal.detail?.pickedRow);
  const proposal = ticket?.healed ? ticket.proposal : picked ? locatorFromRow(picked) : null;
  const judged = proposal ? judgeProposal(proposal, c.original) : { verdict: 'undecidable', why: 'no proposal object and no picked row to rebuild one from' };

  return {
    ...base,
    turns,
    deadChain: true,
    asked: true,
    confidence: typeof heal.confidence === 'number' ? heal.confidence : null,
    // The chooser's OWN confidence in the forward ballot, before `readRound`
    // zeroes the reading for a guard failure. The gate never sees it — the
    // gate compares `confidence` — but without it every guard-refused case
    // lands in the bottom bucket and the reliability curve cannot tell a pick
    // that was unsure from one that was sure and refused for another reason.
    pickConfidence: typeof heal.detail?.pickConfidence === 'number' ? heal.detail.pickConfidence : null,
    reversedPick: heal.detail?.reversed ?? null,
    chosen: heal.chosen ?? null,
    pickedRow: heal.detail?.pickedRow ?? null,
    optionsAgreed,
    guardsPassed,
    guardWhy: preAct ? preAct.why : noneWon ? 'none of these' : vetoed ? 'gone-noul veto' : optionsAgreed ? null : 'the two option orders disagreed',
    // The heal RAN. Not read off the drift ticket alone: a healed step that
    // the step's own checks then refused halts the run, and a halted run files
    // no ticket for it — the very cases this is calibrating would have read as
    // "never acted". The `verified` verdict row is written by the settled
    // callback, which only a heal that ran can reach, so it is the honest
    // signal and the ticket is the corroboration.
    acted: Boolean(ticket?.healed || settled),
    verified: settled ? Boolean(settled.verified) : null,
    verdict: judged.verdict,
    verdictWhy: judged.why,
    proposal: proposal ? candidateExpr(proposal) : null,
    askMs: heal.ms ?? null,
    outcome: !guardsPassed
      ? 'deferred'
      : settled && settled.verified === false
        ? 'healed-refused'
        : ticket?.healed || settled
          ? 'healed'
          : 'passed-guards',
  };
}

// ---------------------------------------------------------------- the report

console.error(
  opts.rescore
    ? `[drift-store] RESCORING ${selected.length} finished case(s) from ${outDir} — no app is touched`
    : `[drift-store] ${selected.length} case(s), mode=${opts.mode}, gate=${opts.gate}, model recovery ${opts.noModel ? 'DISABLED' : 'enabled (this run can spend)'}`,
);
console.error(`[drift-store] home=${home}  store=${srcStore}  app=${opts.appUrl}`);

/**
 * Which flow steps can a replay REACH with no model behind it?
 *
 * One undrifted replay first. A drifted step is only a test of the healer if
 * the flow gets to it — and with model recovery off, the first step that needs
 * the model halts everything after it. jvgr1 (2026-09-18) is what that costs
 * unasked: fwgr25's sign-in needs a recovery on today's code, so 65 of 69 cases
 * halted at step one, never touched their drifted chain, and were reported as
 * "no-ballot" — a finding about the healer that was really a finding about the
 * recording. Cases on an unreachable step are now not run at all, and say so.
 */
let reachable = null;
if (!opts.rescore && !opts.dryRun && opts.noModel) {
  console.error('[drift-store] baseline: one undrifted replay to see which steps a no-model replay reaches');
  const base = runCase({ id: `${opts.tag}-base`, baseline: true });
  const steps = base?.flowrun?.steps ?? [];
  reachable = new Set(steps.filter((st) => st.status === 'success' && !st.recovered).map((st) => st.id));
  console.error(`[drift-store] baseline: ${base?.flowrun?.passed ?? 0}/${base?.flowrun?.total ?? '?'} steps pass; reachable without a model: ${[...reachable].join(', ') || '(none)'}`);
  for (const st of steps.filter((x) => !reachable.has(x.id))) console.error(`[drift-store]   unreachable ${st.id}: ${String(st.fellBack ?? st.summary ?? '').slice(0, 200)}`);
  if (!reachable.size) die('the undrifted flow reaches NO step without a model — this store cannot calibrate anything under --no-model (pass --model to allow recovery, or pick a recording that replays clean)');
}

const scored = [];
for (const [i, c] of selected.entries()) {
  if (reachable && !reachable.has(c.flowStep)) {
    scored.push({ ...c, asked: false, deadChain: false, outcome: 'not-reachable', verdict: 'undecidable', verdictWhy: `the undrifted flow does not reach ${c.flowStep} without a model`, wallMs: 0 });
    continue;
  }
  if (!opts.rescore) console.error(`[drift-store] ${c.id} (${i + 1}/${selected.length}) ${c.flowStep} step ${c.tag} ${c.key} ${c.tool} — ${c.transform}/${c.mode}`);
  const row = scoreCase(c, opts.rescore ? replayCase(c) : runCase(c));
  scored.push(row);
  if (opts.rescore) continue;
  console.error(
    `[drift-store]   ${row.outcome}` +
      (row.asked ? ` conf=${row.confidence?.toFixed(2)} ${row.verdict}${row.verified === null ? '' : row.verified ? ' verified' : ' REFUSED-by-step'}` : '') +
      ` (${((row.wallMs ?? 0) / 1000).toFixed(1)}s)`,
  );
  if (consecutiveResetFailures >= MAX_CONSECUTIVE_RESET_FAILURES) {
    console.error(`[drift-store] STOPPING after ${scored.length}/${selected.length} case(s): the app reset failed ${consecutiveResetFailures} cases running (${RESET_TRIES} tries each). The app is down or wedged; the cases below are the ones that ran. Resume with --steps ${i + 1}-${selected.length}.`);
    process.exitCode = 3;
    break;
  }
}

const asked = scored.filter((c) => c.asked);
const dead = scored.filter((c) => c.deadChain);
const gates = [0.5, 0.6, 0.7, 0.8, 0.9];
const table = gateTable(scored, gates);
const recommended = recommendGate(table);

console.log(`\n=== jev-drift-store: ${opts.flow} on ${opts.target} (${opts.tag}) ===\n`);
console.log(`${pad('case', 9)} ${pad('step', 12)} ${pad('tag/key', 10)} ${pad('tool', 7)} ${pad('transform', 12)} ${pad('conf', 6)} ${pad('guards', 8)} ${pad('verdict', 12)} ${pad('verif', 6)} outcome`);
for (const c of scored) {
  console.log(
    `${pad(`#${c.n}`, 9)} ${pad(c.flowStep, 12)} ${pad(`${c.tag}/${c.key}`, 10)} ${pad(c.tool, 7)} ${pad(c.transform, 12)} ` +
      `${pad(c.confidence === null ? '-' : c.confidence.toFixed(2), 6)} ${pad(c.guardsPassed ? 'pass' : c.guardWhy ? 'refuse' : '-', 8)} ` +
      `${pad(c.verdict, 12)} ${pad(c.verified === null ? '-' : c.verified ? 'yes' : 'NO', 6)} ${c.outcome}`,
  );
}

console.log(`\ncases run ${scored.length}; dead chains ${dead.length}; asked ${asked.length}`);
console.log(
  `  correct ${asked.filter((c) => c.verdict === 'correct').length}   ` +
    `wrong ${asked.filter((c) => c.verdict === 'wrong').length}   ` +
    `undecidable ${asked.filter((c) => c.verdict === 'undecidable').length}`,
);
console.log(
  `  deferred by a guard ${asked.filter((c) => !c.guardsPassed).length}` +
    ` (orders disagreed ${asked.filter((c) => c.optionsAgreed === false).length},` +
    ` none ${asked.filter((c) => c.guardWhy === 'none of these').length},` +
    ` gone-veto ${asked.filter((c) => c.guardWhy === 'gone-noul veto').length},` +
    ` code guard ${asked.filter((c) => c.guardWhy && !['none of these', 'gone-noul veto', 'the two option orders disagreed'].includes(c.guardWhy)).length})`,
);
console.log(
  `  chains the perturbation did not kill ${scored.filter((c) => c.outcome === 'chain-not-dead').length};` +
    ` empty ballots ${scored.filter((c) => c.outcome === 'no-ballot').length};` +
    ` unattributable ${scored.filter((c) => c.outcome === 'ambiguous-attribution' || c.outcome === 'ask-not-attributable').length}`,
    ` not-reachable ${scored.filter((c) => c.outcome === 'not-reachable').length}`,
);
console.log(`  model turns spent across every case: ${scored.reduce((n, c) => n + (c.turns ?? 0), 0)}${opts.noModel ? ' (recovery disabled)' : ''}`);

console.log('\nreliability (every asked case, deferred ones included — that is why the gate is 0):');
console.log(`${pad('bucket', 12)} ${pad('n', 5)} ${pad('correct', 8)} ${pad('wrong', 6)} ${pad('undec', 6)} accuracy`);
for (const r of reliability(scored)) {
  console.log(`${pad(r.bucket, 12)} ${pad(r.n, 5)} ${pad(r.correct, 8)} ${pad(r.wrong, 6)} ${pad(r.undecidable, 6)} ${r.accuracy === null ? '-' : `${(r.accuracy * 100).toFixed(0)}%`}`);
}

console.log('\nwhat each gate would do (a case is accepted only if every code guard passed too):');
console.log(`${pad('gate', 6)} ${pad('accepted', 9)} ${pad('correct', 8)} ${pad('wrong', 6)} ${pad('undec', 6)} share of dead chains healed`);
for (const r of table) {
  console.log(
    `${pad(r.gate.toFixed(2), 6)} ${pad(r.accepted, 9)} ${pad(r.correct, 8)} ${pad(r.wrong, 6)} ${pad(r.undecidable, 6)} ` +
      `${r.healRate === null ? '-' : `${(r.healRate * 100).toFixed(0)}%`}${r.wrong ? `   FALSE ACCEPTS: ${r.wrongCases.join(', ')}` : ''}`,
  );
}

const refusedPicks = asked.filter((c) => !c.guardsPassed);
if (refusedPicks.length) {
  console.log('\npicks a guard refused, with the confidence the chooser itself had (the gate never sees this number):');
  console.log(`${pad('case', 8)} ${pad('guard', 30)} ${pad('fwd conf', 9)} ${pad('reversed', 10)} would have been`);
  for (const c of refusedPicks) {
    console.log(`${pad(`#${c.n}`, 8)} ${pad(c.guardWhy, 30)} ${pad(c.pickConfidence === null ? '-' : c.pickConfidence.toFixed(2), 9)} ${pad(c.reversedPick ?? '-', 10)} ${c.verdict}`);
  }
}

for (const [label, key] of [['transform family', 'transform'], ['tool', 'tool'], ['perturbation mode', 'mode'], ['flow step', 'flowStep']]) {
  console.log(`\nby ${label}:`);
  console.log(`${pad('key', 16)} ${pad('cases', 6)} ${pad('asked', 6)} ${pad('correct', 8)} ${pad('wrong', 6)} ${pad('undec', 6)} median conf`);
  for (const r of splitBy(scored, key)) {
    console.log(
      `${pad(r.key, 16)} ${pad(r.cases, 6)} ${pad(r.asked, 6)} ${pad(r.correct, 8)} ${pad(r.wrong, 6)} ${pad(r.undecidable, 6)} ` +
        `${r.medianConfidence === null ? '-' : r.medianConfidence.toFixed(2)}`,
    );
  }
}

console.log(
  `\nRECOMMENDED GATE: ${recommended.gate === null ? 'none' : recommended.gate.toFixed(2)} — ${recommended.why}` +
    (recommended.gate === null ? '' : `, healing ${(recommended.healRate * 100).toFixed(0)}% of dead chains (${recommended.accepted} accepted, ${recommended.undecidable} of them undecidable).`),
);
console.log(`Current gate in decide.ts GATES['replay.heal'] was set at n=4. This run adds n=${asked.filter((c) => c.verdict !== 'undecidable').length} decided case(s).`);

const report = {
  tag: opts.tag,
  flow: opts.flow,
  target: opts.target,
  app: opts.appUrl,
  store: srcStore,
  origin: storeOrigin,
  mode: opts.mode,
  gate: Number(opts.gate),
  noModel: opts.noModel,
  ran: new Date().toISOString(),
  healableCases: cases.length,
  refusedByPolicy: refused,
  cases: scored,
  totals: {
    dead: dead.length,
    asked: asked.length,
    correct: asked.filter((c) => c.verdict === 'correct').length,
    wrong: asked.filter((c) => c.verdict === 'wrong').length,
    undecidable: asked.filter((c) => c.verdict === 'undecidable').length,
    deferredByGuard: asked.filter((c) => !c.guardsPassed).length,
    chainNotDead: scored.filter((c) => c.outcome === 'chain-not-dead').length,
  },
  reliability: reliability(scored),
  gates: table,
  byTransform: splitBy(scored, 'transform'),
  byTool: splitBy(scored, 'tool'),
  byMode: splitBy(scored, 'mode'),
  recommended,
};
const reportPath = path.join(outDir, `${opts.tag}-drift-store.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nwrote ${reportPath}`);
