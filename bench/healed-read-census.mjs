#!/usr/bin/env node
/**
 * healed-read-census: sizing for round 62's rule on reads resolved off the
 * recorded element (gitea fwgt13 02-create).
 *
 * fwgt13 n2/n3 published `assignee_applied: "Add a link"`: the recorded read of
 * the assignee LINK ("bench-assignee") matched nothing, an inline heal proposed
 * `getByRole('button', { name: 'Add a link' })` from the live page, and the
 * button's text went out as an observed value. A read resolved by an inline
 * heal, or by a positional fallback (a point, or a structural css candidate
 * behind a missed better one), reads an element the recording never read.
 *
 * WHAT THIS COUNTS, on stored n2/n3 flow runs (no browser): every value a
 * tier-A step published from a labelled read whose replay warning says the
 * read was healed inline, or stood on a fallback candidate after a better one
 * missed — split by how (heal, point, structural css, a named candidate), and,
 * for a heal, whether the healed element's role agrees with a role the
 * recorded chain names (its role candidates, a point's recorded role). Then
 * how many of those are asked by the instruction, and on green runs.
 *
 *   node bench/healed-read-census.mjs [--no-fetch] [--apps gt] [--out file.json]
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
    const runid = ref.replace(/^.*?results\//, '').split('-')[0];
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

/** The top-level step a replay tag "7" or "9.2.1" names (a loop body's pass is its loop's step). */
const stepAt = (skill, tag) => skill?.steps?.[Number(String(tag).split('.')[0]) - 1];
/** The roles a recorded chain names: its role candidates, and a point's recorded role. */
const recordedRoles = (chain) => new Set((chain ?? []).flatMap((c) => (c.kind === 'role' && c.role ? [c.role] : c.kind === 'point' && c.role ? [c.role] : [])));
/** The KIND the chain records (execution/resolve.ts recordedReadKind): a point's role, else its tag; a role candidate's role. */
const recordedKinds = (chain) => (chain ?? []).flatMap((c) => (c.kind === 'point' ? [c.role ? { role: c.role } : { tag: c.tag }] : c.kind === 'role' && c.role ? [{ role: c.role }] : []));
/** The implicit role of a bare tag, as point.ts kindOf spells it (the few that matter here). */
const implicitRole = (tag) => ({ button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', img: 'img', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading' })[tag] ?? null;
/** What a fallback expression resolves to, statically: getByRole's role, or the css tail's tag. */
function liveKind(expr) {
  const role = /getByRole\('([^']+)'/.exec(expr)?.[1];
  if (role) return { role, tag: null };
  const css = /locator\('([^']*)'\)/.exec(expr)?.[1];
  if (!css) return null;
  const tail = css.split(/\s*>\s*|\s+/).filter(Boolean).pop() ?? '';
  const tag = /^([a-z][a-z0-9]*)/i.exec(tail)?.[1]?.toLowerCase() ?? null;
  return tag ? { role: implicitRole(tag), tag } : null;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'healed-census-'));
const verdicts = sweepVerdicts();
const rows = [];
const T = { runs: 0, readValues: 0, offRecorded: 0, heal: 0, healRoleMismatch: 0, healRoleMatch: 0, healNoRole: 0, point: 0, structural: 0, named: 0, asked: 0, askedGreen: 0 };
try {
  for (const e of branches()) {
    const got = extract(e, tmp);
    fs.rmSync(path.join(tmp, e.runid), { recursive: true, force: true });
    if (!got) continue;
    T.runs += 1;
    const v = verdicts.get(e.runid) ?? { round: '?', green: null };
    for (const [n, fr] of Object.entries(got.flowruns)) {
      for (const s of fr.steps ?? []) {
        if (s.recovered || (s.turns ?? 0) > 0) continue;
        const fstep = got.flow.steps.find((x) => x.id === s.id);
        for (const key of Object.keys(s.values ?? {})) {
          // Is this key a labelled read of the pinned chain? count it once.
          T.readValues += 0;
        }
        for (const w of s.warnings ?? []) {
          const m = /^(s_[0-9a-f]+): step ([\d.]+): (.*)$/s.exec(w);
          if (!m) continue;
          const skill = got.skills.get(m[1]);
          const step = stepAt(skill, m[2]);
          if (!step || (step.tool !== 'read' && step.tool !== 'read_all') || !step.label || !(step.label in (s.values ?? {}))) continue;
          const asked0 = () => askedOutputs(fstep?.instruction ?? '', [step.label]).length > 0;
          let how = null;
          let healRole = null;
          const heal = /healed inline: the step ran on (.*?)(?:, proposed|$)/.exec(m[3]);
          const fb = /used fallback #\d+ (.*)$/.exec(m[3]);
          if (heal) {
            how = 'heal';
            healRole = /getByRole\('([^']+)'/.exec(heal[1])?.[1] ?? null;
          } else if (fb) {
            how = /^elementAt\(/.test(fb[1]) ? 'point' : /nth-of-type|nth=|>> nth|\.nth\(/.test(fb[1]) || /^page\.locator\('(?!#[\w-]+'\))/.test(fb[1]) ? 'structural' : 'named';
          } else continue;
          T.offRecorded += 1;
          T[how] += 1;
          const roles = recordedRoles(step.locators?.target);
          // The rule, statically: the live element must be the KIND a point or role candidate recorded.
          const kinds = recordedKinds(step.locators?.target);
          const live = how === 'point' ? 'point' : liveKind(heal?.[1] ?? fb?.[1] ?? '');
          let kindVerdict = 'no recorded kind';
          if (live === 'point') kindVerdict = 'agrees (a point resolves only on its kind)';
          else if (kinds.length && !live) kindVerdict = 'unknown live kind';
          else if (kinds.length) kindVerdict = kinds.some((k) => (k.role ? live.role === k.role : live.tag === k.tag)) ? 'agrees' : 'DIFFERS';
          T.kind ??= {};
          T.kind[kindVerdict] = (T.kind[kindVerdict] ?? 0) + 1;
          if (kindVerdict === 'DIFFERS') { T.differs ??= 0; T.differs += 1; if (asked0()) T.differsAsked = (T.differsAsked ?? 0) + 1; if (asked0() && v.green) T.differsAskedGreen = (T.differsAskedGreen ?? 0) + 1; }
          let roleVerdict = '';
          if (how === 'heal') {
            if (!roles.size || !healRole) {
              T.healNoRole += 1;
              roleVerdict = 'no-role';
            } else if (roles.has(healRole)) {
              T.healRoleMatch += 1;
              roleVerdict = 'role-match';
            } else {
              T.healRoleMismatch += 1;
              roleVerdict = `role ${healRole} vs recorded ${[...roles].join('/')}`;
            }
          }
          const asked = asked0();
          if (asked) T.asked += 1;
          if (asked && v.green) T.askedGreen += 1;
          rows.push({ runid: e.runid, round: v.round, green: v.green, n, step: s.id, key: step.label, value: String(s.values[step.label]).slice(0, 60), how, roleVerdict: kindVerdict, asked, used: (heal?.[1] ?? fb?.[1] ?? '').slice(0, 90) });
        }
      }
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`# healed/positional read census: ${T.runs} runs with stored n2/n3 flow runs (tier-A steps only)`);
console.log(`published values from a read resolved off its recorded element: ${T.offRecorded}`);
console.log(`  inline heal: ${T.heal} (role agrees ${T.healRoleMatch}, role differs ${T.healRoleMismatch}, no recorded role ${T.healNoRole})`);
console.log(`  point fallback: ${T.point}; structural css fallback: ${T.structural}; named fallback (role/label/text/id): ${T.named}`);
console.log(`  asked: ${T.asked}; asked on green runs: ${T.askedGreen}`);
console.log(`the kind rule (recorded point/role kind vs the resolved element): ${JSON.stringify(T.kind)}`);
console.log(`  would withhold: ${T.differs ?? 0} (asked ${T.differsAsked ?? 0}, asked on green runs ${T.differsAskedGreen ?? 0})`);
console.log('');
for (const r of rows.filter((r) => r.how !== 'named')) console.log(`  ${r.runid} (round ${r.round}, ${r.green === null ? '?' : r.green ? 'green' : 'not green'}) ${r.n} ${r.step}.${r.key}${r.asked ? ' *asked' : ''} [${r.how}${r.roleVerdict ? `: ${r.roleVerdict}` : ''}] = ${JSON.stringify(r.value)}  via ${r.used}`);
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ totals: T, rows }, null, 2));
