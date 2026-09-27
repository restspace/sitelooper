#!/usr/bin/env node
/**
 * publish-results — put one sweep's raw results on a results branch.
 *
 * Copies bench/results/<base>-* (files and directories), the flow
 * bench/results/flows/<base>.json and, when the sweep did not already place
 * them, the run's own script/timing/trace records into bench/results-published,
 * then creates results/<base>, stages ONLY bench/results-published, commits with
 * a fixed message and pushes. One command, so the cloud box's routine runs it
 * as one step:
 *
 *   node bench/publish-results.mjs --base fwod100
 *   node bench/publish-results.mjs --base fwod100 --dry-run     # copy and show, no git
 *   node bench/publish-results.mjs --base fwod88-cv5 --convergence
 *
 * Never touches main: a checkout of a new branch from wherever the box is, a
 * push of that branch only. Exit 0 with the branch on the remote, else 1.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = opt('--base');
const dryRun = args.includes('--dry-run');
const convergence = args.includes('--convergence');
const resultsDir = path.resolve(opt('--results') ?? path.join(root, 'bench', 'results'));
const publishDir = path.resolve(opt('--to') ?? path.join(root, 'bench', 'results-published'));
if (!base || !/^[A-Za-z0-9._-]+$/.test(base)) {
  console.error('usage: publish-results.mjs --base <runid> [--convergence] [--dry-run] [--results <dir>] [--to <dir>]');
  process.exit(2);
}

const git = (...a) => {
  const r = spawnSync('git', a, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')} failed (exit ${r.status}): ${(r.stderr || r.stdout || '').trim()}`);
  return (r.stdout || '').trim();
};

fs.mkdirSync(publishDir, { recursive: true });
let copied = 0;
const copy = (from, to) => {
  if (!fs.existsSync(from)) return false;
  fs.cpSync(from, to, { recursive: true, force: true });
  copied += 1;
  return true;
};

// 1. Everything the sweep and the compiled arm wrote for this base.
for (const name of fs.readdirSync(resultsDir)) {
  if (name === base || name.startsWith(`${base}-`) || name.startsWith(`${base}.`)) copy(path.join(resultsDir, name), path.join(publishDir, name));
}
// 2. The flow.
copy(path.join(resultsDir, 'flows', `${base}.json`), path.join(publishDir, `${base}.json`));
// 3. The recording run's own records, unless the sweep already placed them
//    (bench/sweep.mjs copies them at the end of every run).
const sessions = path.join(process.env.SITELOOPER_HOME ?? path.join(os.homedir(), '.sitelooper'), 'sessions');
for (const n of [1, 2, 3]) {
  const runid = `${base}-n${n}`;
  for (const f of ['script', 'timing', 'trace']) {
    const to = path.join(publishDir, `${runid}-${f}.jsonl`);
    if (fs.existsSync(to)) continue;
    copy(path.join(sessions, runid, `${f}.jsonl`), to);
  }
}
console.log(`[publish] ${copied} item(s) into ${path.relative(root, publishDir)} for ${base}`);
if (!copied) {
  console.error(`[publish] nothing found for ${base} under ${resultsDir}`);
  process.exit(1);
}
if (dryRun) {
  console.log('[publish] dry run: no git');
  process.exit(0);
}

// 4. Branch, stage only the published directory, commit, push.
const branch = `results/${base}`;
const current = git('rev-parse', '--abbrev-ref', 'HEAD');
if (current === 'main' || current === 'master') {
  const exists = spawnSync('git', ['rev-parse', '--verify', '--quiet', branch], { cwd: root });
  git('checkout', exists.status === 0 ? branch : '-b', ...(exists.status === 0 ? [] : [branch]));
} else if (current !== branch) {
  console.log(`[publish] staying on ${current} (not main); pushing it as ${branch}`);
}
git('add', path.relative(root, publishDir));
const staged = git('diff', '--cached', '--name-only');
if (!staged) {
  console.log('[publish] nothing new to commit');
} else {
  git('commit', '-m', `Add ${convergence ? 'convergence' : 'raw'} results for ${base}`);
}
git('push', '-u', 'origin', `HEAD:refs/heads/${branch}`);
const remote = git('ls-remote', '--heads', 'origin', branch);
if (!remote) {
  console.error(`[publish] ${branch} is not on origin after the push`);
  process.exit(1);
}
console.log(`[publish] on origin: ${remote}`);
