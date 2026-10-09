#!/usr/bin/env node
/**
 * rebuild-survey — what a COMPILE change does to every published recording.
 *
 *   node bench/rebuild-survey.mjs --out <file.json> [--code <repo>] [--tags a,b] [--apps en,gt] [--limit N] [--no-fetch]
 *   node bench/rebuild-survey.mjs --compare <base.json> <new.json>
 *
 * WHY THIS EXISTS. bench/corpus-check.mjs compiles the published STORES into
 * specs; it never recompiles a skill from its recording, so a change inside
 * compileSkills (app-minted url positions, locator candidates) reads as "0
 * changes" there whatever it does (hard-5 fixes 2 and 5a, 2026-10-08). This
 * replays the recording half instead: for every results branch with a
 * `<runid>-n1-script.jsonl`, bench/rebuild-flow.mjs of the code under `--code`
 * recompiles the n1 skills offline (no app, no model) and this keeps, per
 * skill, what those fixes touch: the start url pattern, every step's expected
 * url pattern, and every css/id locator candidate. Run it twice (base code and
 * new code), then --compare lists every recording whose skills differ.
 *
 * Read-only against the repo and origin: files are read with `git show`, never
 * by checking out a results branch.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const argv = process.argv.slice(2);
const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);

if (argv.includes('--compare')) {
  const [a, b] = argv.slice(argv.indexOf('--compare') + 1).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  let changed = 0;
  const tags = [...new Set([...Object.keys(a.rows), ...Object.keys(b.rows)])].sort();
  for (const tag of tags) {
    const x = a.rows[tag], y = b.rows[tag];
    if (!x || !y) { console.log(`${tag}: only in ${x ? 'base' : 'new'}`); changed++; continue; }
    if (x.error || y.error) { if (x.error !== y.error) { console.log(`${tag}: error base=${x.error ?? '-'} new=${y.error ?? '-'}`); changed++; } continue; }
    const lx = new Set(x.lines), ly = new Set(y.lines);
    const gone = x.lines.filter((l) => !ly.has(l)), added = y.lines.filter((l) => !lx.has(l));
    if (!gone.length && !added.length) continue;
    changed++;
    console.log(`=== ${tag} (${gone.length} removed, ${added.length} added)`);
    for (const l of gone) console.log(`  - ${l}`);
    for (const l of added) console.log(`  + ${l}`);
  }
  console.log(`recordings: ${tags.length}, changed: ${changed}`);
  process.exit(0);
}

const out = arg('--out');
if (!out) { console.error('usage: rebuild-survey.mjs --out <file> [--code <repo>] [--tags a,b] [--apps en,gt] [--limit N] [--no-fetch] | --compare <a> <b>'); process.exit(2); }
const code = path.resolve(arg('--code', repo));
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

if (!argv.includes('--no-fetch')) spawnSync('git', ['fetch', '-q', 'origin', '+refs/heads/results/*:refs/remotes/origin/results/*'], { cwd: repo, stdio: 'inherit' });
const branches = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/results/').split('\n').filter(Boolean);
const wantTags = arg('--tags')?.split(',');
const apps = arg('--apps')?.split(',');
const limit = Number(arg('--limit', '0'));

/** The recordings a branch published under its own name: results/fwec2-5h6tkr carries fwec2-n1-script.jsonl. */
const targets = [];
for (const ref of branches) {
  const name = ref.replace(/^origin\/results\//, '');
  const files = git('ls-tree', '--name-only', ref, 'bench/results-published/').split('\n').map((f) => path.basename(f));
  const own = [name, name.replace(/-[a-z0-9]{6}$/, '')].find((t) => files.includes(`${t}-n1-script.jsonl`));
  if (!own) continue;
  if (wantTags && !wantTags.includes(own)) continue;
  if (apps && !apps.some((a) => new RegExp(`^fw${a}\\d`).test(own))) continue;
  targets.push({ ref, tag: own });
}
const picked = limit ? targets.slice(0, limit) : targets;

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild-survey-'));
const rows = {};
const summarise = (skill) => {
  const lines = [];
  const instr = String(skill.provenance?.instruction ?? '?').replace(/\s+/g, ' ').slice(0, 40);
  const at = `[${instr}]${skill.seq ? `.${skill.seq.index ?? ''}` : ''}`;
  if (skill.preconditions?.urlPattern) lines.push(`${at} start ${skill.preconditions.urlPattern}`);
  // Which tool each step runs, and where every goto goes: a goto that carries
  // n1's own record id (hakm1 `/timesheet/1/edit`, compile-g1 item 1b) is
  // slotted or turned into a link click, and neither shows in the patterns.
  lines.push(`${at} tools ${(skill.steps ?? []).map((s) => s.tool).join(',')}`);
  (skill.steps ?? []).forEach((s, i) => {
    if (s.tool === 'goto') lines.push(`${at}/${i + 1} goto ${s.args?.url ?? '?'}`);
  });
  (skill.steps ?? []).forEach((s, i) => {
    if (s.expect?.urlPattern) lines.push(`${at}/${i + 1} ${s.tool} expect ${s.expect.urlPattern}`);
    for (const [slot, cands] of Object.entries(s.locators ?? {})) {
      for (const c of cands ?? []) if (c.kind === 'css' || c.kind === 'id') lines.push(`${at}/${i + 1} ${s.tool} ${slot} ${c.kind} ${c.selector ?? c.id ?? ''}`);
      // A chain left with nothing but a screen position finds its element by where it was drawn.
      if (cands?.length && cands.every((c) => c.kind === 'point')) lines.push(`${at}/${i + 1} ${s.tool} ${slot} POINT-ONLY`);
    }
  });
  return lines;
};
const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]) : [];

let n = 0;
for (const { ref, tag } of picked) {
  n++;
  const dir = path.join(tmpRoot, tag);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, `${tag}-n1-script.jsonl`), git('show', `${ref}:bench/results-published/${tag}-n1-script.jsonl`));
  } catch (e) { rows[tag] = { error: 'no script' }; continue; }
  const store = path.join(dir, 'store-{runid}');
  const r = spawnSync(process.execPath, [path.join(code, 'bench', 'rebuild-flow.mjs'), '--tag', tag, '--dir', dir], {
    cwd: code, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180_000,
    env: { ...process.env, REBUILD_STORE_DIR: store },
  });
  const skills = walk(store.replace('{runid}', `${tag}-n1`)).filter((f) => f.endsWith('.json') && path.basename(f).startsWith('s_'))
    .map((f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }).filter(Boolean);
  if (r.status !== 0 && !skills.length) rows[tag] = { error: `rebuild exit ${r.status}: ${(r.stderr || '').trim().split('\n').at(-1)?.slice(0, 200)}` };
  else rows[tag] = { skills: skills.length, lines: skills.flatMap(summarise).sort() };
  if (!argv.includes('--quiet')) console.error(`[rebuild-survey] ${n}/${picked.length} ${tag}: ${rows[tag].error ?? `${rows[tag].skills} skill(s)`}`);
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.rmSync(tmpRoot, { recursive: true, force: true });
let head = '';
try { head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: code, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
fs.writeFileSync(out, JSON.stringify({ code, head, recordings: picked.length, rows }, null, 1));
console.log(`[rebuild-survey] ${picked.length} recording(s) → ${out}`);
