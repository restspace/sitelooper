#!/usr/bin/env node
/**
 * facts-report — the stage 0 exit review for one published skills store
 * (notes/design/design-site-facts.md, notes/design/site-facts-stage0-contract.md Piece E).
 *
 * Prints every fact of every origin under a skills store (`<origin>/site-facts.json`,
 * src/execution/facts.ts's `Fact` shape) with its n/sessions/contra/hard, and every
 * `facts.*` shadow disagreement (`<store>/shadow.jsonl`, src/skills/shadow.ts's
 * `ShadowRow`, rule prefixed `facts.`) with its evidence. A store with no
 * site-facts.json and no facts.* shadow rows prints zero rows for each section,
 * never an error — most published stores predate this feature.
 *
 * Usage:
 *   node bench/facts-report.mjs <skills dir>
 *   node bench/facts-report.mjs --dir bench/results-published --base fwod91 [--base ...] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = { dirs: [], dir: 'bench/results-published', bases: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') out.dir = argv[++i];
    else if (argv[i] === '--base') out.bases.push(argv[++i]);
    else if (argv[i] === '--json') out.json = true;
    else out.dirs.push(argv[i]);
  }
  if (!out.dirs.length && !out.bases.length) throw new Error('pass a <skills dir>, or --dir <dir> --base <runid> (repeatable)');
  return out;
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const readJsonl = (file) => {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

/** Every `<origin>/site-facts.json` under a store, as `{origin, facts: Fact[]}` pairs. */
function readSiteFacts(storeDir) {
  const out = [];
  if (!storeDir || !fs.existsSync(storeDir)) return out;
  for (const name of fs.readdirSync(storeDir)) {
    const originDir = path.join(storeDir, name);
    if (!fs.statSync(originDir).isDirectory()) continue;
    const sf = readJson(path.join(originDir, 'site-facts.json'));
    if (sf && Array.isArray(sf.facts)) out.push({ origin: sf.origin ?? name, facts: sf.facts });
  }
  return out;
}

function readFactShadowRows(storeDir) {
  if (!storeDir) return [];
  return readJsonl(path.join(storeDir, 'shadow.jsonl')).filter((r) => typeof r.rule === 'string' && r.rule.startsWith('facts.'));
}

/**
 * One evidence item, printed. Piece D3's convention (D1 aligning to it) is a
 * JSON string of `{k, key, v, reliable}` per item; anything else (an older or
 * unaligned consumer's plain string) prints as-is rather than failing the report.
 */
function formatEvidenceItem(item) {
  if (typeof item !== 'string' || !item.startsWith('{')) return String(item);
  let parsed;
  try {
    parsed = JSON.parse(item);
  } catch {
    return item;
  }
  const v = typeof parsed.v === 'object' ? JSON.stringify(parsed.v) : parsed.v;
  return `k=${parsed.k} key=${parsed.key} v=${v} reliable=${parsed.reliable}`;
}

function report(storeDir) {
  const origins = readSiteFacts(storeDir);
  const shadow = readFactShadowRows(storeDir);
  const disagreements = shadow.filter((r) => !r.agree);
  const applied = shadow.filter((r) => r.applied === true);
  return { storeDir, origins, shadow, disagreements, applied };
}

/** A shadow row's `applied` suffix, printed only when the field is present (stage 1+ rows). */
function appliedSuffix(r) {
  return r.applied === undefined ? '' : `  applied=${r.applied}`;
}

/**
 * A `value.class` = 'seed' fact's key is `valueHash(name)` — never the
 * name itself (design-site-facts.md §1: "the store never holds a name in
 * the clear"). Even so, stage 4's contract asks the report never to print
 * more than a handful of these hashes in one line, and never to print a
 * seed VALUE (the store holds none): seed facts are summarised as a count
 * per origin, with at most 5 sample hashes, instead of one line each like
 * every other fact kind.
 */
const isSeedFact = (fc) => fc.k === 'value.class' && fc.v === 'seed';

function printReport({ storeDir, origins, shadow, disagreements, applied }) {
  console.log(`== ${storeDir} ==`);
  const totalFacts = origins.reduce((n, o) => n + o.facts.length, 0);
  console.log(`facts: ${totalFacts} across ${origins.length} origin(s)`);
  for (const { origin, facts } of origins) {
    const seedFacts = facts.filter(isSeedFact);
    const rest = facts.filter((fc) => !isSeedFact(fc));
    for (const fc of [...rest].sort((a, b) => (a.k === b.k ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.k < b.k ? -1 : 1))) {
      // value.role facts print like every other kind: <key> v=<role>, plus
      // the usual n/sessions/contra/hard columns.
      const v = typeof fc.v === 'object' ? JSON.stringify(fc.v) : fc.v;
      console.log(
        `  ${origin}  ${fc.k}  ${fc.key}  v=${v}  n=${fc.n}  sessions=${(fc.sessions ?? []).length}  contra=${fc.contra}  hard=${fc.hard}`,
      );
    }
    if (seedFacts.length) {
      const sample = seedFacts.slice(0, 5).map((fc) => fc.key);
      console.log(`  ${origin}  value.class  seed  count=${seedFacts.length}  sample=[${sample.join(', ')}]`);
    }
  }
  console.log(`shadow (facts.*): ${shadow.length} rows, ${disagreements.length} disagreement(s), ${applied.length} applied`);
  // Per-rule tallies alongside the totals above (facts.role / facts.seed are
  // stage 4's new rules; every other facts.* rule from earlier stages prints
  // the same way).
  const ruleNames = [...new Set(shadow.map((r) => r.rule))].sort();
  for (const rule of ruleNames) {
    const rows = shadow.filter((r) => r.rule === rule);
    const dis = rows.filter((r) => !r.agree);
    const app = rows.filter((r) => r.applied === true);
    console.log(`  ${rule}: ${rows.length} rows, ${dis.length} disagreement(s), ${app.length} applied`);
  }
  for (const r of disagreements) {
    const evidence = Array.isArray(r.evidence) ? r.evidence.map(formatEvidenceItem).join(' | ') : String(r.evidence ?? '');
    console.log(`  DISAGREE ${r.rule}  fact=${r.fact}  heuristic=${r.heuristic}  evidence=[${evidence}]${appliedSuffix(r)}`);
  }
  for (const r of applied) {
    const evidence = Array.isArray(r.evidence) ? r.evidence.map(formatEvidenceItem).join(' | ') : String(r.evidence ?? '');
    console.log(`  APPLIED ${r.rule}  fact=${r.fact}  heuristic=${r.heuristic}  agree=${r.agree}  evidence=[${evidence}]`);
  }
}

const opts = parseArgs(process.argv.slice(2));
const stores = opts.dirs.length ? opts.dirs : opts.bases.map((b) => path.join(opts.dir, `${b}-skills`));
const reports = stores.map(report);
if (opts.json) console.log(JSON.stringify(reports, null, 2));
else for (const r of reports) printReport(r);
