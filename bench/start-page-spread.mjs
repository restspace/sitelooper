#!/usr/bin/env node
/**
 * How often does a stored skill's START PAGE keep it from running? (notes/PLAN-jev.md §6.)
 *
 *   node bench/start-page-spread.mjs
 *
 * A skill replays without the model only from the page its recording started on
 * (`preconditions.urlPattern`, checked by matchTemplate and by the paraphrase matcher
 * alike). Where an instruction STARTS is an accident of where the previous one ended,
 * so the same objective is recorded from different pages in different runs. For every
 * RepairDesk store this lists, per objective, the start pages its chain heads were
 * recorded from — and the chance that two independent runs agree (sum of p^2), which is
 * the ceiling on a stored skill being eligible when the same request arrives in a new
 * session, whatever its wording.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OBJECTIVES = {
  signin: /(?<!already )(?<!currently )\bsign(?:ed)? in\b(?! as)|\blog ?in with\b/i,
  create: /\bcreate\b[^.]{0,60}\bticket\b/i,
  addpart: /\badd (?:a |an |another |a second |the |one )?(?:new |second )?part\b/i,
  editcost: /\bedit the part\b|\bchange (?:its|the) cost\b|\bcost (?:changes|from)\b/i,
  ready: /\b(?:change|changing|set|setting|mark|marking|switch|update)\b[^.]{0,60}(?:\bready\b|\bstatus to '?\{\{v\d+\}\})/i,
  delete: /(?<!not )(?<!n't )\bdelete\b|\bremove both parts\b/i,
  archive: /\barchive\b/i,
};
const labelOf = (t) => Object.entries(OBJECTIVES).filter(([, re]) => re.test(t)).map(([k]) => k).sort().join('+');
// A record id in the path is the same KIND of page whether the pattern kept it as :id or slotted it as {{vN}}.
const CONCRETE = process.argv.includes('--exact');
const page = (p) => {
  const t = String(p).replace(/^https?:\/\/[^/]+/, '') || '/';
  const kind = CONCRETE ? t : t.replace(/\{\{v\d+\}\}/g, ':id');
  return kind === '/' ? '/ (entry)' : kind;
};

const byLabel = {};
let stores = 0;
for (const dir of ['results', 'results-published'].map((d) => path.join(here, d)).filter((d) => fs.existsSync(d))) {
  for (const entry of fs.readdirSync(dir)) {
    const origin = path.join(dir, entry, 'http_127.0.0.1_4180');
    if (!/-skills$/.test(entry) || !fs.existsSync(origin)) continue;
    stores++;
    const seen = new Set();
    for (const f of fs.readdirSync(origin).filter((f) => /^s_.*\.json$/.test(f))) {
      let s;
      try {
        s = JSON.parse(fs.readFileSync(path.join(origin, f), 'utf8'));
      } catch {
        continue;
      }
      if (s.status === 'demoted' || (s.seq && s.seq.index > 0) || !s.template) continue;
      const label = labelOf(s.template);
      const key = `${label}|${s.preconditions?.urlPattern}`;
      if (!label || seen.has(key)) continue; // one vote per store per (objective, page)
      seen.add(key);
      ((byLabel[label] ??= {})[page(s.preconditions?.urlPattern)] ??= 0);
      byLabel[label][page(s.preconditions?.urlPattern)]++;
    }
  }
}
console.log(`${stores} RepairDesk stores\n`);
let weighted = 0, total = 0;
for (const [label, pages] of Object.entries(byLabel).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))) {
  const n = Object.values(pages).reduce((x, y) => x + y, 0);
  if (n < 4) continue;
  const agree = Object.values(pages).reduce((x, c) => x + (c / n) ** 2, 0);
  weighted += agree * n;
  total += n;
  console.log(`${label.padEnd(24)} n=${String(n).padStart(3)}  two runs start on the same page ${(100 * agree).toFixed(0)}%   ${Object.entries(pages).sort((a, b) => b[1] - a[1]).map(([p, c]) => `${p} x${c}`).join('   ')}`);
}
console.log(`\nweighted: ${(100 * weighted / total).toFixed(0)}% — the ceiling on a stored skill being ELIGIBLE when the same request arrives in a new session`);
