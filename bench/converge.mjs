#!/usr/bin/env node
/**
 * converge: how far do the EXISTING retry mechanisms take a recording that
 * did not compile to a passing model-free artifact?
 *
 *   node bench/converge.mjs --from fwod88 --tag fwod88-cv --target odoo \
 *        --verify-cmd "node bench/verify-odoo.mjs" [--max-rounds 4] [--runs 2] [--out bench/results] [--dry]
 *
 * The working state is a copy of an earlier sweep's recording: the flow JSON
 * (bench/results/flows/<from>.json, copied under the new tag's name, as
 * sweep.mjs --from does) and its skill store (bench/results/<from>-skills).
 * Each round then does exactly what a user at a terminal would do with the
 * commands the CLI already offers, and nothing else:
 *
 *   1. `sitelooper compile --json`. REFUSED with rerecord actions → run
 *      `sitelooper rerecord <flow.json> <step> --runs N` for the EARLIEST
 *      named step (the model re-records that one step; the rest replays),
 *      then recompile → next round.
 *      Refused with no action (a compiler blocker) → stop: nothing to retry.
 *   2. Compiled → bench/spec-replay.mjs runs the artifact under plain
 *      Playwright against a reset app, then the verifier. Pass → CONVERGED.
 *   3. Artifact or verifier failed → `sitelooper repair <name>.flow.ts
 *      --converge 1` (triage run, converge run, compiled-spec check). If
 *      repair's own spec check passes → CONVERGED BY REPAIR (the artifact is
 *      the repaired .flow.ts). Else the steps repair says need re-recording,
 *      or the step the artifact failed at (`@step` anchor), are re-recorded →
 *      next round.
 *
 * Every model turn happens at record or repair time; the artifact that ends
 * the loop is model-free. Writes <out>/<tag>-converge.json (every round, every
 * command's verdict, the run and turn counts) and <out>/<tag>-converge.log.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APP_DEFAULTS } from './app-defaults.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const cli = path.join(repoRoot, 'bin', 'sitelooper.js');

const args = { from: '', tag: '', target: '', verifyCmd: '', maxRounds: 4, runs: 2, out: 'bench/results', dry: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--from') args.from = argv[++i] ?? '';
  else if (a === '--tag') args.tag = argv[++i] ?? '';
  else if (a === '--target') args.target = argv[++i] ?? '';
  else if (a === '--verify-cmd') args.verifyCmd = argv[++i] ?? '';
  else if (a === '--max-rounds') args.maxRounds = Number(argv[++i]);
  else if (a === '--runs') args.runs = Number(argv[++i]);
  else if (a === '--out') args.out = argv[++i] ?? '';
  else if (a === '--dry') args.dry = true;
  else {
    console.error(`[converge] unknown argument ${a}`);
    process.exit(2);
  }
}
for (const k of ['from', 'tag', 'target']) if (!args[k]) { console.error(`[converge] --${k} is required`); process.exit(2); }

const outDir = path.resolve(args.out);
const flowsDir = path.join(outDir, 'flows');
const srcSkills = path.join(outDir, `${args.from}-skills`);
const srcFlow = path.join(flowsDir, `${args.from}.json`);
const skillsDir = path.join(outDir, `${args.tag}-skills`);
const flowJson = path.join(flowsDir, `${args.tag}.json`);
const logFile = path.join(outDir, `${args.tag}-converge.log`);
const reportFile = path.join(outDir, `${args.tag}-converge.json`);
const resetCmd = `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(here, 'reset-app.mjs'))} --target ${args.target}`;

const log = (line) => {
  const s = `[converge] ${line}`;
  console.error(s);
  fs.appendFileSync(logFile, s + '\n');
};

if (!fs.existsSync(srcSkills) || !fs.existsSync(srcFlow)) {
  console.error(`[converge] --from ${args.from}: need both ${srcSkills} and ${srcFlow}`);
  process.exit(2);
}
fs.mkdirSync(flowsDir, { recursive: true });
fs.rmSync(skillsDir, { recursive: true, force: true });
fs.cpSync(srcSkills, skillsDir, { recursive: true });
const flow = JSON.parse(fs.readFileSync(srcFlow, 'utf8'));
flow.name = args.tag;
fs.writeFileSync(flowJson, JSON.stringify(flow, null, 2));
fs.writeFileSync(logFile, '');
log(`from ${args.from}: ${flow.steps.length} step(s), store copied to ${skillsDir}, flow ${flowJson}`);

const env = {
  ...(APP_DEFAULTS[args.target] ?? {}),
  ...process.env,
  SITELOOPER_SKILLS: '1',
  SITELOOPER_SKILLS_DIR: skillsDir,
  SITELOOPER_FLOWS_DIR: flowsDir,
  BENCH_OUT: outDir,
};

/** Run a command, keep its stderr in the log, return {status, stdout, json}. */
function run(label, cmd, cmdArgs, opts = {}) {
  log(`${label}: ${[cmd, ...cmdArgs].map((s) => (/\s/.test(s) ? JSON.stringify(s) : s)).join(' ')}`);
  if (args.dry && opts.live) {
    log(`${label}: DRY — not executed`);
    return { status: null, stdout: '', json: null, dry: true };
  }
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024, shell: opts.shell ?? false, cwd: repoRoot });
  if (r.stderr) fs.appendFileSync(logFile, r.stderr);
  let json = null;
  if (opts.json && r.stdout) {
    try { json = JSON.parse(r.stdout); } catch { const at = r.stdout.indexOf('{'); if (at >= 0) { try { json = JSON.parse(r.stdout.slice(at)); } catch { /* no json */ } } }
  }
  if (!opts.json && r.stdout) fs.appendFileSync(logFile, r.stdout);
  log(`${label}: exit ${r.status}`);
  return { status: r.status, stdout: r.stdout ?? '', json };
}

const report = { tag: args.tag, from: args.from, target: args.target, maxRounds: args.maxRounds, rerecordRuns: args.runs, rounds: [], verdict: null, flowRuns: 0, modelTurns: 0 };
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

function compile(k) {
  const tmp = path.join(outDir, `${args.tag}-c${k}-compile`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const r = run(`round ${k} compile`, process.execPath, [cli, 'compile', flowJson, '--out', tmp, '--overwrite-spec', '--json'], { json: true });
  const j = r.json ?? {};
  const errors = (j.diagnostics ?? []).filter((d) => d.severity === 'error');
  // The outputs the refusals say nobody publishes, by producer step: a
  // re-record of that step is told to READ them (odoo fwod88-cv2: the model
  // re-created the quotation but never read its reference, four times).
  const missing = new Map();
  for (const d of errors) {
    const m = /\{\{([\w-]+)\.([\w.-]+?)\}\}, and nothing has ever published/.exec(String(d.what ?? ''));
    if (m) missing.set(m[1], [...new Set([...(missing.get(m[1]) ?? []), m[2]])]);
  }
  // The steps the diagnostics say to re-record, in FLOW order: an unsourced
  // reference names its producer (03-create) beside the consumer's own pin
  // (08-open), and re-recording the producer first usually clears the rest.
  // One re-record per round, then recompile — cheaper than re-recording
  // every named step on evidence the next compile will change.
  const order = new Map(flow.steps.map((st, i) => [st.id, i]));
  const steps = [...new Set([...(j.nextActions ?? []), ...errors.map((d) => d.action)].filter((a) => a && a.command === 'rerecord' && a.step).map((a) => a.step))].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  return {
    outcome: j.outcome ?? `exit ${r.status}`,
    refused: Boolean(j.refused) || j.compilable === false || r.status !== 0,
    codes: [...new Set(errors.map((d) => `${d.code}@${d.step ?? '-'}`))],
    missingOutputs: Object.fromEntries(missing),
    blockers: j.compileBlockers ?? [],
    steps,
    flowFile: j.flowFile ? path.resolve(repoRoot, j.flowFile) : path.join(tmp, `${args.tag}.flow.ts`),
    missing,
  };
}

/** The re-record instruction: the step's own, plus the outputs a later step needs read from the page. */
function instructionFor(step, outputs) {
  const live = JSON.parse(fs.readFileSync(flowJson, 'utf8')).steps.find((st) => st.id === step);
  const base = live?.instruction ?? '';
  if (!outputs?.length) return null;
  const file = path.join(outDir, `${args.tag}-${step}-instruction.txt`);
  fs.writeFileSync(file, `${base}

A later step of this flow uses these values, so before you report, read each one from the page with \`read\` (label=<name>) and report it under exactly this name: ${outputs.join(', ')}.`);
  return file;
}

function rerecord(k, step, why, outputs) {
  const instruction = instructionFor(step, outputs);
  const r = run(`round ${k} rerecord ${step} (${why})${outputs?.length ? ` — asked to read ${outputs.join(', ')}` : ''}`, process.execPath, [cli, 'rerecord', flowJson, step, '--var', `runid=${args.tag}-r${k}n{n}`, '--runs', String(args.runs), '--reset-cmd', resetCmd, ...(instruction ? ['--instruction-file', instruction] : []), '--json'], { json: true, live: true });
  const j = r.json ?? {};
  const runs = (j.runs ?? []).map((x) => ({ status: x.status, tier: x.tier, turns: x.turns, repinned: x.repinned }));
  report.flowRuns += runs.length;
  report.modelTurns += runs.reduce((n, x) => n + (x.turns ?? 0), 0);
  return { step, why, ok: j.ok ?? (r.status === 0), pinned: j.pinned ?? null, runs, diagnostics: (j.diagnostics ?? []).map((d) => `${d.code}: ${d.what ?? d.line ?? ''}`.slice(0, 300)), exit: r.status, dry: r.dry ?? false };
}

function artifact(k) {
  const tag = `${args.tag}-c${k}`;
  run(`round ${k} artifact`, process.execPath, [path.join(here, 'spec-replay.mjs'), '--flow', flowJson, '--skills', skillsDir, '--tag', tag, '--target', args.target, '--reset', '--out', outDir], { live: true });
  let res = null;
  try { res = JSON.parse(fs.readFileSync(path.join(outDir, `${tag}-spec-result.json`), 'utf8')); } catch { /* no result */ }
  let verified = 'n/a';
  let failLines = [];
  if (args.verifyCmd && !args.dry) {
    const cmd = args.verifyCmd.includes('{runid}') ? args.verifyCmd.replaceAll('{runid}', tag) : `${args.verifyCmd} ${tag}`;
    const v = spawnSync(cmd, { encoding: 'utf8', env, shell: true, cwd: repoRoot });
    fs.appendFileSync(logFile, (v.stdout ?? '') + (v.stderr ?? ''));
    const passes = ((v.stdout ?? '').match(/\bPASS\b/g) ?? []).length;
    const total = ((v.stdout ?? '').match(/\b(PASS|FAIL)\b/g) ?? []).length;
    verified = total ? `${passes}/${total}` : 'n/a';
    failLines = (v.stdout ?? '').split('\n').filter((l) => /\bFAIL\b/.test(l)).slice(0, 12);
  }
  const errors = (res?.tests ?? []).filter((t) => !t.ok).map((t) => t.error ?? '').filter(Boolean);
  // The step a failure names: the artifact's own message ("01-signin s_5fccd8/2: …"),
  // or a `@step <id>` anchor in a stack.
  // The step a failure names. Producer first: "02-open needs {{01-signin.x}}, and
  // this run never published it" is 01-signin's fault (fwvk15-cv burned four
  // rounds re-recording the consumer). Then the artifact's own site
  // ("01-signin s_5fccd8/2: …", "… (01-signin s_9e6344/2 target)") and `@step` anchors.
  const texts = [...errors, ...(res?.drift ?? []).map(String)].map(String);
  const producers = texts.flatMap((e) => [...e.matchAll(/needs \{\{([\w-]+)\./g)].map((m) => m[1]));
  // …and WHAT the producer must read: "02-open needs {{01-signin.visible_projects_2}}"
  // (fwvk15-cv2 re-recorded 01-signin four times without being told).
  const missing = new Map();
  for (const e of texts) for (const m of e.matchAll(/needs \{\{([\w-]+)\.([\w.-]+?)\}\}/g)) missing.set(m[1], [...new Set([...(missing.get(m[1]) ?? []), m[2]])]);
  const sites = texts.flatMap((e) => [
    ...[...e.matchAll(/@step\s+([\w-]+)/g)].map((m) => m[1]),
    ...[...e.matchAll(/(?:^|[\s(:])([\w-]+) s_[0-9a-f]{6}\/\d+\b/g)].map((m) => m[1]),
  ]);
  const anchors = [...new Set([...producers, ...sites])];
  const passed = Boolean(res) && res.exitCode === 0 && (res.stats?.failed ?? 1) === 0 && !failLines.length && (verified === 'n/a' || !verified.includes('FAIL'));
  return { tag, exitCode: res?.exitCode ?? null, stats: res?.stats ?? null, driftCount: res?.driftCount ?? null, verified, failLines, errors: errors.map((e) => e.slice(0, 400)), anchors, missing, missingOutputs: Object.fromEntries(missing), passed, dry: args.dry };
}

function repair(k, flowFile) {
  // In place: repair's compiled-spec check runs the .spec.ts BESIDE the flow
  // file it wrote (it never rewrites the spec), so a renamed --out has no spec
  // and the check reports "unavailable" (fwod88-cv round 3). The compile dir is
  // per round, so nothing else is lost by rewriting the file there.
  const repaired = flowFile;
  const r = run(`round ${k} repair`, process.execPath, [cli, 'repair', flowFile, '--var', `runid=${args.tag}-p${k}n{n}`, '--converge', '1', '--reset-cmd', resetCmd, '--json'], { json: true, live: true });
  const j = r.json ?? {};
  const runs = (j.runs ?? []).map((x) => ({ label: x.label, passed: x.passed, total: x.total, status: x.status, tickets: x.tickets }));
  report.flowRuns += runs.length + (j.specCheck?.ran ? 1 : 0);
  // notConverged entries read "02-open (tier B — unresolved reference(s): …)":
  // the id is the leading token; "(unreached)" is not a step (fwvk15-cv passed
  // the whole string to rerecord, which refused it, four times).
  const stepIdOf = (x) => /^([\w-]+)/.exec(String(x ?? ''))?.[1] ?? null;
  const needs = [...new Set([...(j.notConverged ?? []).map(stepIdOf), ...(j.diagnostics ?? []).filter((d) => d.code === 'needs-rerecord' && d.step).map((d) => stepIdOf(d.step))].filter((id) => id && flow.steps.some((st) => st.id === id)))];
  return { exit: r.status, outcome: j.outcome ?? null, refused: j.refused ?? null, converged: j.converged ?? null, specCheck: j.specCheck ? { ran: j.specCheck.ran, passed: j.specCheck.passed } : null, runs, needsRerecord: needs, changes: (j.changes ?? []).slice(0, 20), repaired, dry: r.dry ?? false };
}

let verdict = null;
for (let k = 1; k <= args.maxRounds && !verdict; k++) {
  const round = { k, compile: compile(k), rerecords: [], artifact: null, repair: null };
  report.rounds.push(round);
  save();
  if (round.compile.refused) {
    log(`round ${k}: compile refused (${round.compile.codes.join(', ') || round.compile.outcome}); rerecord steps: ${round.compile.steps.join(', ') || 'NONE'}`);
    if (!round.compile.steps.length) { verdict = { status: 'stuck', why: 'compile refused with no rerecord action', blockers: round.compile.blockers.slice(0, 10) }; break; }
    round.rerecords.push(rerecord(k, round.compile.steps[0], `compile refusal${round.compile.steps.length > 1 ? `; also named: ${round.compile.steps.slice(1).join(', ')}` : ''}`, round.compile.missing.get(round.compile.steps[0])));
    save();
    if (args.dry) { verdict = { status: 'dry', why: 'dry run stops at the first live command' }; break; }
    continue;
  }
  round.artifact = artifact(k);
  save();
  if (round.artifact.dry) { verdict = { status: 'dry', why: 'dry run stops at the first live command' }; break; }
  if (round.artifact.passed) { verdict = { status: 'converged', why: `round ${k}: compiled artifact passed (${round.artifact.verified})`, artifact: round.compile.flowFile }; break; }
  log(`round ${k}: artifact failed (exit ${round.artifact.exitCode}, verified ${round.artifact.verified}); anchors ${round.artifact.anchors.join(', ') || 'none'}`);
  round.repair = repair(k, round.compile.flowFile);
  save();
  if (round.repair.specCheck?.ran && round.repair.specCheck.passed) { verdict = { status: 'converged-by-repair', why: `round ${k}: repair's compiled-spec check passed`, artifact: round.repair.repaired }; break; }
  const order = new Map(flow.steps.map((st, i) => [st.id, i]));
  // The producer the artifact blames outranks the consumers repair lists; then flow order.
  const steps = [...new Set([...round.artifact.anchors, ...round.repair.needsRerecord])].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  if (!steps.length) { verdict = { status: 'stuck', why: 'artifact failed, repair did not converge, and no step to re-record was named' }; break; }
  round.rerecords.push(rerecord(k, steps[0], `${round.repair.needsRerecord.length ? 'repair: needs-rerecord' : 'artifact failed at this step'}${steps.length > 1 ? `; also named: ${steps.slice(1).join(', ')}` : ''}`, round.artifact.missing.get(steps[0])));
  save();
}
report.verdict = verdict ?? { status: 'exhausted', why: `${args.maxRounds} round(s) without a passing artifact` };
save();
const summary = `${args.tag}: ${report.verdict.status} — ${report.verdict.why}; rounds ${report.rounds.length}, flow runs ${report.flowRuns}, model turns ${report.modelTurns}`;
log(summary);
console.log(summary);
process.exit(report.verdict.status.startsWith('converged') ? 0 : 1);
