#!/usr/bin/env node
/**
 * Second half of bet 1 (PLAN-jev.md §6): once a reworded instruction is matched
 * to a stored skill, can its SLOTS be bound from the new wording?
 *
 *   node bench/jev-bind-offline.mjs [--max 400] [--seed 1] [--json out.json]
 *
 * The exact binder (skills/learn.ts bindSkill) reads a slot's value off the
 * instruction by the template's own wording, so it cannot bind a paraphrase. Here
 * the skill is GIVEN (the truly matching one, so this measures binding alone):
 * code lists the literals the new instruction states (agent/actor.ts
 * extractValues — quoted strings, numbers, urls, reference-shaped tokens), and
 * for every slot Jev picks one of them or `none`, shown the template and the
 * value the slot held when it was recorded. All slots ride in ONE request, each
 * asked in two option orders that must agree.
 *
 * TRUTH, by role, without a model. Run tags are normalised away
 * (`fwrdj11-n1 RD Part A` and `fwrdev2-n2 RD Part A` are the same role):
 *   - a literal that equals the recorded example after normalising, if unique;
 *   - else by SHAPE when the example has one — a ticket reference (RD-1234), a
 *     part name, a ticket title, a url — the only literal of that shape;
 *   - a number by the word before the slot in the template ("cost {{v5}}") and
 *     the number after the same word in the instruction;
 *   - `none` when the example has a recognisable shape and the instruction
 *     states nothing of that shape (the orchestrator said "the ticket titled X"
 *     where the recording said "RD-1015") — that skill cannot run from this text.
 * A slot with no derivable truth (credentials are redacted in transcripts;
 * free text) is left out and counted.
 *
 * BASELINE: same shape/kind as the example, then best token overlap with it;
 * a tie or no candidate is `none`.
 *
 * A skill only runs if EVERY slot binds, so the headline is per skill: all
 * scorable slots right, none wrong.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemOne, resolveSystemOneConfig, choice } from '../dist/agent/system-one.js';
import { extractValues } from '../dist/agent/actor.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const MAX = Number(opt('--max', 400));
let seed = Number(opt('--seed', 1));

const OBJECTIVES = {
  signin: /(?<!already )(?<!currently )\bsign(?:ed)? in\b(?! as)|\blog ?in with\b/i,
  create: /\bcreate\b[^.]{0,60}\bticket\b/i,
  addpart: /\badd (?:a |an |another |a second |the |one )?(?:new |second )?part\b/i,
  editcost: /\bedit the part\b|\bchange (?:its|the) cost\b|\bcost (?:changes|from)\b/i,
  ready: /\b(?:change|changing|set|setting|mark|marking|switch|update)\b[^.]{0,60}(?:\bready\b|\bstatus to '?\{\{v\d+\}\})/i,
  delete: /(?<!not )(?<!n't )\bdelete\b|\bremove both parts\b/i,
  archive: /\barchive\b/i,
};
const labelOf = (text) => Object.entries(OBJECTIVES).filter(([, re]) => re.test(text)).map(([k]) => k).sort().join('+');

// --- data: the same stores and instructions as jev-match-offline.mjs ------------
const dirs = ['results', 'results-published'].map((d) => path.join(here, d)).filter((d) => fs.existsSync(d));
const stores = [];
const queries = [];
for (const dir of dirs) {
  for (const entry of fs.readdirSync(dir)) {
    const m = /^(.+)-skills$/.exec(entry);
    if (m) {
      const origin = path.join(dir, entry, 'http_127.0.0.1_4180');
      if (!fs.existsSync(origin)) continue;
      const byTemplate = new Map();
      for (const f of fs.readdirSync(origin).filter((f) => /^s_.*\.json$/.test(f))) {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(origin, f), 'utf8'));
          if (s.status === 'demoted' || (s.seq && s.seq.index > 0) || !s.template) continue;
          if (!byTemplate.has(s.template)) byTemplate.set(s.template, { id: s.id, template: s.template, params: s.params ?? {}, label: labelOf(s.template) });
        } catch {
          /* not data */
        }
      }
      const heads = [...byTemplate.values()].filter((h) => h.label && Object.keys(h.params).length);
      if (heads.length) stores.push({ base: m[1], heads });
    }
    const t = /^(.+)-n1-(?:sitelooper|sleep-walker|browser-pilot)-transcript\.jsonl$/.exec(entry);
    if (t) {
      const lines = fs.readFileSync(path.join(dir, entry), 'utf8').split('\n').filter(Boolean);
      if (!/"target":"repairdesk"/.test(lines[0] ?? '')) continue;
      for (const line of lines) {
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
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pairs = [];
for (const q of queries) for (const s of stores) if (s.base !== q.base) for (const h of s.heads) if (h.label === q.label) pairs.push({ q, h, store: s.base });
pairs.sort(() => rand() - 0.5);
const sample = pairs.slice(0, MAX);
console.error(`matched (instruction, skill) pairs ${pairs.length}, asking ${sample.length}`);

// --- truth ------------------------------------------------------------------------
const norm = (s) => String(s).replace(/\b[a-z]+\d+[a-z]*\d*-n\d+\b/gi, 'RUN').replace(/\s+/g, ' ').trim().toLowerCase();
const SHAPES = [
  ['ref', /^RD-\d+$/i],
  ['run', /^RUN$/i],
  ['part', /\brd part\b/i],
  ['title', /\bbench ticket\b/i],
  ['url', /^https?:\/\//i],
];
const shapeOf = (s) => SHAPES.find(([, re]) => re.test(norm(s)) || re.test(String(s)))?.[0] ?? null;
const SECRET = /@|«redacted»|pass/i;

function truthFor(slot, p, h, q, literals) {
  const ex = String(p.example ?? '');
  if (!ex || SECRET.test(ex)) return undefined;
  const same = literals.filter((l) => norm(l.text) === norm(ex));
  if (same.length === 1) return same[0].ref;
  if (same.length > 1) return undefined;
  const shape = shapeOf(ex);
  if (shape) {
    const ofShape = literals.filter((l) => shapeOf(l.text) === shape);
    if (ofShape.length === 1) return ofShape[0].ref;
    return ofShape.length === 0 ? 'none' : undefined;
  }
  if (/^\d+(?:\.\d+)?$/.test(ex)) {
    const word = new RegExp(`(\\w+)\\s+'?\\{\\{${slot}\\}\\}`).exec(h.template)?.[1];
    if (!word) return undefined;
    const hits = [...q.text.matchAll(new RegExp(`\\b${word}\\s+'?(\\d+(?:\\.\\d+)?)`, 'gi'))].map((m) => m[1]);
    if (hits.length !== 1) return hits.length === 0 ? 'none' : undefined;
    const lit = literals.filter((l) => l.text === hits[0]);
    return lit.length === 1 ? lit[0].ref : undefined;
  }
  return undefined;
}

// --- baseline ---------------------------------------------------------------------
const toks = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter(Boolean));
const overlap = (a, b) => {
  const A = toks(a), B = toks(b);
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / (A.size + B.size - n || 1);
};
// --generic: the shapes a LIVE binder can know about any app — a url, an email, a number,
// a date, a reference-shaped token (no spaces, carries a digit), or free text. The default
// shapes above know RepairDesk's part names and ticket titles, which flatters code.
const GENERIC = argv.includes('--generic');
const genericShape = (v) => {
  const t = String(v).trim();
  if (/^https?:\/\//i.test(t)) return 'url';
  if (/^[^\s@]+@[^\s@]+$/.test(t)) return 'email';
  if (/^\$?\d+(?:[.,]\d+)?%?$/.test(t)) return 'number';
  if (/^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t)) return 'date';
  if (!/\s/.test(t) && /\d/.test(t)) return 'code';
  return 'text';
};
/**
 * --cue: the generic code tier that does NOT assume "the only literal of this shape is the
 * one". (--generic showed that assumption is wrong 343 times in 1,634: a run-id blank and a
 * ticket reference are both "a token with a digit".) A slot is bound in code only when the
 * WORD BEFORE IT in the template ("reference {{v1}}", "titled '{{v2}}'", "cost {{v5}}") also
 * stands before exactly one literal of the same shape in the new instruction.
 */
const CUE = argv.includes('--cue');
const cueOf = (template, slot) => new RegExp(`([A-Za-z]+)[\\s:=('"]*\\{\\{${slot}\\}\\}`).exec(template)?.[1]?.toLowerCase();
function cueBind(slot, p, h, q, literals) {
  const cue = cueOf(h.template, slot);
  if (!cue || cue.length < 3) return null;
  const g = genericShape(p.example ?? '');
  const hits = literals.filter((l) => {
    if (genericShape(l.text) !== g) return false;
    const at = q.text.indexOf(l.text);
    if (at < 0) return false;
    const before = /([A-Za-z]+)[\s:=('"]*$/.exec(q.text.slice(0, at))?.[1]?.toLowerCase();
    return before === cue;
  });
  return hits.length === 1 ? hits[0].ref : null;
}
/**
 * --generic2: an app-independent code tier that compares each candidate with the value the
 * blank was RECORDED with. Same generic shape first; then token overlap with the example
 * (no run-tag normalising — 'fwrdev2-n2 RD Part A' still shares "rd part a" with the new
 * run's part name and nothing with its ticket reference). A clear winner binds; a best
 * overlap of zero means the new wording does not state this value (none) — except a number
 * or a url, which never overlap, where the template's cue word decides; a tie goes to Jev.
 */
const GENERIC2 = argv.includes('--generic2');
const rawToks = (v) => new Set(String(v).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
const rawOverlap = (x, y) => { const A = rawToks(x), B = rawToks(y); let n = 0; for (const t of A) if (B.has(t)) n++; return n / (A.size + B.size - n || 1); };
function generic2(slot, p, h, q, literals) {
  const ex = String(p.example ?? '');
  const g = genericShape(ex);
  const cands = literals.filter((l) => genericShape(l.text) === g);
  if (!cands.length) return 'none';
  if (g === 'number' || g === 'url' || g === 'date') {
    if (cands.length === 1 && g !== 'number') return cands[0].ref;
    return cueBind(slot, p, h, q, literals); // null = ask Jev
  }
  const ranked = cands.map((l) => ({ ref: l.ref, s: rawOverlap(l.text, ex) })).sort((x, y) => y.s - x.s);
  // (A minimum-overlap threshold was tried here and made things far worse — 301 wrong slots:
  // 'RD-1015' and 'RD-1091' share one token of three. Left out rather than tuned on one app.)
  if (ranked[0].s === 0) return 'none';
  if (ranked.length === 1 || ranked[0].s > ranked[1].s) return ranked[0].ref;
  return null;
}
function baselineFor(p, literals, codeOnly = false) {
  const ex = String(p.example ?? '');
  if (GENERIC) {
    const g = genericShape(ex);
    const same = literals.filter((l) => genericShape(l.text) === g);
    if (!same.length) return 'none';
    if (same.length === 1) return same[0].ref;
    if (codeOnly) return null;
    const ranked = same.map((l) => ({ ref: l.ref, s: overlap(l.text, ex) })).sort((a, b) => b.s - a.s);
    return ranked[0].s > ranked[1].s ? ranked[0].ref : 'none';
  }
  const isNum = /^\d+(?:\.\d+)?$/.test(ex);
  const shape = shapeOf(ex);
  const cands = literals.filter((l) => (isNum ? l.kind === 'number' || l.kind === 'money' : shape ? shapeOf(l.text) === shape : l.kind !== 'number'));
  if (!cands.length) return 'none';
  if (cands.length === 1) return cands[0].ref;
  if (codeOnly) return null;
  const ranked = cands.map((l) => ({ ref: l.ref, s: overlap(l.text, ex) })).sort((a, b) => b.s - a.s);
  return ranked[0].s > ranked[1].s ? ranked[0].ref : 'none';
}

// --- Jev ----------------------------------------------------------------------------
const client = buildSystemOne(resolveSystemOneConfig());
if (!client) {
  console.error('no System One client configured');
  process.exit(2);
}
const ask = (slot, ex) =>
  `A stored browser procedure was recorded under the wording in \`procedure\`, where ${`{{${slot}}}`} is a blank. When it was recorded that blank held ${JSON.stringify(ex)}. A NEW request, \`instruction\`, asks for the same kind of task with its own values; \`literals\` lists every value the new request states. Which entry of \`literals\` belongs in the blank ${`{{${slot}}}`} for the new request — the value that plays the same role there as ${JSON.stringify(ex)} did? If the new request does not state such a value, answer none.`;
const askRev = (slot, ex) =>
  `\`literals\` are the values stated by the request \`instruction\`. The stored procedure \`procedure\` has a blank ${`{{${slot}}}`} that was filled with ${JSON.stringify(ex)} in the original recording. Choose the literal that should fill ${`{{${slot}}}`} now, playing the same role; choose none if the request gives no value for it.`;

async function askJev(q, h, literals) {
  const options = Object.fromEntries(literals.map((l) => [l.ref, l.text]));
  options.none = 'the new request does not state this value';
  const reversed = Object.fromEntries(Object.entries(options).reverse());
  const questions = {};
  for (const [slot, p] of Object.entries(h.params)) {
    if (SECRET.test(String(p.example ?? ''))) continue;
    questions[`${slot}_a`] = choice(ask(slot, p.example), options);
    questions[`${slot}_b`] = choice(askRev(slot, p.example), reversed);
  }
  const res = await client.ask({ instruction: q.text, procedure: h.template.slice(0, 700), literals: options }, questions);
  const out = {};
  for (const slot of Object.keys(h.params)) {
    const a = res.answers[`${slot}_a`], b = res.answers[`${slot}_b`];
    if (!a || !b) continue;
    out[slot] = a.choice === b.choice ? { pick: a.choice, confidence: Math.min(a.confidence, b.confidence) } : { pick: null, confidence: 0 };
  }
  return out;
}

const rows = [];
let next = 0;
async function worker() {
  while (next < sample.length) {
    const { q, h, store } = sample[next++];
    const literals = extractValues(q.text);
    const truth = {};
    for (const [slot, p] of Object.entries(h.params)) {
      const t = truthFor(slot, p, h, q, literals);
      if (t !== undefined) truth[slot] = t;
    }
    // One literal cannot be the truth of TWO slots ("the only part named" given to both
    // of a two-part procedure's blanks): keep it where the example equals it, else drop both.
    const claimed = {};
    for (const [slot, t] of Object.entries(truth)) if (t !== 'none') (claimed[t] ??= []).push(slot);
    for (const [ref, slots] of Object.entries(claimed)) {
      if (slots.length < 2) continue;
      const text = literals.find((l) => l.ref === ref)?.text ?? '';
      const exact = slots.filter((sl) => norm(h.params[sl].example) === norm(text));
      for (const sl of slots) if (exact.length !== 1 || sl !== exact[0]) delete truth[sl];
    }
    let jev = {};
    try {
      jev = await askJev(q, h, literals);
    } catch (e) {
      jev = { error: String(e).slice(0, 80) };
    }
    const base = Object.fromEntries(Object.entries(h.params).map(([slot, p]) => [slot, baselineFor(p, literals)]));
    const code = Object.fromEntries(Object.entries(h.params).map(([slot, p]) => [slot, GENERIC2 ? generic2(slot, p, h, q, literals) : CUE ? cueBind(slot, p, h, q, literals) : baselineFor(p, literals, true)]));
    // With --cue, a Jev pick must at least have the SHAPE of the value the blank was recorded with.
    if (CUE || GENERIC2) for (const [slot, j] of Object.entries(jev)) {
      if (!j?.pick || j.pick === 'none') continue;
      const lit = literals.find((l) => l.ref === j.pick);
      if (lit && genericShape(lit.text) !== genericShape(h.params[slot]?.example ?? '')) jev[slot] = { pick: null, confidence: 0, vetoed: true };
    }
    rows.push({ q, h, store, literals, truth, jev, base, code });
  }
}
await Promise.all(Array.from({ length: 10 }, worker));

// --- scoring ------------------------------------------------------------------------
const totalSlots = rows.reduce((n, r) => n + Object.keys(r.h.params).length, 0);
const scorable = rows.reduce((n, r) => n + Object.keys(r.truth).length, 0);
console.log(`pairs ${rows.length}; slots ${totalSlots}, with a derivable truth ${scorable} (${Math.round((100 * scorable) / totalSlots)}%), of which truth=none ${rows.reduce((n, r) => n + Object.values(r.truth).filter((t) => t === 'none').length, 0)}`);

function score(decide, label) {
  let right = 0, wrong = 0, deferred = 0, skillsAll = 0, skillsWrong = 0, skillsScorable = 0;
  for (const r of rows) {
    const slots = Object.keys(r.truth);
    if (!slots.length) continue;
    skillsScorable++;
    let ok = true, bad = false;
    for (const slot of slots) {
      const d = decide(r, slot); // a literal ref, 'none', or null (= defer)
      if (d === null) { deferred++; ok = false; }
      else if (d === r.truth[slot]) right++;
      else { wrong++; ok = false; bad = true; }
    }
    if (ok) skillsAll++;
    if (bad) skillsWrong++;
  }
  console.log(`${label.padEnd(16)} slots: right ${right}  WRONG ${wrong}  deferred ${deferred}  | skills: every slot right ${skillsAll}/${skillsScorable} (${Math.round((100 * skillsAll) / skillsScorable)}%), at least one WRONG slot ${skillsWrong} (${(100 * skillsWrong / skillsScorable).toFixed(1)}%)`);
}
for (const g of [0.5, 0.6, 0.7, 0.8, 0.9]) score((r, slot) => (r.jev[slot]?.pick && r.jev[slot].confidence >= g ? r.jev[slot].pick : null), `Jev >=${g.toFixed(2)}`);
score((r, slot) => r.base[slot], 'baseline');
score((r, slot) => r.code[slot], 'code only');
console.log('\nCascade — code decides a slot with one candidate of the right shape (or none); Jev only the rest:');
for (const g of [0.5, 0.6, 0.7, 0.8]) score((r, slot) => r.code[slot] ?? (r.jev[slot]?.pick && r.jev[slot].confidence >= g ? r.jev[slot].pick : null), `code + Jev>=${g.toFixed(2)}`);
score((r, slot) => r.code[slot] ?? r.base[slot], 'code + overlap');

const bad = [];
for (const r of rows) for (const slot of Object.keys(r.truth)) {
  const j = r.jev[slot];
  if (j?.pick && j.confidence >= 0.8 && j.pick !== r.truth[slot]) bad.push({ r, slot, j });
}
console.log(`\nJev's wrong slots at >=0.80 (${bad.length}) — audit the TRUTH as much as Jev:`);
const lit = (r, ref) => (ref === 'none' ? 'none' : JSON.stringify(r.literals.find((l) => l.ref === ref)?.text));
for (const { r, slot, j } of bad.slice(0, 14)) {
  console.log(`  ${j.confidence.toFixed(2)} {{${slot}}} recorded ${JSON.stringify(r.h.params[slot].example)}: Jev ${lit(r, j.pick)}, truth ${lit(r, r.truth[slot])}\n        template: ${r.h.template.slice(0, 120)}\n        instruction: ${r.q.text.slice(0, 120)}`);
}
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(rows.map((r) => ({ q: r.q.text, template: r.h.template, params: r.h.params, literals: r.literals, truth: r.truth, jev: r.jev, base: r.base, code: r.code })), null, 1));
