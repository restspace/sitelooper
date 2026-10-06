#!/usr/bin/env node
/**
 * The after arm's secondary metric (notes/HELDOUT2-PROTOCOL.md): does the
 * product's own `sitelooper build --converge` turn a recording whose compiled
 * spec was not clean into one that is?
 *
 *   node bench/heldout/converge-build.mjs --from ha<code><rep> --target <t> [--rounds 2]
 *
 * Works on a COPY of the sweep's recording (flow + skill store) under the tag
 * <from>-cv, exactly as bench/converge.mjs does, so the sweep's own published
 * store is untouched. Then, whatever build said, runs the converged recording's
 * spec through bench/spec-replay.mjs against a reset app and scores it with the
 * target's verifier, so the outcome is judged by the app, not by the tool.
 * Writes <out>/<from>-cv-build.json (build's --json), -cv-build.log, the spec
 * run's own files (<from>-cv-spec-*), and <from>-cv-flow.json (the final flow),
 * all under the <from>- prefix so `publish-results.mjs --base <from>` takes them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APP_DEFAULTS } from '../app-defaults.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const cli = path.join(repoRoot, 'bin', 'sitelooper.js');

const args = { from: '', target: '', rounds: 2, out: 'bench/results' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--from') args.from = argv[++i] ?? '';
  else if (a === '--target') args.target = argv[++i] ?? '';
  else if (a === '--rounds') args.rounds = Number(argv[++i]);
  else if (a === '--out') args.out = argv[++i] ?? '';
  else { console.error(`[converge-build] unknown argument ${a}`); process.exit(2); }
}
if (!args.from || !args.target) { console.error('[converge-build] --from and --target are required'); process.exit(2); }

const outDir = path.resolve(repoRoot, args.out);
const flowsDir = path.join(outDir, 'flows');
const tag = `${args.from}-cv`;
const srcFlow = path.join(flowsDir, `${args.from}.json`);
const srcSkills = path.join(outDir, `${args.from}-skills`);
const flowJson = path.join(flowsDir, `${tag}.json`);
const skillsDir = path.join(outDir, `${tag}-skills`);
const logFile = path.join(outDir, `${tag}-build.log`);
const log = (line) => { console.error(`[converge-build] ${line}`); fs.appendFileSync(logFile, `[converge-build] ${line}\n`); };

if (!fs.existsSync(srcFlow) || !fs.existsSync(srcSkills)) { console.error(`[converge-build] need ${srcFlow} and ${srcSkills}`); process.exit(2); }
fs.writeFileSync(logFile, '');
fs.rmSync(skillsDir, { recursive: true, force: true });
fs.cpSync(srcSkills, skillsDir, { recursive: true });
const flow = JSON.parse(fs.readFileSync(srcFlow, 'utf8'));
flow.name = tag;
fs.writeFileSync(flowJson, JSON.stringify(flow, null, 2));
log(`copied ${args.from} → ${tag}: ${flow.steps.length} step(s)`);

const env = {
  ...(APP_DEFAULTS[args.target] ?? {}),
  ...process.env,
  SITELOOPER_SKILLS: '1',
  SITELOOPER_SKILLS_DIR: skillsDir,
  SITELOOPER_FLOWS_DIR: flowsDir,
  BENCH_OUT: outDir,
};
const resetCmd = `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(repoRoot, 'bench', 'reset-app.mjs'))} --target ${args.target}`;
const specOut = fs.mkdtempSync(path.join(outDir, `.${tag}-compiled-`));

const t0 = Date.now();
const build = spawnSync(process.execPath, [cli, 'build', flowJson, '--converge', String(args.rounds), '--reset-cmd', resetCmd, '--var', `runid=${tag}n{n}`, '--out', specOut, '--overwrite-spec', '--json'], { cwd: repoRoot, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (build.stderr) fs.appendFileSync(logFile, build.stderr);
let json = null;
try { json = JSON.parse(build.stdout); } catch { const at = (build.stdout ?? '').indexOf('{'); if (at >= 0) { try { json = JSON.parse(build.stdout.slice(at)); } catch { /* not json */ } } }
fs.writeFileSync(path.join(outDir, `${tag}-build.json`), JSON.stringify({ exit: build.status, wallMs: Date.now() - t0, result: json, stdoutTail: json ? undefined : (build.stdout ?? '').slice(-4000) }, null, 2));
const cv = json?.converge ?? json?.data?.converge ?? null;
log(`build --converge ${args.rounds}: exit ${build.status}, status ${cv?.status ?? 'unknown'}, model turns ${cv?.modelTurns ?? '?'}, ${cv?.rounds?.length ?? '?'} round(s) — ${cv?.why ?? ''}`);
fs.copyFileSync(flowJson, path.join(outDir, `${tag}-flow.json`));

// Judged by the app, whatever build concluded.
const spec = spawnSync(process.execPath, [path.join(repoRoot, 'bench', 'spec-replay.mjs'), '--flow', flowJson, '--skills', skillsDir, '--tag', `${tag}-spec`, '--target', args.target, '--reset', '--out', outDir], { cwd: repoRoot, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
fs.writeFileSync(path.join(outDir, `${tag}-spec-run.log`), (spec.stdout ?? '') + (spec.stderr ?? ''));
log(`spec of the converged recording: exit ${spec.status}`);
const verify = spawnSync(process.execPath, [path.join(repoRoot, 'bench', `verify-${args.target}.mjs`), `${tag}-spec`], { cwd: repoRoot, env, encoding: 'utf8' });
fs.writeFileSync(path.join(outDir, `${tag}-spec-verify.log`), (verify.stdout ?? '') + (verify.stderr ?? ''));
log(`verifier: exit ${verify.status}`);
process.stdout.write(verify.stdout ?? '');
fs.rmSync(specOut, { recursive: true, force: true });
