#!/usr/bin/env node
/**
 * provenance-census: stage 0 of the provenance design (report classes).
 *
 * WHY THIS EXISTS. Stage 1 closes four ways a replay reports a value it did
 * not observe. The largest is the TYPED exemption: a report-template value
 * made only of slots the procedure typed (`"{{v3}}"`) publishes with no page,
 * read or commit check (execution/report.ts unobservedGiven skips a typed
 * slot). Closing it withholds those values unless this run showed them after a
 * commit. Before choosing that policy we need to know, on stored data only:
 *
 *   1. How many stored report-template values are TYPED-ONLY, and how many of
 *      those a HARD slotted effect line covers. A hard line is a recorded
 *      `addedContains` line carrying the slot, on a click/press AFTER the
 *      typing, that is neither a popup item nor the control's own line. That is
 *      the evidence stage 1 promotes to "committed".
 *   2. Which of the uncovered ones are ASKED by the instruction, and whether
 *      the app was green in that round (bench/SWEEPS.md).
 *   3. Offline reclassification of the n2/n3 published values
 *      (<runid>-n2/n3-flowrun.json). For each published key: whether a live
 *      read or which template class produced it, and whether an at-risk value
 *      is the ONLY carrier of its text in the run's finalText. The report-only
 *      verifiers read flowrun summaries + values: bench/verify-*.mjs.
 *   4. Short-value echoes: reads whose target is the control a set step typed
 *      into, with a recorded value under MIN_ECHO_LEN (5). Today these are
 *      published as observed.
 *
 * Read-only. Results branches are read with `git archive`, as corpus-check
 * does; nothing is checked out. Needs dist/ built (it imports the shared
 * rules, so the census judges with the code it is about).
 *
 *   node bench/provenance-census.mjs [--apps gt,ec] [--since 36] [--no-fetch] [--out file.json] [--list]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const PUB = 'bench/results-published';
const APPS = ['rd', 'od', 'gr', 'kb', 'op', 'gt', 'vk', 'ec', 'si', 'gh'];

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const apps = opt('--apps') ? new Set(opt('--apps').split(',')) : null;
const since = Number(opt('--since') ?? 0);
const outFile = opt('--out');
const fetch = !argv.includes('--no-fetch');
const listAll = argv.includes('--list');

const dist = (p) => pathToFileURL(path.join(REPO, 'dist', p)).href;
const { askedOutputs } = await import(dist('daemon/step-verdict.js'));
const { templateMarkers, templateLiterals } = await import(dist('execution/report.js'));
const { setsSomething, MIN_ECHO_LEN } = await import(dist('execution/echo.js'));
const { popupItem } = await import(dist('execution/expect.js'));

function git(args, encoding = 'utf8') {
  const r = spawnSync('git', args, { cwd: REPO, encoding, maxBuffer: 512 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { code: r.status, out: r.stdout ?? '' };
}

/** Minimal ustar reader (corpus-check's, for the same portability reason). */
function untar(buf, destDir) {
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
    if (type === '0' || type === '\0') {
      const target = path.resolve(destDir, full);
      if (target.startsWith(path.resolve(destDir) + path.sep)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, buf.subarray(dataStart, dataStart + size));
      }
    }
    off = dataStart + size + ((512 - (size % 512)) % 512);
  }
}

function parseBranch(name) {
  const short = name.replace(/^.*?results\//, '');
  const runid = short.split('-')[0];
  const m = /^fw(rd|od|gr|kb|op|gt|vk|ec|si|gh)(\d*)$/.exec(runid);
  return m ? { ref: `refs/remotes/origin/results/${short}`, short, runid, app: m[1], num: m[2] ? Number(m[2]) : 0 } : null;
}

function branches() {
  if (fetch) {
    const r = git(['ls-remote', '--heads', 'origin', 'refs/heads/results/fw*']);
    const remote = r.out.split('\n').map((l) => l.split('\t')[1]).filter(Boolean).map((s) => s.replace(/^refs\/heads\//, ''));
    const have = new Set(git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/results/']).out.split('\n').map((s) => s.trim().replace('refs/remotes/origin/', '')));
    const missing = remote.filter((b) => !have.has(b));
    for (let i = 0; i < missing.length; i += 40) git(['fetch', '--no-tags', 'origin', ...missing.slice(i, i + 40).map((b) => `+refs/heads/${b}:refs/remotes/origin/${b}`)]);
  }
  const refs = git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/results/']).out.split('\n').map((s) => s.trim()).filter(Boolean);
  const byRunid = new Map();
  for (const e of refs.map(parseBranch).filter(Boolean).sort((a, b) => a.short.localeCompare(b.short))) byRunid.set(e.runid, e);
  return [...byRunid.values()]
    .filter((e) => (!apps || apps.has(e.app)) && e.num >= since)
    .sort((a, b) => (a.app === b.app ? a.num - b.num : APPS.indexOf(a.app) - APPS.indexOf(b.app)));
}

/** runid → { round, green } from bench/SWEEPS.md: the Green cell is the one before Notes. */
function sweepVerdicts() {
  const out = new Map();
  const text = fs.readFileSync(path.join(REPO, 'bench/SWEEPS.md'), 'utf8');
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const runid = cells.find((c) => /^fw(rd|od|gr|kb|op|gt|vk|ec|si|gh)\d+$/.test(c));
    if (!runid) continue;
    const green = /^(\*\*yes\*\*|yes\*?)$/i.test(cells[cells.length - 3] ?? '');
    out.set(runid, { round: cells[1], green });
  }
  return out;
}

function extract(e, tmp) {
  const dir = path.join(tmp, e.runid);
  const files = git(['ls-tree', '-r', '--name-only', e.ref, '--', `${PUB}/`]).out.split('\n').map((s) => s.trim()).filter(Boolean);
  const flowPath = `${PUB}/${e.runid}.json`;
  const store = `${PUB}/${e.runid}-skills/`;
  const runs = files.filter((f) => new RegExp(`^${PUB}/${e.runid}-n[23]-flowrun\\.json$`).test(f));
  const wanted = files.filter((f) => f === flowPath || f.startsWith(store)).concat(runs);
  if (!wanted.includes(flowPath) || !wanted.some((f) => f.startsWith(store))) return null;
  const ar = git(['archive', '--format=tar', e.ref, '--', ...wanted], 'buffer');
  if (ar.code !== 0) return null;
  untar(ar.out, dir);
  const skills = new Map();
  const storeDir = path.join(dir, store);
  for (const host of fs.readdirSync(storeDir)) {
    const hd = path.join(storeDir, host);
    if (!fs.statSync(hd).isDirectory()) continue;
    for (const f of fs.readdirSync(hd)) {
      if (!/^s_.*\.json$/.test(f)) continue;
      try {
        const s = JSON.parse(fs.readFileSync(path.join(hd, f), 'utf8'));
        skills.set(s.id, s);
      } catch {
        /* unreadable entry: not this census's business */
      }
    }
  }
  const flowruns = {};
  for (const f of runs) flowruns[/-(n[23])-flowrun/.exec(f)[1]] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return { flow: JSON.parse(fs.readFileSync(path.join(dir, flowPath), 'utf8')), skills, flowruns };
}

function chainOf(skill, skills) {
  if (!skill?.seq?.chain) return skill ? [skill] : [];
  const members = [...skills.values()].filter((s) => s.seq?.chain === skill.seq.chain).sort((a, b) => (a.seq?.index ?? 0) - (b.seq?.index ?? 0));
  return members.length ? members : [skill];
}

/** The chain's steps in replay order, loop bodies inline, each with its position. */
function flatSteps(chain) {
  const out = [];
  const walk = (steps) => {
    for (const s of steps ?? []) {
      out.push(s);
      if (s.body) walk(s.body);
    }
  };
  for (const m of chain) walk(m.steps);
  return out;
}

/** A control's own line: what the typing shows in the field it typed into, not a commit. */
const CONTROL_LINE = /^-?\s*(textbox|searchbox|spinbutton|combobox|listbox|option|checkbox|radio|switch|slider|menuitem\w*)\b/;
const COMMIT_TOOLS = new Set(['click', 'dblclick', 'press']);

/** The target a step acts on, as a comparable key (its best locator candidate). */
function targetKey(step) {
  const c = step.locators?.target?.[0];
  return c ? JSON.stringify({ ...c, seen: undefined }) : null;
}

function censusStep(fs_, skills) {
  const sk = skills.get(fs_.skill);
  if (!sk) return null;
  const chain = chainOf(sk, skills);
  const last = chain[chain.length - 1];
  const steps = flatSteps(chain);
  const typedAt = new Map(); // slot → first position typed
  const setTargets = new Map(); // target key → slots it typed
  steps.forEach((s, i) => {
    if (!setsSomething(s.tool)) return;
    for (const arg of [s.args?.value, s.args?.text]) {
      if (typeof arg !== 'string') continue;
      for (const m of templateMarkers(arg)) {
        if (!m.startsWith('v')) continue;
        if (!typedAt.has(m)) typedAt.set(m, i);
        const k = targetKey(s);
        if (k) setTargets.set(k, [...(setTargets.get(k) ?? []), m]);
      }
    }
  });
  const covered = (slot) =>
    steps.some(
      (s, i) =>
        i > (typedAt.get(slot) ?? Infinity) &&
        COMMIT_TOOLS.has(s.tool) &&
        (s.expect?.addedContains ?? []).some((l) => l.includes(`{{${slot}}}`) && !popupItem(l) && !CONTROL_LINE.test(l.trim())),
    );
  const reads = new Map();
  for (const s of steps) if ((s.tool === 'read' || s.tool === 'read_all') && s.label) reads.set(s.label, s);
  const params = fs_.params ?? {};
  const example = (slot) => String(chain.map((m) => m.params?.[slot]?.example).find((x) => x !== undefined) ?? '');
  const rows = [];
  for (const [key, v] of Object.entries(last.reportTemplate?.values ?? {})) {
    const asked = askedOutputs(fs_.instruction ?? '', [key]).length > 0;
    if (reads.has(key)) {
      // A live read wins. Hole 2: does it read the very control a set step typed into, with a short value?
      const r = reads.get(key);
      const own = setTargets.get(targetKey(r) ?? '\0') ?? [];
      rows.push({ key, cls: own.length ? 'read-own-control' : 'read', asked, short: own.some((s) => example(s).length < MIN_ECHO_LEN), slots: own });
      continue;
    }
    const markers = templateMarkers(String(v));
    const lits = templateLiterals(String(v));
    const vs = markers.filter((m) => m.startsWith('v'));
    const typed = vs.filter((m) => typedAt.has(m));
    let cls;
    if (!markers.length) cls = 'recorded';
    else if (!vs.length) cls = lits.length ? 'derived+literal' : 'derived';
    else if (!typed.length) cls = lits.length ? 'given+literal' : 'given-only';
    else if (lits.length) cls = 'typed+literal';
    else if (typed.length === vs.length) cls = 'typed-only';
    else cls = 'typed+given';
    const isTyped = typed.length > 0;
    const cover = isTyped ? typed.every(covered) : null;
    // A typed slot whose flow param is a reference to an earlier step's output:
    // that step published it already (observed there), so this copy is not the sole carrier.
    const fromRef = typed.length > 0 && typed.every((m) => /^\{\{\d\d-[^}]+\}\}$/.test(String(params[m] ?? '').trim()));
    rows.push({ key, cls, asked, covered: cover, fromRef, slots: typed, template: String(v).slice(0, 120) });
  }
  return rows;
}

/** Every published value of a flowrun but `except`, and each step's summary separately. */
function carriers(run, except) {
  const values = [];
  for (const s of run?.steps ?? []) for (const [k, v] of Object.entries(s.values ?? {})) if (!except.has(`${s.id}.${k}`) && typeof v === 'string') values.push(v);
  return values;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-census-'));
const verdicts = sweepVerdicts();
const report = { at: git(['rev-parse', 'HEAD']).out.trim(), runs: [], totals: {} };
const inc = (o, k, n = 1) => (o[k] = (o[k] ?? 0) + n);
try {
  for (const e of branches()) {
    const got = extract(e, tmp);
    if (!got) continue;
    const verdict = verdicts.get(e.runid) ?? { round: '?', green: null };
    const run = { runid: e.runid, app: e.app, round: verdict.round, green: verdict.green, counts: {}, atRisk: [], shortEchoes: [], published: {} };
    const atRiskKeys = new Set();
    for (const step of got.flow.steps ?? []) {
      if (!step.skill) continue;
      const rows = censusStep(step, got.skills);
      if (!rows) continue;
      for (const r of rows) {
        inc(run.counts, r.cls);
        if (r.cls.startsWith('typed')) {
          inc(run.counts, r.covered ? `${r.cls}:covered` : `${r.cls}:uncovered`);
          if (!r.covered) {
            atRiskKeys.add(`${step.id}.${r.key}`);
            run.atRisk.push({ step: step.id, key: r.key, cls: r.cls, asked: r.asked, fromRef: r.fromRef, template: r.template });
          }
        }
        if (r.cls === 'read-own-control') run.shortEchoes.push({ step: step.id, key: r.key, short: r.short, asked: r.asked });
      }
    }
    // Offline reclassification of what n2/n3 actually published.
    for (const [n, fr] of Object.entries(got.flowruns)) {
      const pub = { values: 0, atRisk: 0, atRiskSole: [] };
      const others = carriers(fr, atRiskKeys);
      for (const s of fr.steps ?? []) {
        for (const [k, v] of Object.entries(s.values ?? {})) {
          pub.values += 1;
          if (!atRiskKeys.has(`${s.id}.${k}`)) continue;
          pub.atRisk += 1;
          const risk = run.atRisk.find((a) => a.step === s.id && a.key === k);
          const sole = typeof v === 'string' && v.trim() !== '' && !others.some((o) => o.includes(v.trim()));
          if (sole) pub.atRiskSole.push({ step: s.id, key: k, value: String(v).slice(0, 80), asked: risk?.asked ?? false });
        }
      }
      run.published[n] = pub;
    }
    report.runs.push(run);
    fs.rmSync(path.join(tmp, e.runid), { recursive: true, force: true });
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Totals and the questions stage 1 asks.
const T = report.totals;
for (const r of report.runs) {
  for (const [k, n] of Object.entries(r.counts)) inc(T, k, n);
  inc(T, 'runs');
  for (const a of r.atRisk) {
    inc(T, 'uncoveredTyped');
    if (a.asked) inc(T, 'uncoveredTypedAsked');
    if (a.asked && r.green) inc(T, 'uncoveredTypedAskedGreen');
    if (a.fromRef) inc(T, 'uncoveredTypedFromRef');
  }
  for (const s of r.shortEchoes) {
    inc(T, 'readOwnControl');
    if (s.short) inc(T, 'readOwnControlShort');
  }
  for (const p of Object.values(r.published)) {
    inc(T, 'publishedValues', p.values);
    inc(T, 'publishedAtRisk', p.atRisk);
    inc(T, 'publishedAtRiskSole', p.atRiskSole.length);
    inc(T, 'publishedAtRiskSoleAsked', p.atRiskSole.filter((x) => x.asked).length);
    if (r.green) inc(T, 'publishedAtRiskSoleAskedGreen', p.atRiskSole.filter((x) => x.asked).length);
  }
}

const lines = [];
lines.push(`# provenance census at ${report.at.slice(0, 8)}: ${T.runs} runs`);
lines.push('');
lines.push('Report-template classes (last segment of each pinned chain; a key a read carries counts as a read):');
for (const k of Object.keys(T).filter((k) => /^(read|typed|given|derived|recorded)/.test(k)).sort()) lines.push(`  ${k.padEnd(28)} ${T[k]}`);
lines.push('');
lines.push(`typed values with no hard effect line: ${T.uncoveredTyped ?? 0} (asked ${T.uncoveredTypedAsked ?? 0}, asked on green runs ${T.uncoveredTypedAskedGreen ?? 0}, typed from an upstream reference ${T.uncoveredTypedFromRef ?? 0})`);
lines.push(`reads of a control the chain typed into: ${T.readOwnControl ?? 0} (recorded value under ${MIN_ECHO_LEN} chars: ${T.readOwnControlShort ?? 0})`);
lines.push(`n2/n3 published values: ${T.publishedValues ?? 0}; from uncovered typed templates: ${T.publishedAtRisk ?? 0}; the only carrier of their text: ${T.publishedAtRiskSole ?? 0} (asked ${T.publishedAtRiskSoleAsked ?? 0}, asked on green runs ${T.publishedAtRiskSoleAskedGreen ?? 0})`);
lines.push('');
lines.push('Uncovered typed values, by run (asked ones marked *):');
for (const r of report.runs) {
  if (!r.atRisk.length && !listAll) continue;
  const sole = Object.entries(r.published).flatMap(([n, p]) => p.atRiskSole.map((x) => `${n}:${x.step}.${x.key}=${JSON.stringify(x.value)}${x.asked ? '*' : ''}`));
  lines.push(`  ${r.runid} (round ${r.round}, ${r.green === null ? '?' : r.green ? 'green' : 'not green'}): ${r.atRisk.map((a) => `${a.step}.${a.key}[${a.cls}${a.fromRef ? ',ref' : ''}]${a.asked ? '*' : ''}`).join(', ')}`);
  if (sole.length) lines.push(`      sole carrier on replay: ${sole.join('; ')}`);
}
lines.push('');
lines.push('Reads of a typed control:');
for (const r of report.runs) for (const s of r.shortEchoes) lines.push(`  ${r.runid} ${s.step}.${s.key}${s.short ? ' (short)' : ''}${s.asked ? ' *asked' : ''}`);
console.log(lines.join('\n'));
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
