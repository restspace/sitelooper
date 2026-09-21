#!/usr/bin/env node
/**
 * corpus-check — a convergence metric that does not depend on luck.
 *
 * WHY THIS EXISTS. A fresh cloud sweep re-records, so every round samples a new
 * flow shape from an LLM recorder and exposes a different latent defect. With a
 * per-app clean rate near 50%, 4/4 is ~6% by luck and the number cannot tell a
 * fix from noise. The ~170 published `results/fw*` branches are a FIXED corpus:
 * every flow shape the recorder has ever produced, each with the store it was
 * recorded against and the compile log produced at the time. Compiling all of
 * them at one commit is a measurement with no sampling in it.
 *
 * What it measures, and what it does not: this is a COMPILER metric. It never
 * opens a browser, never calls a model and never runs a spec. "compiled" means
 * the compiler was willing to ship an artifact, not that the artifact passes.
 *
 * Usage:
 *   node bench/corpus-check.mjs [--apps rd,od,gr,kb,op,gt,vk] [--limit N] [--since fwrd50]
 *                               [--jobs 2] [--baseline <file>] [--out <file>]
 *                               [--at <commit>] [--no-fetch] [--compile-only]
 *                               [--quiet]
 *
 * Read-only against the repo and origin. Results branches are NEVER checked
 * out: every file is read with `git archive` into a temp dir under the scratch
 * root, and the temp dir is removed when the branch is done.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const o = {
    apps: null,
    limit: 0,
    since: 0,
    jobs: 2,
    baseline: null,
    out: null,
    at: null,
    fetch: true,
    compileOnly: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === '--apps') o.apps = new Set(next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--limit') o.limit = Number(next());
    else if (a === '--since') o.since = Number(String(next()).replace(/\D+/g, '')) || 0;
    else if (a === '--jobs') o.jobs = Math.max(1, Number(next()) || 1);
    else if (a === '--baseline') o.baseline = next();
    else if (a === '--out') o.out = next();
    else if (a === '--at') o.at = next();
    else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--compile-only') o.compileOnly = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '-h' || a === '--help') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?|^ \* ?/gm, ''));
      process.exit(0);
    } else throw new Error(`unknown flag: ${a}`);
  }
  return o;
}

// ---------------------------------------------------------------------------
// git helpers — every one of them read-only
// ---------------------------------------------------------------------------

function git(args, opts = {}) {
  const r = spawnSync('git', args, { cwd: opts.cwd ?? REPO, encoding: opts.encoding ?? 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

function gitBuf(args, opts = {}) {
  const r = spawnSync('git', args, { cwd: opts.cwd ?? REPO, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { code: r.status, out: r.stdout ?? Buffer.alloc(0) };
}

/**
 * A minimal tar reader, because the one thing that is NOT portable between this
 * Windows box and the Linux cloud box is a shell pipeline into `tar`. git
 * archive's output is plain ustar; the header fields we need are name, prefix,
 * size and typeflag, and pax/global entries are skipped by consuming their
 * payload. ~40 lines beats depending on bsdtar being on PATH.
 */
function untar(buf, destDir) {
  const written = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const head = buf.subarray(off, off + 512);
    if (head.every((b) => b === 0)) break;
    const str = (start, len) => {
      const s = head.subarray(start, start + len);
      const z = s.indexOf(0);
      return s.subarray(0, z === -1 ? s.length : z).toString('utf8');
    };
    const name = str(0, 100);
    const prefix = str(345, 155);
    const sizeOct = str(124, 12).trim();
    const size = sizeOct ? parseInt(sizeOct, 8) : 0;
    const type = String.fromCharCode(head[156]) || '0';
    const full = prefix ? `${prefix}/${name}` : name;
    const dataStart = off + 512;
    const dataEnd = dataStart + size;
    if (type === '0' || type === '\0') {
      // Reject anything that would escape the destination. These archives come
      // from our own branches, but a path check costs nothing.
      const target = path.resolve(destDir, full);
      if (target.startsWith(path.resolve(destDir) + path.sep) || target === path.resolve(destDir)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, buf.subarray(dataStart, dataEnd));
        written.push(full);
      }
    }
    off = dataEnd + ((512 - (size % 512)) % 512);
  }
  return written;
}

// ---------------------------------------------------------------------------
// enumerate
// ---------------------------------------------------------------------------

const APPS = ['rd', 'od', 'gr', 'kb', 'op', 'gt', 'vk'];

/** `results/fwrd69-hh6jhj` → { runid: 'fwrd69', app: 'rd', num: 69 }. */
function parseBranch(name) {
  const short = name.replace(/^.*?results\//, '');
  const runid = short.split('-')[0];
  const m = /^fw(rd|od|gr|kb|op|gt|vk)(\d*)$/.exec(runid);
  if (!m) return null;
  return { branch: `results/${short}`, short, runid, app: m[1], num: m[2] ? Number(m[2]) : 0 };
}

function localRefs() {
  const r = git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/results/']);
  return r.out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function enumerateBranches(opts, log) {
  const local = localRefs();
  let entries = [];
  if (!opts.fetch && local.length) {
    // --no-fetch: trust what is already here. The refs are the corpus.
    log(`using ${local.length} local origin/results ref(s); no fetch`);
    entries = local.map((r) => ({ ref: r, ...parseBranch(r) })).filter((e) => e.runid);
  } else {
    const r = git(['ls-remote', '--heads', 'origin', 'refs/heads/results/fw*']);
    if (r.code !== 0) throw new Error(`git ls-remote failed: ${r.err.trim()}`);
    const remote = r.out.split('\n').map((l) => l.split('\t')[1]).filter(Boolean).map((s) => s.replace(/^refs\/heads\//, ''));
    log(`origin has ${remote.length} results/fw* branch(es)`);
    const have = new Set(local.map((r2) => r2.replace('refs/remotes/origin/', '')));
    const missing = remote.filter((b) => !have.has(b));
    if (missing.length) {
      log(`fetching ${missing.length} missing ref(s)...`);
      // One fetch, many refspecs — not one process per branch.
      for (let i = 0; i < missing.length; i += 40) {
        const chunk = missing.slice(i, i + 40).map((b) => `+refs/heads/${b}:refs/remotes/origin/${b}`);
        git(['fetch', '--no-tags', 'origin', ...chunk]);
      }
    }
    entries = remote.map((b) => ({ ref: `refs/remotes/origin/${b}`, ...parseBranch(b) })).filter((e) => e.runid);
  }
  // A branch name may repeat a runid (a re-publish with a new suffix). Keep the
  // last one by branch name so the corpus has one row per runid.
  const byRunid = new Map();
  for (const e of entries.sort((a, b) => a.short.localeCompare(b.short))) byRunid.set(e.runid, e);
  let list = [...byRunid.values()];
  if (opts.apps) list = list.filter((e) => opts.apps.has(e.app));
  // --since is a run NUMBER and applies to every app: `--since fwrd50` keeps
  // fwrd50+, fwod50+, fwgr50+, fwkb50+. Named so the common case reads well.
  if (opts.since) list = list.filter((e) => e.num >= opts.since);
  list.sort((a, b) => (a.app === b.app ? a.num - b.num : APPS.indexOf(a.app) - APPS.indexOf(b.app)));
  if (opts.limit) list = list.slice(0, opts.limit);
  return list;
}

// ---------------------------------------------------------------------------
// extract
// ---------------------------------------------------------------------------

const PUB = 'bench/results-published';

function extract(entry, tmpRoot) {
  const dir = path.join(tmpRoot, entry.runid);
  fs.mkdirSync(dir, { recursive: true });
  const listed = git(['ls-tree', '-r', '--name-only', entry.ref, '--', `${PUB}/`]);
  if (listed.code !== 0) return { dir, missing: 'no results-published tree' };
  const files = listed.out.split('\n').map((s) => s.trim()).filter(Boolean);
  const flowPath = `${PUB}/${entry.runid}.json`;
  const storePrefix = `${PUB}/${entry.runid}-skills/`;
  const wanted = files.filter((f) => f === flowPath || f.startsWith(storePrefix));
  if (!wanted.some((f) => f === flowPath)) return { dir, missing: 'no flow' };
  if (!wanted.some((f) => f.startsWith(storePrefix))) return { dir, missing: 'no store' };
  // The "then" record and the recording's ledger, when the branch carries them.
  const thenLog = files.find((f) => f === `${PUB}/${entry.runid}-spec-spec-compile.log`)
    ?? files.find((f) => /-spec-attempt1-compile\.log$/.test(f) && f.startsWith(`${PUB}/${entry.runid}-`));
  const mutLogs = files.filter((f) => new RegExp(`^${PUB}/${entry.runid}-n\\d+-.*mutationlog\\.json$`).test(f));
  const all = [...wanted, ...(thenLog ? [thenLog] : []), ...mutLogs];
  const ar = gitBuf(['archive', '--format=tar', entry.ref, '--', ...all]);
  if (ar.code !== 0) return { dir, missing: 'git archive failed' };
  untar(ar.out, dir);
  const storeDir = path.join(dir, PUB, `${entry.runid}-skills`);
  return {
    dir,
    flow: path.join(dir, PUB, `${entry.runid}.json`),
    store: storeDir,
    thenLog: thenLog ? path.join(dir, thenLog) : null,
    mutLogs: mutLogs.map((f) => path.join(dir, f)),
  };
}

/** A store is `<store>/http_<host>_<port>/s_*.json`; the compiler is handed the root. */
function storeSkills(storeDir) {
  const out = [];
  if (!fs.existsSync(storeDir)) return out;
  for (const host of fs.readdirSync(storeDir)) {
    const hd = path.join(storeDir, host);
    if (!fs.statSync(hd).isDirectory()) continue;
    for (const f of fs.readdirSync(hd)) {
      if (!/^s_.*\.json$/.test(f)) continue;
      try {
        out.push({ file: path.join(hd, f), id: f.replace(/\.json$/, ''), skill: JSON.parse(fs.readFileSync(path.join(hd, f), 'utf8')) });
      } catch {
        /* a store entry we cannot read is not a lint hit; the compile pass will speak to it */
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// compile pass
// ---------------------------------------------------------------------------

/**
 * Exactly what `bench/spec-replay.mjs:119` runs, plus `--json` so the refusal
 * kinds come back as diagnostic CODES rather than as prose we would have to
 * re-parse. `--overwrite-spec` only ever matters on a re-run into the same tmp
 * dir; `--allow-demoted` is deliberately NOT passed, because this arm scores
 * what the compiler is willing to ship.
 */
function compileOnce(binRoot, flowFile, storeDir, outDir) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(binRoot, 'bin', 'sitelooper.js'), 'compile', flowFile, '--out', outDir, '--overwrite-spec', '--json'],
      { cwd: binRoot, env: { ...process.env, SITELOOPER_SKILLS_DIR: storeDir }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

function readJsonish(text) {
  const i = text.indexOf('{');
  if (i === -1) return null;
  try {
    return JSON.parse(text.slice(i));
  } catch {
    return null;
  }
}

function classifyCompile(r) {
  const j = readJsonish(r.out);
  const diags = Array.isArray(j?.diagnostics) ? j.diagnostics : [];
  const errorKinds = [...new Set(diags.filter((d) => d.severity === 'error').map((d) => d.code))].sort();
  const warnKinds = [...new Set(diags.filter((d) => d.severity !== 'error').map((d) => d.code))].sort();
  const blockers = Array.isArray(j?.compileBlockers) ? j.compileBlockers : [];
  if (r.code === 0) return { status: 'compiled', kinds: [], warnKinds, blockers };
  if (r.code === 2) {
    // A refusal with no typed diagnostic is still a refusal — `not compilable`
    // (no converged procedure) reaches the CLI as a blocker list, not a code.
    const kinds = errorKinds.length ? errorKinds : blockers.length ? ['no-procedure'] : ['refused'];
    return { status: 'refused', kinds, warnKinds, blockers };
  }
  return { status: 'error', kinds: errorKinds, warnKinds, blockers, exit: r.code, stderr: r.err.slice(-600) };
}

/**
 * The "then" record is prose, not JSON — it is whatever the tool printed on the
 * day. Refusal is read from the two sentences the CLI always prints when it
 * declines to write ("nothing written:", "sitelooper: refused:",
 * "not compilable:"); the kinds are matched on the `what` templates in
 * src/spec/ir.ts and src/spec/emit.ts and are BEST EFFORT — the fixed /
 * newly-refusing verdict depends only on refused-vs-compiled, which is exact.
 */
const THEN_PATTERNS = [
  [/is pinned to the demoted skill/, 'demoted-pin'],
  [/nothing has ever published|this flow has no step/, 'unsourced-ref'],
  [/has no converged procedure|not compilable/, 'no-procedure'],
  [/is not in the skill store/, 'missing-skill'],
  [/binds none of its slots|cannot bind from the instruction/, 'unbound-pin'],
  [/and nothing can fill|has no locator left for its/, 'unfilled-slot'],
  [/enforces its url precondition without/, 'unmeasured-precondition'],
  [/recipe snapshot|learned variant travelling as data/, 'recipe-snapshot'],
  [/was written by a newer sitelooper|newer sitelooper/, 'future-contract'],
];

function classifyThen(file) {
  if (!file || !fs.existsSync(file)) return { status: 'unknown', kinds: [] };
  const text = fs.readFileSync(file, 'utf8');
  const refused = /nothing written:|sitelooper: refused:|not compilable:/.test(text);
  const errorLines = text.split('\n').filter((l) => /^error\b/.test(l.trim()));
  const kinds = new Set();
  for (const line of errorLines) for (const [re, code] of THEN_PATTERNS) if (re.test(line)) kinds.add(code);
  if (refused && !kinds.size) kinds.add('refused');
  return { status: refused ? 'refused' : 'compiled', kinds: [...kinds].sort() };
}

// ---------------------------------------------------------------------------
// lints
// ---------------------------------------------------------------------------

const LINT_NAMES = ['gate-before-goto', 'frozen-literal', 'own-output-slot', 'demoted-pin', 'dead-read', 'frozen-locator-id'];

/**
 * The lints are the STATIC signatures of runtime defects this project has
 * already diagnosed. They import the real pure functions from `dist/` rather
 * than re-implementing the judgement, so a lint cannot drift away from the
 * rule the runner actually applies.
 */
async function loadLintFns(distRoot) {
  const load = async (rel, name) => {
    try {
      const m = await import(pathToFileURL(path.join(distRoot, rel)).href);
      return typeof m[name] === 'function' ? m[name] : null;
    } catch {
      return null;
    }
  };
  return {
    segmentGate: await load('execution/gates.js', 'segmentGate'),
    unfreezeExpectations: await load('skills/compile.js', 'unfreezeExpectations'),
  };
}

/**
 * gate-before-goto — the fwrd68 shape. `segmentGate` puts the gate at the first
 * page-dependent step. The defect is that step being a `wait_for` the
 * classifier wrongly counted as page-dependent — a look at nothing — so the
 * gate asked the page the procedure was LEAVING, ahead of the `goto` that
 * chooses the page it actually wants.
 *
 * Narrowed to that shape on purpose. An INTERACTION ahead of a later goto —
 * click something here, then navigate — is the normal procedure and the gate
 * belongs on it; flagging it counted 152 ordinary skills at HEAD as defects.
 * Only a gated `wait_for` ahead of the FIRST navigation is the signature. At
 * commits before the root-chain fix (6d37ab0) this lights fwrd51 s_b1a0cd,
 * fwrd65 s_615743 and fwrd68 s_bfc33c; at HEAD anything still lit is a
 * `wait_for` shape that fix did not reach, which is exactly what to look at.
 */
function lintGateBeforeGoto(fns, skills) {
  if (!fns.segmentGate) return null;
  const hits = [];
  for (const { id, skill } of skills) {
    const steps = Array.isArray(skill.steps) ? skill.steps : [];
    if (!steps.length) continue;
    let gate;
    try {
      gate = fns.segmentGate(steps);
    } catch {
      continue;
    }
    if (!gate || gate.at <= 0 || gate.afterNavigation) continue;
    const gated = steps[gate.at - 1];
    if (!gated || gated.tool !== 'wait_for') continue;
    const laterNav = steps.slice(gate.at).findIndex((s) => s && (s.tool === 'goto' || s.tool === 'back'));
    if (laterNav !== -1) hits.push({ skill: id, gateAt: gate.at, gotoAt: gate.at + laterNav + 1, tool: steps[gate.at + laterNav].tool, target: gated.args?.target ?? null });
  }
  return hits;
}

/**
 * frozen-literal — expectation lines that freeze a value only the recording run
 * could produce. Runs the compiler's own `unfreezeExpectations` over a COPY of
 * each skill's steps and counts what it would rewrite.
 *
 * The `published` list the masking rule needs, rebuilt the way compile builds
 * it: from THIS chain's labelled read steps, each label looked up in the
 * chain's `reportTemplate.values`. That is `publishedReadValues(kept,
 * reportValues)` from the stored side (details in the function).
 *
 * It is NOT the flow's `recorded` block. That was tried first and is a
 * superset — it carries every value any step reported, including the login
 * username and a project id — so on fwkb23, a store recorded with the rule
 * live, it masked `KB Dashboard for admin` and `#1`, lines the real rule had
 * left alone, and reported a fix that worked as a fix that had not.
 */
function chainPublished(skill, skills) {
  // Compile's `publishedReadValues` (src/skills/compile.ts:1525) takes every
  // read that is a `(read-back)` or that `readLabel` can name, and publishes
  // its `step.result` — which a STORED skill no longer carries. What survives:
  // the read's `label` (kept on the step when it has a locator, compile.ts:334)
  // and the report's value under that label, which is what `readLabel`
  // matched the result against. So: the labels of every read step across the
  // chain — a recording is split into segments, the values sit on the LAST
  // member (fwrd69 s_0d8432, fwod61 s_eff259) while the reads sit on any —
  // looked up in every member's `reportTemplate.values`, literal ones only.
  //
  // NOT the chain's whole `reportTemplate.values`. That was the previous
  // version and it is a superset: the agent reports values it never read
  // (fwgr53 `fresh_load_time_picker: "Last 6 hours"`, no read carries that
  // label), and on stores recorded with the rule live it masked lines the
  // real rule had left — 4 hits on fwrd69, 3 on fwrd68 — reading a fix that
  // held as one that had not. A read-back (`(read-back)` target) publishes a
  // value the procedure typed, which is a slot by then and never literal, so
  // it adds nothing here; a labelled read with no locator lost its label in
  // the store and is the one shape this cannot see.
  const chainId = skill.seq?.chain ?? skill.id;
  const members = skills.map((x) => x.skill).filter((s) => (s.seq?.chain ?? s.id) === chainId);
  const labels = new Set();
  for (const s of members) for (const st of s.steps ?? []) {
    if ((st?.tool === 'read' || st?.tool === 'read_all') && st.label) labels.add(st.label);
  }
  const out = new Set();
  for (const s of members) {
    for (const [k, v] of Object.entries(s.reportTemplate?.values ?? {})) {
      if (!labels.has(k)) continue;
      const str = String(v ?? '').trim();
      if (str && !str.includes('{{') && !str.includes('\n')) out.add(str);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

function lintFrozenLiteral(fns, skills) {
  if (!fns.unfreezeExpectations) return null;
  const hits = [];
  const lines = (steps) => steps.map((s) => s.expect?.addedContains ?? []);
  for (const { id, skill } of skills) {
    const steps = Array.isArray(skill.steps) ? skill.steps : [];
    if (!steps.length) continue;
    const copy = JSON.parse(JSON.stringify(steps));
    const orig = lines(copy);
    const before = orig.reduce((n, l) => n + l.length, 0);
    if (!before) continue;
    try {
      fns.unfreezeExpectations(copy, chainPublished(skill, skills), []);
    } catch {
      continue;
    }
    // Diff the lines, do not read the notes. `unfreezeWatchedNames` (arm 1)
    // rewrites in place BEFORE the note loop takes its "before" snapshot, so a
    // skill changed by arm 1 alone — fwod60 s_292da2, `£ 267.00` → `{{*}}` —
    // pushes no note and was invisible to a note-based count.
    const now = lines(copy);
    const changed = [];
    orig.forEach((l, i) => {
      if (JSON.stringify(l) !== JSON.stringify(now[i])) changed.push(i + 1);
    });
    if (changed.length) hits.push({ skill: id, steps: changed, linesBefore: before, linesAfter: now.reduce((n, l) => n + l.length, 0) });
  }
  return hits;
}

/**
 * own-output-slot — the fwod60/fwod61 shape: a KNOWN slot whose binding names
 * the instruction that compiled the skill ITSELF (`output:i<N>` / `url:i<N>`
 * with N the pinning step's own index). Such a value was read by that
 * instruction from the page it was already on — an output, never an input —
 * and the daemon's own filter (6d37ab0) now keeps it out of the compile.
 *
 * Judged on the binding's provenance directly, not through `remapParams`.
 * That was tried first and over-counted: given flow step ids but no
 * instruction-index map, `remapParams` reports every `output:i<earlier>`
 * binding as unbound too, and on fwrd69 — recorded with the filter live — it
 * flagged 16 slots, all of them `i1`/`i5` values the daemon resolves through
 * its ledger without difficulty. A fix that had held read as one that had not.
 *
 * The instruction index is the step's 1-based position in the flow, which is
 * what the ledger keys `i<N>` by (fwod61: i1=01-signin, i2=02-create,
 * i3=03-create). A pinned chain gets it from the pinning step. An UNPINNED
 * skill — the defect's defining shape is a step without a pin, and both known
 * positives are unpinned — gets it from `provenance.instruction`: the text the
 * skill was recorded against is the flow step's `instruction` with its
 * `{{…}}` references rendered (fwod61 s_94a113: `click {{02-create.button}}`
 * → `click New`), so each flow instruction becomes a pattern with `.*?` at
 * every reference and the skill is placed at the first step it matches.
 *
 * Calibration note: fwod60 s_efdd23 was listed as a second positive from the
 * n2 replay's view, where it was tried as a candidate for 02-create. Its
 * provenance instruction is 03-create's, so its `output:i2` binding is an
 * EARLIER step's value — legitimate — and the lint correctly does not flag it.
 * The daemon-side defect there is selection offering a step-3 recording to
 * step 2, which is not this lint's signature.
 */
function lintOwnOutputSlot(fns, flow, byId, skills) {
  const hits = [];
  const index = new Map();
  (flow.steps ?? []).forEach((step, i) => {
    const pinned = step.skill ? byId.get(step.skill) : null;
    if (!pinned) return;
    for (const member of chainOf(pinned, skills)) if (!index.has(member.id)) index.set(member.id, { step: step.id, i: i + 1 });
  });
  const patterns = (flow.steps ?? []).map((step, i) => {
    const text = String(step.instruction ?? '').trim();
    if (!text) return null;
    const src = text.split(/\{\{[^}]*\}\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*?');
    return { step: step.id, i: i + 1, re: new RegExp(`^${src}$`) };
  });
  const byInstruction = (skill) => {
    const text = String(skill.provenance?.instruction ?? '').trim();
    if (!text) return null;
    for (const p of patterns) if (p && p.re.test(text)) return { step: p.step, i: p.i, via: 'instruction' };
    return null;
  };
  for (const { id, skill } of skills) {
    const own = index.get(skill.id ?? id) ?? byInstruction(skill);
    if (!own) continue;
    const bad = [];
    for (const [name, p] of Object.entries(skill.params ?? {})) {
      if (!p || p.known !== true) continue;
      const m = /^(output|url):i(\d+):/.exec(String(p.binding ?? ''));
      if (m && Number(m[2]) === own.i) bad.push({ slot: name, binding: p.binding, usedIn: p.usedIn ?? [] });
    }
    if (bad.length) hits.push({ skill: skill.id ?? id, pinnedBy: own.step, ownIndex: own.i, unbound: bad });
  }
  return hits;
}

/**
 * `chainOf` from src/spec/ir.ts:212, over a store read off a branch: a pin is a
 * HEAD, and what compiles is every member of its `seq.chain` in index order.
 * The demoted-pin refusal names a MEMBER, so a lint that only looks at the
 * pinned id sees nothing — fwrd69 pins s_cd0eb5 and the demoted skill is
 * s_5d8ea4, three rungs down the same chain.
 */
function chainOf(skill, skills) {
  if (!skill?.seq?.chain) return skill ? [skill] : [];
  const members = skills
    .map((s) => s.skill)
    .filter((s) => s.seq?.chain === skill.seq.chain)
    .sort((a, b) => (a.seq?.index ?? 0) - (b.seq?.index ?? 0));
  return members.length ? members : [skill];
}

/** demoted-pin — a flow step whose compiled chain contains a demoted member. */
function lintDemotedPin(flow, byId, skills) {
  const hits = [];
  for (const step of flow.steps ?? []) {
    if (!step.skill) continue;
    const pinned = byId.get(step.skill);
    if (!pinned) continue;
    for (const member of chainOf(pinned, skills)) {
      if (member.status === 'demoted') hits.push({ step: step.id, pin: step.skill, skill: member.id });
    }
  }
  return hits;
}

/**
 * dead-read — a synthesized read that never resolved (`unproven`) and has no
 * locator left to try. It publishes nothing, so every later reference to its
 * output is unsourced (fwkb20 s_38957a).
 */
function lintDeadRead(skills) {
  const hits = [];
  for (const { id, skill } of skills) {
    (skill.steps ?? []).forEach((s, i) => {
      if (!s || (s.tool !== 'read' && s.tool !== 'read_all') || s.unproven !== true) return;
      if (s.args?.what === 'url') return; // a url read needs no locator
      const chains = Object.values(s.locators ?? {});
      const empty = !chains.length || chains.every((c) => !Array.isArray(c) || c.length === 0);
      if (empty) hits.push({ skill: id, step: i + 1, label: s.label ?? null });
    });
  }
  return hits;
}

/**
 * frozen-locator-id — the fwrd69 shape, and the fourth carrier of the
 * frozen-literal class: a locator RUNG that embeds an identifier the recording
 * run minted. `[data-testid="part-row-p18"] button` names part p18, which
 * exists only in the recording; the flow never mentions it. Contrast the same
 * skill's `v7 {example:"t15", binding:"url:i1:h1"}` — the ticket id WAS slotted,
 * because it appeared in a url path. A part has no url of its own, so nothing
 * ever offered `p18` a binding and the recorder's enrichment froze it raw.
 *
 * PROVENANCE-KEYED, never shape-keyed: a token is only a minted id if this
 * run's own record says it minted it. Two sources, in order:
 *   1. the recording's mutation log — `id` / `after.id` of every entry. This is
 *      the ledger of what the run created and it is unambiguous.
 *   2. fallback, where no mutation log was published (grafana and kanboard
 *      branches carry none): values this run demonstrably minted and which the
 *      store itself points at — the `example` of every param bound `url:…`
 *      (a path segment the run's own navigation produced) and every `url.*`
 *      value in the flow's `recorded` block.
 * The fallback is strictly weaker: it sees ids that reached a URL and misses
 * ids that did not, which is exactly the class `p18` belongs to. Which source
 * was used is reported per branch so the number is never read as more than it
 * is.
 *
 * A rung that spells a slot (`{{vN}}`) is not frozen — that is the fix, not the
 * defect. Rung 0 is the PRIMARY: if it is frozen the step locates by the
 * recording's record on every replay and the skill will demote. A later rung is
 * an enrichment and a latent hazard: it only bites when the primary misses.
 */
function mintedIds(mutLogFiles, flow, skills) {
  const ids = new Set();
  let source = null;
  for (const f of mutLogFiles) {
    try {
      const entries = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const e of Array.isArray(entries) ? entries : []) {
        for (const v of [e?.id, e?.after?.id, e?.before?.id]) if (typeof v === 'string' && v.length >= 2) ids.add(v);
      }
    } catch {
      /* an unreadable log contributes nothing */
    }
  }
  if (ids.size) source = 'mutationlog';
  else {
    for (const { skill } of skills) {
      for (const p of Object.values(skill.params ?? {})) {
        if (typeof p?.binding === 'string' && p.binding.startsWith('url:') && typeof p.example === 'string' && p.example.length >= 2) ids.add(p.example);
      }
    }
    for (const step of flow.steps ?? []) {
      for (const [k, v] of Object.entries(step.recorded ?? {})) {
        if (k.startsWith('url.') && typeof v === 'string' && v.length >= 2) ids.add(v);
      }
    }
    if (ids.size) source = 'url-binding-fallback';
  }
  return { ids: [...ids], source };
}

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;

function lintFrozenLocatorId(skills, minted) {
  const hits = [];
  if (!minted.ids.length) return hits;
  // Whole-token match: `p18` inside `part-row-p18` counts, inside `p180` does
  // not. Without the boundary a two-character id would light up everywhere.
  const res = minted.ids.map((id) => ({ id, re: new RegExp(`(^|[^A-Za-z0-9])${id.replace(ESCAPE_RE, '\\$&')}([^A-Za-z0-9]|$)`) }));
  for (const { id, skill } of skills) {
    (skill.steps ?? []).forEach((s, si) => {
      for (const [slot, chain] of Object.entries(s?.locators ?? {})) {
        (Array.isArray(chain) ? chain : []).forEach((rung, ri) => {
          if (!rung || (rung.kind !== 'css' && rung.kind !== 'testid' && rung.kind !== 'id')) return;
          const text = String(rung.selector ?? rung.value ?? '');
          if (!text || text.includes('{{')) return; // a slotted rung is the fix
          for (const { id: tok, re } of res) {
            if (!re.test(text)) continue;
            hits.push({ skill: id, step: si + 1, slot, rung: ri, primary: ri === 0, kind: rung.kind, token: tok, text: text.slice(0, 120) });
            break;
          }
        });
      }
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// per-branch work
// ---------------------------------------------------------------------------

async function runBranch(entry, ctx) {
  const row = { runid: entry.runid, app: entry.app, branch: entry.branch };
  let ex;
  try {
    ex = extract(entry, ctx.tmpRoot);
  } catch (e) {
    return { ...row, status: 'incomplete', reason: `extract failed: ${String(e).slice(0, 200)}` };
  }
  try {
    if (ex.missing) return { ...row, status: 'incomplete', reason: ex.missing };
    const flow = JSON.parse(fs.readFileSync(ex.flow, 'utf8'));
    const skills = storeSkills(ex.store);
    const byId = new Map(skills.map((s) => [s.skill.id ?? s.id, s.skill]));
    row.steps = (flow.steps ?? []).length;
    row.skills = skills.length;

    // --- compile ---
    const outDir = path.join(ex.dir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const res = await compileOnce(ctx.binRoot, ex.flow, ex.store, outDir);
    const now = classifyCompile(res);
    row.status = now.status;
    row.kinds = now.kinds;
    row.warnKinds = now.warnKinds;
    if (now.blockers?.length) row.blockers = now.blockers;
    if (now.stderr) row.stderr = now.stderr;

    // --- then ---
    const then = classifyThen(ex.thenLog);
    row.then = then.status;
    row.thenKinds = then.kinds;
    row.movement =
      then.status === 'unknown' ? 'no-record'
        : then.status === 'refused' && now.status === 'compiled' ? 'fixed'
          : then.status === 'refused' && now.status !== 'compiled' ? 'still-refusing'
            : then.status === 'compiled' && now.status !== 'compiled' ? 'newly-refusing'
              : 'unchanged-ok';

    // --- lints ---
    if (!ctx.compileOnly) {
      const minted = mintedIds(ex.mutLogs, flow, skills);
      row.mintedSource = minted.source;
      const lints = {
        'gate-before-goto': lintGateBeforeGoto(ctx.fns, skills),
        'frozen-literal': lintFrozenLiteral(ctx.fns, skills),
        'own-output-slot': lintOwnOutputSlot(ctx.fns, flow, byId, skills),
        'demoted-pin': lintDemotedPin(flow, byId, skills),
        'dead-read': lintDeadRead(skills),
        'frozen-locator-id': lintFrozenLocatorId(skills, minted),
      };
      row.lints = {};
      for (const [k, v] of Object.entries(lints)) row.lints[k] = v === null ? 'n/a' : v;
    }
    return row;
  } catch (e) {
    return { ...row, status: 'error', reason: String(e?.stack ?? e).slice(0, 400) };
  } finally {
    try {
      fs.rmSync(ex.dir, { recursive: true, force: true });
    } catch {
      /* a temp dir we cannot remove is not worth failing a corpus run over */
    }
  }
}

async function pool(items, jobs, fn, onDone) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(jobs, items.length) }, async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
      done += 1;
      onDone?.(out[i], done, items.length);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// worktree for --at
// ---------------------------------------------------------------------------

function addWorktree(commit, dir, log) {
  log(`preparing worktree for ${commit} at ${dir}`);
  const r = git(['worktree', 'add', '--detach', dir, commit]);
  if (r.code !== 0) throw new Error(`git worktree add failed: ${r.err.trim()}`);
  // `npm ci` is the honest thing, but it is also minutes per commit on this
  // box and these commits do not move dependencies. Reuse the checkout's
  // node_modules by junction/symlink; fall back to `npm ci` if that fails.
  const nm = path.join(dir, 'node_modules');
  let linked = false;
  try {
    fs.symlinkSync(path.join(REPO, 'node_modules'), nm, 'junction');
    linked = true;
  } catch {
    linked = false;
  }
  if (!linked) {
    log('  node_modules link failed; running npm ci (slow)');
    const ci = spawnSync('npm', ['ci'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' });
    if (ci.status !== 0) throw new Error(`npm ci failed in worktree: ${(ci.stderr ?? '').slice(-400)}`);
  }
  log('  building...');
  // Not `npm run build`: that resolves `tsc` through PATH via the junctioned
  // node_modules, which on Windows works for the first worktree of a run and
  // then reports `'tsc' is not recognized` for every later one. Invoke the
  // checkout's own compiler by absolute path with the current node binary, so
  // nothing depends on PATH or on what the junction resolves to. This is what
  // the `build` script does (`tsc -p tsconfig.json && node scripts/copy-…`),
  // spelled out; the copy step is skipped where the commit predates it.
  const tsc = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
  const b = spawnSync(process.execPath, [tsc, '-p', path.join(dir, 'tsconfig.json')], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (b.status !== 0) throw new Error(`tsc failed in worktree: ${(b.stderr ?? b.stdout ?? '').slice(-600)}`);
  const copy = path.join(dir, 'scripts', 'copy-execution-source.mjs');
  if (fs.existsSync(copy)) {
    const c = spawnSync(process.execPath, [copy], { cwd: dir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (c.status !== 0) throw new Error(`copy-execution-source failed in worktree: ${(c.stderr ?? c.stdout ?? '').slice(-600)}`);
  }
  return dir;
}

/**
 * The worktree's node_modules is a JUNCTION to the checkout's own. On Windows
 * `git worktree remove --force` FOLLOWS a junction and deletes what it points
 * at: on 2026-09-17 the first `--at` iteration of a retrospective emptied
 * C:\dev\sitelooper\node_modules this way, and every later iteration then
 * failed with `'tsc' is not recognized` — which read as a PATH problem for
 * four investigations before anyone looked at the directory.
 *
 * So the link is unlinked FIRST, with `rmdirSync` — the call that removes a
 * directory link and never its contents — and the worktree is handed to git
 * only once the link is provably gone and the real node_modules is provably
 * the same size it was. Every other outcome refuses and leaves the worktree
 * for a human: a stale worktree costs a `git worktree prune`; a deleted
 * node_modules costs an `npm ci` and an afternoon.
 */
function removeWorktree(dir, log) {
  const nm = path.join(dir, 'node_modules');
  const real = path.join(REPO, 'node_modules');
  const count = () => (fs.existsSync(real) ? fs.readdirSync(real).length : -1);
  const before = count();
  let st = null;
  try {
    st = fs.lstatSync(nm);
  } catch {
    st = null;
  }
  if (st) {
    if (!st.isSymbolicLink()) {
      log(`  refusing to remove worktree ${dir}: its node_modules is a real directory, not the link this tool creates — remove by hand`);
      return;
    }
    try {
      fs.rmdirSync(nm);
    } catch (e) {
      log(`  refusing to remove worktree ${dir}: could not unlink its node_modules junction (${e.message}) — remove by hand`);
      return;
    }
  }
  if (fs.existsSync(nm)) {
    log(`  refusing to remove worktree ${dir}: node_modules link still present after unlink — remove by hand`);
    return;
  }
  const after = count();
  if (after !== before) {
    log(`  ABORT: the checkout's node_modules changed while unlinking (${before} -> ${after} entries); leaving ${dir} untouched`);
    return;
  }
  const r = git(['worktree', 'remove', '--force', dir]);
  if (r.code !== 0) log(`  warning: could not remove worktree ${dir}: ${r.err.trim()}`);
}

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

function tally(rows, known) {
  const t = {
    branches: rows.length,
    compiled: 0,
    refused: 0,
    error: 0,
    incomplete: 0,
    known: 0,
    byKind: {},
    byApp: {},
    movement: { fixed: 0, 'still-refusing': 0, 'newly-refusing': 0, 'unchanged-ok': 0, 'no-record': 0 },
    lints: Object.fromEntries(LINT_NAMES.map((n) => [n, { branches: 0, hits: 0, primary: 0, na: 0 }])),
  };
  for (const r of rows) {
    const app = r.app ?? '??';
    t.byApp[app] ??= { branches: 0, compiled: 0, refused: 0, error: 0, incomplete: 0, known: 0 };
    t.byApp[app].branches += 1;
    const annotated = Boolean(known[r.runid]);
    if (annotated) { t.known += 1; t.byApp[app].known += 1; }
    if (r.status === 'compiled') { t.compiled += 1; t.byApp[app].compiled += 1; }
    else if (r.status === 'refused') { t.refused += 1; t.byApp[app].refused += 1; }
    else if (r.status === 'incomplete') { t.incomplete += 1; t.byApp[app].incomplete += 1; }
    else { t.error += 1; t.byApp[app].error += 1; }
    for (const k of r.kinds ?? []) t.byKind[k] = (t.byKind[k] ?? 0) + 1;
    if (r.movement) t.movement[r.movement] = (t.movement[r.movement] ?? 0) + 1;
    for (const n of LINT_NAMES) {
      const v = r.lints?.[n];
      if (v === 'n/a') { t.lints[n].na += 1; continue; }
      if (Array.isArray(v) && v.length) {
        t.lints[n].branches += 1;
        t.lints[n].hits += v.length;
        // frozen-locator-id is the only lint with two severities: a frozen
        // PRIMARY rung locates by the recording's record on every replay, a
        // frozen enrichment rung only bites when the primary misses.
        t.lints[n].primary += v.filter((h) => h?.primary).length;
      }
    }
  }
  // The compile RATE is over branches the corpus can actually speak about:
  // incomplete branches carry no flow, and a known-unfixable one is refusing
  // for a reason nobody intends to fix.
  const scorable = rows.filter((r) => r.status !== 'incomplete' && !known[r.runid]);
  t.scorable = scorable.length;
  t.scorableCompiled = scorable.filter((r) => r.status === 'compiled').length;
  t.rate = t.scorable ? t.scorableCompiled / t.scorable : 0;
  return t;
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function summarize(report, known) {
  const { rows, commit } = report;
  const t = tally(rows, known);
  const L = [];
  L.push(`# corpus-check @ ${commit}`);
  L.push('');
  L.push(`${t.branches} branch(es); ${t.incomplete} incomplete (no flow or no store); ${t.known} known-unfixable, reported but not scored.`);
  L.push('');
  L.push(`**compile rate ${pct(t.rate)}** (${t.scorableCompiled}/${t.scorable} scorable) — compiled ${t.compiled}, refused ${t.refused}, crashed ${t.error}.`);
  L.push('');
  L.push('## refusal kinds');
  L.push('');
  const kinds = Object.entries(t.byKind).sort((a, b) => b[1] - a[1]);
  if (!kinds.length) L.push('_none_');
  else {
    L.push('| kind | branches |');
    L.push('| --- | ---: |');
    for (const [k, n] of kinds) L.push(`| ${k} | ${n} |`);
  }
  L.push('');
  L.push('## by app');
  L.push('');
  L.push('| app | branches | compiled | refused | crashed | incomplete | known | rate |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const app of APPS) {
    const a = t.byApp[app];
    if (!a) continue;
    const scorable = a.branches - a.incomplete - a.known;
    L.push(`| ${app} | ${a.branches} | ${a.compiled} | ${a.refused} | ${a.error} | ${a.incomplete} | ${a.known} | ${scorable ? pct(a.compiled / scorable) : 'n/a'} |`);
  }
  L.push('');
  L.push('## movement against the branch\'s own compile log');
  L.push('');
  L.push('| verdict | branches |');
  L.push('| --- | ---: |');
  for (const [k, n] of Object.entries(t.movement)) L.push(`| ${k} | ${n} |`);
  L.push('');
  L.push('## lints');
  L.push('');
  L.push('| lint | branches hit | total hits | of which primary | n/a |');
  L.push('| --- | ---: | ---: | ---: | ---: |');
  for (const n of LINT_NAMES) {
    const l = t.lints[n];
    L.push(`| ${n} | ${l.branches} | ${l.hits} | ${n === 'frozen-locator-id' ? l.primary : '—'} | ${l.na} |`);
  }
  const sources = {};
  for (const r of rows) if (r.mintedSource) sources[r.mintedSource] = (sources[r.mintedSource] ?? 0) + 1;
  if (Object.keys(sources).length) {
    L.push('');
    L.push(`frozen-locator-id provenance: ${Object.entries(sources).map(([k, v]) => `${k} ${v}`).join(', ')}, none ${rows.filter((r) => r.lints && !r.mintedSource).length}.`);
  }
  const regressions = rows.filter((r) => r.movement === 'newly-refusing');
  const fixed = rows.filter((r) => r.movement === 'fixed');
  L.push('');
  L.push(`## newly-refusing (${regressions.length}) — a branch that compiled then and does not now`);
  L.push('');
  if (!regressions.length) L.push('_none_');
  else {
    L.push('| runid | kinds now |');
    L.push('| --- | --- |');
    for (const r of regressions) L.push(`| ${r.runid} | ${(r.kinds ?? []).join(', ') || r.status} |`);
  }
  L.push('');
  L.push(`## fixed (${fixed.length}) — refused then, compiles now`);
  L.push('');
  if (!fixed.length) L.push('_none_');
  else {
    L.push('| runid | kinds then |');
    L.push('| --- | --- |');
    for (const r of fixed) L.push(`| ${r.runid} | ${(r.thenKinds ?? []).join(', ') || 'refused'} |`);
  }
  const annotated = rows.filter((r) => known[r.runid]);
  if (annotated.length) {
    L.push('');
    L.push('## known-unfixable (not scored)');
    L.push('');
    L.push('| runid | status now | reason |');
    L.push('| --- | --- | --- |');
    for (const r of annotated) L.push(`| ${r.runid} | ${r.status} | ${known[r.runid].reason} |`);
  }
  return { text: L.join('\n'), tally: t };
}

/** The gate: a regression against the baseline, or any lint total that rose. */
function gateAgainstBaseline(report, baseline, known) {
  const failures = [];
  const baseRows = new Map((baseline.rows ?? []).map((r) => [r.runid, r]));
  for (const r of report.rows) {
    const b = baseRows.get(r.runid);
    if (!b) continue;
    if (b.status === 'compiled' && r.status !== 'compiled' && !known[r.runid]) {
      failures.push(`${r.runid}: compiled in baseline, ${r.status} now (${(r.kinds ?? []).join(', ')})`);
    }
  }
  const nowT = tally(report.rows, known);
  const baseT = tally(baseline.rows ?? [], known);
  for (const n of LINT_NAMES) {
    if (nowT.lints[n].hits > baseT.lints[n].hits) {
      failures.push(`lint ${n}: ${baseT.lints[n].hits} → ${nowT.lints[n].hits}`);
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const log = (m) => { if (!opts.quiet) process.stderr.write(`[corpus] ${m}\n`); };

  const knownFile = path.join(HERE, 'corpus-known.json');
  const known = fs.existsSync(knownFile) ? JSON.parse(fs.readFileSync(knownFile, 'utf8')) : {};

  const branches = enumerateBranches(opts, log);
  log(`${branches.length} branch(es) selected`);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-'));
  let worktree = null;
  let binRoot = REPO;
  let distRoot = path.join(REPO, 'dist');
  let commit = git(['rev-parse', '--short', 'HEAD']).out.trim();
  let compileOnly = opts.compileOnly;

  try {
    if (opts.at) {
      commit = git(['rev-parse', '--short', opts.at]).out.trim() || opts.at;
      worktree = path.join(tmpRoot, `wt-${commit}`);
      addWorktree(opts.at, worktree, log);
      binRoot = worktree;
      distRoot = path.join(worktree, 'dist');
    }
    const fns = await loadLintFns(distRoot);
    if (!compileOnly && !fns.segmentGate && !fns.unfreezeExpectations) {
      log('no lint functions available at this commit — compile-only');
      compileOnly = true;
    }
    const ctx = { tmpRoot, binRoot, fns, compileOnly };

    const t0 = Date.now();
    const rows = await pool(branches, opts.jobs, (e) => runBranch(e, ctx), (r, done, total) => {
      log(`${String(done).padStart(3)}/${total} ${r.runid.padEnd(8)} ${r.status}${r.kinds?.length ? ` (${r.kinds.join(',')})` : ''}`);
    });
    const report = {
      tool: 'corpus-check',
      version: 1,
      commit,
      at: opts.at ?? null,
      ranAt: new Date().toISOString(),
      compileOnly,
      jobs: opts.jobs,
      wallMs: Date.now() - t0,
      rows,
    };

    const { text } = summarize(report, known);
    console.log(text);

    if (opts.out) {
      fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
      fs.writeFileSync(path.resolve(opts.out), `${JSON.stringify(report, null, 2)}\n`);
      log(`wrote ${opts.out}`);
    }

    if (opts.baseline) {
      const baseline = JSON.parse(fs.readFileSync(path.resolve(opts.baseline), 'utf8'));
      const failures = gateAgainstBaseline(report, baseline, known);
      console.log('');
      console.log(`## gate vs ${path.basename(opts.baseline)}`);
      console.log('');
      if (!failures.length) console.log('PASS — nothing newly refusing, no lint total rose.');
      else {
        console.log('FAIL');
        for (const f of failures) console.log(`- ${f}`);
        process.exitCode = 1;
      }
    }
  } finally {
    if (worktree) removeWorktree(worktree, log);
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

main().catch((e) => {
  console.error(`corpus-check: ${e?.stack ?? e}`);
  process.exit(1);
});
