#!/usr/bin/env node
/**
 * Can Jev match a REWORDED instruction to the stored skill that does it?
 * (PLAN-jev.md §6, bet 1 — offline, no browser, no inner model, cents.)
 *
 *   node bench/jev-match-offline.mjs [--max 600] [--seed 1] [--json out.json]
 *
 * Today the zero-model path needs the instruction to match a validated skill's
 * template word for word (skills/learn.ts matchTemplate). An orchestrator never
 * says the same thing twice — the same RepairDesk task arrived as 4, 5, 6 and
 * 13 differently worded instructions across this branch's own sweeps — so the
 * question is whether a cheap decider can say "this instruction is THAT stored
 * procedure", and, as importantly, "it is none of them".
 *
 * DATA. Every RepairDesk sweep under bench/results and bench/results-published
 * that left both a skill store and an orchestrator transcript. A QUERY is one
 * `do "…"` instruction from one run; the BALLOT is another run's store (chain
 * heads only, demoted skills out, identical templates merged).
 *
 * TRUTH, without asking a model: the RepairDesk task has a closed set of things
 * an instruction can ask for (sign in, create a ticket, add a part, edit a
 * part's cost, mark Ready, delete parts, archive). Each instruction and each
 * template is labelled with the SET it asks for, by the patterns below; a
 * procedure is the right answer when its set EQUALS the query's — all of it and
 * nothing more — and the right answer is `none` when no procedure's does.
 * The labelling is crude and is printed with every disagreement so it can be
 * audited; an instruction the patterns cannot label at all is dropped.
 *
 * BASELINE. The thing Jev has to beat is code, not nothing: token-set (Jaccard)
 * similarity between the instruction with its literals blanked and each
 * template with its slots blanked, best match wins, `none` under a threshold —
 * reported at the threshold that is BEST for the baseline, to be fair to it.
 *
 * WHAT MATTERS MOST is the false accept: running the wrong procedure is a
 * mutation on a live app, where a missed match only costs a model turn.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemOne, resolveSystemOneConfig, choice } from '../dist/agent/system-one.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const MAX = Number(opt('--max', 600));
const SEED = Number(opt('--seed', 1));

// --- labels -------------------------------------------------------------------
const OBJECTIVES = {
  signin: /(?<!already )(?<!currently )\bsign(?:ed)? in\b(?! as)|\blog ?in with\b/i,
  create: /\bcreate\b[^.]{0,60}\bticket\b/i,
  addpart: /\badd (?:a |an |another |a second |the |one )?(?:new |second )?part\b/i,
  editcost: /\bedit the part\b|\bchange (?:its|the) cost\b|\bcost (?:changes|from)\b/i,
  ready: /\b(?:change|changing|set|setting|mark|marking|switch|update)\b[^.]{0,60}(?:\bready\b|\bstatus to '?\{\{v\d+\}\})/i,
  delete: /\bdelete\b|\bremove both parts\b/i,
  archive: /\barchive\b/i,
};
const labelOf = (text) => Object.entries(OBJECTIVES).filter(([, re]) => re.test(text)).map(([k]) => k).sort().join('+');

// --- data ---------------------------------------------------------------------
const dirs = ['results', 'results-published'].map((d) => path.join(here, d)).filter((d) => fs.existsSync(d));
const stores = [];
const queries = [];
for (const dir of dirs) {
  for (const entry of fs.readdirSync(dir)) {
    const m = /^(.+)-skills$/.exec(entry);
    if (m) {
      const origin = path.join(dir, entry, 'http_127.0.0.1_4180');
      if (!fs.existsSync(origin)) continue; // RepairDesk only
      const byTemplate = new Map();
      for (const f of fs.readdirSync(origin).filter((f) => /^s_.*\.json$/.test(f))) {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(origin, f), 'utf8'));
          if (s.status === 'demoted' || (s.seq && s.seq.index > 0) || !s.template) continue;
          if (!byTemplate.has(s.template)) byTemplate.set(s.template, { id: s.id, template: s.template, label: labelOf(s.template) });
        } catch {
          /* a half-written skill is not data */
        }
      }
      const heads = [...byTemplate.values()].filter((h) => h.label);
      if (heads.length >= 3) stores.push({ base: m[1], heads });
    }
    const t = /^(.+)-n1-(?:sitelooper|sleep-walker|browser-pilot)-transcript\.jsonl$/.exec(entry);
    if (t) {
      const first = fs.readFileSync(path.join(dir, entry), 'utf8').split('\n')[0] ?? '';
      if (!/"target":"repairdesk"/.test(first)) continue;
      for (const line of fs.readFileSync(path.join(dir, entry), 'utf8').split('\n').filter(Boolean)) {
        let r;
        try {
          r = JSON.parse(line);
        } catch {
          continue;
        }
        if (r.k !== 'cmd' || r.code !== 0) continue;
        const text = /\bdo "((?:[^"\\]|\\.)*)"/.exec(r.cmd)?.[1]?.replace(/\\"/g, '"');
        const label = text ? labelOf(text) : '';
        if (text && label) queries.push({ base: t[1], text, label });
      }
    }
  }
}

// Deterministic sample of (query, store) pairs from DIFFERENT sweeps.
let seed = SEED;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pairs = [];
for (const q of queries) for (const s of stores) if (s.base !== q.base) pairs.push({ q, s });
pairs.sort(() => rand() - 0.5);
const sample = pairs.slice(0, MAX);
console.error(`stores ${stores.length}, queries ${queries.length}, pairs ${pairs.length}, asking ${sample.length}`);

// --- baseline -----------------------------------------------------------------
const STOP = new Set('the a an and or of to in on at for with from by is are it its this that then as be any all if so'.split(' '));
const blank = (s) => s.replace(/\{\{v\d+\}\}/g, ' ').replace(/'[^']*'|"[^"]*"/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\b[A-Z]{2}-\d+\b/g, ' ').replace(/\d+(?:\.\d+)?/g, ' ');
const tokens = (s) => new Set(blank(s).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a, b) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
};

// --- Jev ----------------------------------------------------------------------
const client = buildSystemOne(resolveSystemOneConfig());
if (!client) {
  console.error('no System One client: set TYPESAFE_API_KEY or `sitelooper config set jevApiKey`');
  process.exit(2);
}
const ASK =
  'A browser automation tool keeps stored procedures. `instruction` is a new request. `procedures` lists each stored procedure by the request it was recorded for; a mark like {{v1}} is a blank that takes a name, a reference or a number. Which stored procedure carries out EXACTLY what `instruction` asks — all of it and nothing more? A procedure that does only part of it, or that also does something the instruction does not ask for, is not a match. If no procedure is an exact match, answer none.';
const ASK_REV =
  'The request `instruction` has arrived. Each entry of `procedures` is the wording a stored procedure was recorded under, with {{vN}} standing for a blank. Pick the one entry whose task is the same task as the instruction — the same things done, no more and no fewer — or pick none if there is no such entry.';

async function askJev(q, s) {
  const options = Object.fromEntries(s.heads.map((h, i) => [`p${i}`, h.template.slice(0, 600)]));
  options.none = 'none of these procedures does exactly this';
  const reversed = Object.fromEntries(Object.entries(options).reverse());
  const res = await client.ask({ instruction: q.text, procedures: options }, { pick: choice(ASK, options), rev: choice(ASK_REV, reversed) });
  const a = res.answers;
  const agreed = a.pick.choice === a.rev.choice;
  return { pick: agreed ? a.pick.choice : null, confidence: agreed ? Math.min(a.pick.confidence, a.rev.confidence) : 0, first: a.pick.choice, second: a.rev.choice };
}

const rows = [];
let next = 0;
async function worker() {
  while (next < sample.length) {
    const { q, s } = sample[next++];
    const right = new Set(s.heads.map((h, i) => (h.label === q.label ? `p${i}` : null)).filter(Boolean));
    const truth = right.size ? right : new Set(['none']);
    const qt = tokens(q.text);
    const sims = s.heads.map((h, i) => ({ id: `p${i}`, sim: jaccard(qt, tokens(h.template)) })).sort((x, y) => y.sim - x.sim);
    let jev = null;
    try {
      jev = await askJev(q, s);
    } catch (e) {
      jev = { pick: null, confidence: 0, error: String(e).slice(0, 80) };
    }
    rows.push({ q, s, truth, jev, base: sims[0] });
  }
}
await Promise.all(Array.from({ length: 12 }, worker));

// --- scoring ------------------------------------------------------------------
/** The pick and the instruction differ only in whether they SIGN IN first — which the live matcher's urlPattern precondition settles. */
function onlySignIn(r, id) {
  const head = r.s.heads[Number(String(id).slice(1))];
  if (!head) return false;
  const A = new Set(r.q.label.split('+')), B = new Set(head.label.split('+'));
  const diff = [...A].filter((x) => !B.has(x)).concat([...B].filter((x) => !A.has(x)));
  return diff.length === 1 && diff[0] === 'signin';
}

function score(decide) {
  let n = 0, hit = 0, miss = 0, falseAccept = 0, correctNone = 0, wrongSkill = 0, startPage = 0;
  for (const r of rows) {
    n++;
    const d = decide(r); // an id, or 'none'
    const wantNone = r.truth.has('none');
    if (d === 'none') wantNone ? correctNone++ : miss++;
    else if (r.truth.has(d)) hit++;
    else if (onlySignIn(r, d)) startPage++;
    else wantNone ? falseAccept++ : wrongSkill++;
  }
  return { n, hit, miss, correctNone, falseAccept, wrongSkill, startPage };
}
const fmt = (s) => `right skill ${s.hit}  correct none ${s.correctNone}  | missed ${s.miss}  WRONG skill ${s.wrongSkill}  FALSE accept ${s.falseAccept}  start-page-gated ${s.startPage}   (runs a wrong procedure on ${(100 * (s.wrongSkill + s.falseAccept) / s.n).toFixed(1)}% of asks; matches ${(100 * s.hit / Math.max(1, s.hit + s.miss + s.wrongSkill)).toFixed(0)}% of the matchable)`;

const matchable = rows.filter((r) => !r.truth.has('none')).length;
console.log(`asks ${rows.length}: a right procedure exists for ${matchable}, truth is none for ${rows.length - matchable}; Jev's two orders disagreed on ${rows.filter((r) => r.jev.pick === null).length}`);
console.log('\nJev, by gate (below the gate = none):');
for (const g of [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) console.log(`  >=${g.toFixed(2)}  ${fmt(score((r) => (r.jev.pick && r.jev.confidence >= g ? r.jev.pick : 'none')))}`);
console.log('\nBaseline (token Jaccard), by threshold:');
for (const t of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) console.log(`  >=${t.toFixed(2)}  ${fmt(score((r) => (r.base.sim >= t ? r.base.id : 'none')))}`);

const bad = rows.filter((r) => r.jev.pick && r.jev.pick !== 'none' && r.jev.confidence >= 0.8 && !r.truth.has(r.jev.pick) && !onlySignIn(r, r.jev.pick));
console.log(`\nJev's wrong picks at >=0.80 (${bad.length}) — audit the LABELS as much as Jev:`);
for (const r of bad.slice(0, 12)) {
  const picked = r.s.heads[Number(r.jev.pick.slice(1))];
  console.log(`  ${r.jev.confidence.toFixed(2)} [${r.q.label}] "${r.q.text.slice(0, 110)}"\n        -> [${picked.label}] "${picked.template.slice(0, 110)}"`);
}
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(rows.map((r) => ({ q: r.q, store: r.s.base, truth: [...r.truth], jev: r.jev, base: r.base })), null, 1));
