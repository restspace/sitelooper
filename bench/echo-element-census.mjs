#!/usr/bin/env node
/**
 * echo-element-census: sizing for round 61's element-first echo gate (fwec13).
 *
 * THE RULE BEING SIZED. A read whose element is a control the step SET (a
 * fill/type/select/check, or an option picked into its owning control), with
 * no commit between the set and the read, is an echo whatever its text says —
 * "12,500" read back from the Amount input typed with 12500, "2018-01-16" read
 * from a date input the step typed into. Today the text rule decides first
 * (echoKey equal to something the segment set), so a reformatted or defaulted
 * value is published as observed; and the ledger is per SEGMENT, so a read of a
 * control an earlier segment of the chain set is never judged at all.
 *
 * WHAT THIS COUNTS, on stored data only (no browser): every value the n2/n3
 * flow runs published from a labelled read (the report keeps no echo), whose
 * read's recorded locator names the same control as an earlier value-setting
 * step of the same chain — and, of those, the ones with no commit between the
 * set and the read, which the rule would newly withhold. A commit is judged
 * statically, as the runtime judges it: a navigation step between (goto,
 * back), a route change between the set's recorded page and a later step's
 * (origin, path and hash path — a rewritten query string is not one), or a
 * click/press whose recorded effect shows the set's value in a line that is
 * not a control's or a popup item's. Steps a flow run RECOVERED are skipped:
 * their values came from the model, not from the replay rule.
 *
 * Same control, statically: one of the read's recorded candidates names the
 * control the way one of the set's does (role+name, label, placeholder,
 * test id, id, or an identical css/text candidate). For an option click the
 * control is the step before it (its opener), as markActed's fallback has it.
 * The runtime answers by element; this is an approximation, stated as one.
 *
 *   node bench/echo-element-census.mjs [--no-fetch] [--apps ec,od] [--out file.json]
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
const outFile = opt('--out');
const fetchRefs = !argv.includes('--no-fetch');

const { askedOutputs } = await import(pathToFileURL(path.join(REPO, 'dist/daemon/step-verdict.js')).href);
const { popupItem } = await import(pathToFileURL(path.join(REPO, 'dist/execution/expect.js')).href);

function git(args, encoding = 'utf8') {
  const r = spawnSync('git', args, { cwd: REPO, encoding, maxBuffer: 512 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { code: r.status, out: r.stdout ?? '' };
}

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
    const size = parseInt(str(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(head[156]) || '0';
    const full = prefix ? `${prefix}/${name}` : name;
    if (type === '0' || type === '\0') {
      const target = path.resolve(destDir, full);
      if (target.startsWith(path.resolve(destDir) + path.sep)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, buf.subarray(off + 512, off + 512 + size));
      }
    }
    off += 512 + size + ((512 - (size % 512)) % 512);
  }
}

function branches() {
  if (fetchRefs) {
    const r = git(['ls-remote', '--heads', 'origin', 'refs/heads/results/fw*']);
    const remote = r.out.split('\n').map((l) => l.split('\t')[1]).filter(Boolean).map((s) => s.replace(/^refs\/heads\//, ''));
    const have = new Set(git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/results/']).out.split('\n').map((s) => s.trim().replace('refs/remotes/origin/', '')));
    const missing = remote.filter((b) => !have.has(b));
    for (let i = 0; i < missing.length; i += 40) git(['fetch', '--no-tags', 'origin', ...missing.slice(i, i + 40).map((b) => `+refs/heads/${b}:refs/remotes/origin/${b}`)]);
  }
  const refs = git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/results/']).out.split('\n').map((s) => s.trim()).filter(Boolean);
  const byRunid = new Map();
  for (const ref of refs.sort()) {
    const short = ref.replace(/^.*?results\//, '');
    const runid = short.split('-')[0];
    const m = /^fw(rd|od|gr|kb|op|gt|vk|ec|si|gh)(\d*)$/.exec(runid);
    if (m) byRunid.set(runid, { ref, runid, app: m[1], num: Number(m[2] || 0) });
  }
  return [...byRunid.values()].filter((e) => !apps || apps.has(e.app)).sort((a, b) => (a.app === b.app ? a.num - b.num : APPS.indexOf(a.app) - APPS.indexOf(b.app)));
}

function sweepVerdicts() {
  const out = new Map();
  for (const line of fs.readFileSync(path.join(REPO, 'bench/SWEEPS.md'), 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const runid = cells.find((c) => /^fw(rd|od|gr|kb|op|gt|vk|ec|si|gh)\d+$/.test(c));
    if (runid) out.set(runid, { round: cells[1], green: /^(\*\*yes\*\*|yes\*?)$/i.test(cells[cells.length - 3] ?? '') });
  }
  return out;
}

function extract(e, tmp) {
  const dir = path.join(tmp, e.runid);
  const files = git(['ls-tree', '-r', '--name-only', e.ref, '--', `${PUB}/`]).out.split('\n').filter(Boolean);
  const flowPath = `${PUB}/${e.runid}.json`;
  const store = `${PUB}/${e.runid}-skills/`;
  const runs = files.filter((f) => new RegExp(`^${PUB}/${e.runid}-n[23]-flowrun\\.json$`).test(f));
  if (!files.includes(flowPath) || !files.some((f) => f.startsWith(store)) || !runs.length) return null;
  const ar = git(['archive', '--format=tar', e.ref, '--', flowPath, store, ...runs], 'buffer');
  if (ar.code !== 0) return null;
  untar(ar.out, dir);
  const skills = new Map();
  const storeDir = path.join(dir, store);
  for (const host of fs.readdirSync(storeDir)) {
    const hd = path.join(storeDir, host);
    if (!fs.statSync(hd).isDirectory()) continue;
    for (const f of fs.readdirSync(hd).filter((f) => /^s_.*\.json$/.test(f))) {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(hd, f), 'utf8'));
        skills.set(s.id, s);
      } catch {
        /* unreadable entry */
      }
    }
  }
  const flowruns = {};
  for (const f of runs) flowruns[/-(n[23])-flowrun/.exec(f)[1]] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return { flow: JSON.parse(fs.readFileSync(path.join(dir, flowPath), 'utf8')), skills, flowruns };
}

const chainOf = (sk, skills) => (sk?.seq?.chain ? [...skills.values()].filter((s) => s.seq?.chain === sk.seq.chain).sort((a, b) => a.seq.index - b.seq.index) : sk ? [sk] : []);
const VALUE_TOOLS = new Set(['fill', 'type', 'select', 'check', 'uncheck', 'set_checked']);
const OPTION = /^(option|menuitem|menuitemcheckbox|menuitemradio)$/;
const CONTROL_LINE = /^-?\s*(textbox|searchbox|spinbutton|combobox|listbox|option|checkbox|radio|switch|slider|menuitem\w*)\b/;

/** What names a control, per candidate: comparable keys. */
function names(chain) {
  const out = new Set();
  for (const c of chain ?? []) {
    if (c.kind === 'role' && c.name) out.add(`role:${c.role}:${c.name}`);
    else if (c.kind === 'label' && c.label) out.add(`label:${c.label}`);
    else if (c.kind === 'placeholder' && c.placeholder) out.add(`ph:${c.placeholder}`);
    else if (c.kind === 'testid' && c.testid) out.add(`testid:${c.testid}`);
    else if (c.kind === 'id' && c.selector) out.add(`id:${c.selector}`);
    else if (c.kind === 'css' && c.selector) out.add(`css:${c.selector}:${c.nth ?? 0}`);
  }
  return out;
}

/** Route of a recorded url pattern: origin, path and hash path; never the query. */
const route = (u) => {
  if (!u) return null;
  const [before, hash = ''] = String(u).split('#', 2);
  return `${before.split('?')[0]}#${hash.split('?')[0]}`;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-census-'));
const verdicts = sweepVerdicts();
const rows = [];
const T = { runs: 0, readValues: 0, recoveredSkipped: 0, atSetControl: 0, committed: 0, noCommit: 0, alreadyEcho: 0, unknownText: 0, newlyWithheld: 0, asked: 0, askedGreen: 0 };
/** echo.ts echoKey: the text rule's key. */
const echoKey = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
try {
  for (const e of branches()) {
    const got = extract(e, tmp);
    fs.rmSync(path.join(tmp, e.runid), { recursive: true, force: true });
    if (!got) continue;
    T.runs += 1;
    const v = verdicts.get(e.runid) ?? { round: '?', green: null };
    for (const [n, fr] of Object.entries(got.flowruns)) {
      for (const s of fr.steps ?? []) {
        const fstep = got.flow.steps.find((x) => x.id === s.id);
        const chain = chainOf(got.skills.get(fstep?.skill), got.skills);
        if (!chain.length) continue;
        // The chain's steps in replay order, with the segment each belongs to and its recorded page.
        const flat = [];
        for (const [si, m] of chain.entries()) {
          let page = m.preconditions?.urlPattern ?? null;
          const walk = (steps) => {
            for (const st of steps ?? []) {
              flat.push({ st, seg: si, page });
              if (st.expect?.urlPattern) page = st.expect.urlPattern;
              if (st.body) walk(st.body);
            }
          };
          walk(m.steps);
        }
        const readAt = new Map();
        flat.forEach((f, i) => {
          if ((f.st.tool === 'read' || f.st.tool === 'read_all') && f.st.label && !readAt.has(f.st.label)) readAt.set(f.st.label, i);
        });
        for (const [key, value] of Object.entries(s.values ?? {})) {
          if (!readAt.has(key)) continue;
          if (s.recovered || (s.turns ?? 0) > 0) {
            T.recoveredSkipped += 1;
            continue;
          }
          T.readValues += 1;
          const ri = readAt.get(key);
          const read = flat[ri];
          const readNames = names(read.st.locators?.target);
          // Value-setting steps before the read whose control the read names.
          const sets = [];
          for (let i = 0; i < ri; i++) {
            const f = flat[i];
            const target = f.st.locators?.target ?? [];
            const option = f.st.tool === 'click' && target.some((c) => c.kind === 'role' && OPTION.test(c.role ?? ''));
            if (!VALUE_TOOLS.has(f.st.tool) && !option) continue;
            // An option's control is its opener, the step before it (markActed's fallback).
            const controlNames = option && i > 0 ? names(flat[i - 1].st.locators?.target) : names(target);
            if ([...controlNames].some((k) => readNames.has(k))) sets.push(i);
          }
          if (!sets.length) continue;
          T.atSetControl += 1;
          // Committed from EVERY such set to the read (the runtime judges each source).
          const committedFrom = (si) => {
            const set = flat[si];
            const values = [set.st.args?.value, set.st.args?.text].filter((x) => typeof x === 'string');
            for (let i = si + 1; i < ri; i++) {
              const f = flat[i];
              if (f.st.tool === 'goto' || f.st.tool === 'back' || f.st.tool === 'reload') return true;
              if (route(f.page) && route(set.page) && route(f.page) !== route(set.page)) return true;
              if (f.st.expect?.urlPattern && route(f.st.expect.urlPattern) !== route(set.page)) return true;
              if (['click', 'dblclick', 'press'].includes(f.st.tool) && (f.st.expect?.addedContains ?? []).some((l) => !popupItem(l) && !CONTROL_LINE.test(l.trim()) && values.some((v) => v && l.includes(v)))) return true;
            }
            return route(read.page) !== route(set.page) && route(read.page) !== null && route(set.page) !== null;
          };
          const committed = sets.every(committedFrom);
          const asked = askedOutputs(fstep.instruction ?? '', [key]).length > 0;
          const crossSegment = sets.some((si) => flat[si].seg !== read.seg);
          if (committed) {
            T.committed += 1;
            continue;
          }
          T.noCommit += 1;
          // The text rule already calls it an echo when the read returns what a
          // set of the SAME segment put there (today's rule): not newly withheld.
          const setText = (si) => {
            const raw = [flat[si].st.args?.value, flat[si].st.args?.text].find((x) => typeof x === 'string');
            if (raw === undefined) return null;
            // The run's own values for a slot: the flow param, its {{runid}} var and
            // any earlier step's published output resolved as the flow runner does.
            const resolve = (t) =>
              t
                .replace(/\{\{runid\}\}/g, `${e.runid}-${n}`)
                .replace(/\{\{(\d\d-[^.}]+)\.([^}]+)\}\}/g, (m, id, out) => {
                  const hit = (fr.steps ?? []).find((x) => x.id === id)?.values?.[out];
                  return typeof hit === 'string' ? hit : m;
                });
            const filled = raw.replace(/\{\{(v\d+)\}\}/g, (m, slot) => (typeof fstep.params?.[slot] === 'string' ? resolve(fstep.params[slot]) : m));
            return filled.includes('{{') ? null : filled;
          };
          const sameSegmentSets = sets.filter((si) => flat[si].seg === read.seg);
          const texts = sameSegmentSets.map(setText);
          if (sameSegmentSets.length && texts.some((t) => t !== null && echoKey(t) === echoKey(value))) {
            T.alreadyEcho += 1;
            continue;
          }
          if (sameSegmentSets.length && texts.every((t) => t === null)) T.unknownText += 1;
          T.newlyWithheld += 1;
          if (asked) T.asked += 1;
          if (asked && v.green) T.askedGreen += 1;
          rows.push({ runid: e.runid, round: v.round, green: v.green, n, step: s.id, key, value: String(value).slice(0, 60), asked, crossSegment, set: flat[sets[0]].st.tool });
        }
      }
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`# echo-element census: ${T.runs} runs with stored n2/n3 flow runs`);
console.log(`published read values (tier-A replay steps): ${T.readValues}; skipped as recovered: ${T.recoveredSkipped}`);
console.log(`  read at a control an earlier step of the chain set: ${T.atSetControl}`);
console.log(`    a commit between set and read (still observed): ${T.committed}`);
console.log(`    no commit: ${T.noCommit}; of which today's text rule already echoes (same segment, same text): ${T.alreadyEcho}`);
console.log(`    newly withheld: ${T.newlyWithheld} (set text unknown: ${T.unknownText}) — asked ${T.asked}, asked on green runs ${T.askedGreen}`);
console.log('');
for (const r of rows) console.log(`  ${r.runid} (round ${r.round}, ${r.green === null ? '?' : r.green ? 'green' : 'not green'}) ${r.n} ${r.step}.${r.key}${r.asked ? ' *asked' : ''}${r.crossSegment ? ' [cross-segment]' : ''} via ${r.set} = ${JSON.stringify(r.value)}`);
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ totals: T, rows }, null, 2));
