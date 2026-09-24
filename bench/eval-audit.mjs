#!/usr/bin/env node
/**
 * eval-audit — what the recording model does through `eval`, measured over
 * published n1 recordings, with no sweep and no browser.
 *
 * The recorder records every eval (compile then drops it), so the published
 * `*-n1-script.jsonl` files are the full population. This reports:
 *  - how many steps and instructions use eval, per app;
 *  - what the evals were for (a heuristic category from the expression text);
 *  - which expressions the CURRENT guard (dist/agent/tools.js evalMutation)
 *    refuses: every refusal is listed, so a new pattern's false blocks show up
 *    as read-only expressions in that list;
 *  - reads that returned nothing and were followed by an eval (the fwgt10 path);
 *  - gotos to a record-addressed url nothing before them showed, with an eval
 *    in the three steps before (the fwsi7 path; ledger.ts unseenGotoParts);
 *  - once recordings carry RecordedStep.evalResult: reported values that an
 *    eval returned and no read of the instruction did.
 *
 * Usage:
 *   npm run build   # the guard and unseenGotoParts are imported from dist/
 *   node bench/eval-audit.mjs --dir <dir of *-n1-script.jsonl> [--list blocked,goto,empty,sourced] [--json]
 *   node bench/eval-audit.mjs --from-git [--out-dir <dir>] ...   # extract them first
 *
 * --from-git reads every `bench/results-published/*-n1-script.jsonl` and
 * `bench/fixtures/recordings/*-n1-script.jsonl` on every origin/results/*
 * branch (first copy of each file name wins), with `git ls-tree`/`cat-file`
 * only: results branches are never checked out. Slow (~10 min for ~800
 * branches); pass --out-dir to keep the extraction for later --dir runs.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

function parseArgs(argv) {
  const out = { dir: null, fromGit: false, outDir: null, list: new Set(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') out.dir = argv[++i];
    else if (a === '--from-git') out.fromGit = true;
    else if (a === '--out-dir') out.outDir = argv[++i];
    else if (a === '--list') for (const x of String(argv[++i]).split(',')) out.list.add(x.trim());
    else if (a === '--json') out.json = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!out.dir && !out.fromGit) throw new Error('pass --dir <dir> or --from-git');
  return out;
}

const git = (...args) => {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

function extractFromGit(dest) {
  fs.mkdirSync(dest, { recursive: true });
  const branches = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/results').split('\n').filter(Boolean);
  for (const b of branches) {
    const tree = spawnSync('git', ['ls-tree', '-r', b, 'bench/results-published', 'bench/fixtures/recordings'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    for (const line of (tree.stdout ?? '').split('\n')) {
      const m = /^\S+ blob (\S+)\t(.*-n1-script\.jsonl)$/.exec(line);
      if (!m) continue;
      const file = path.join(dest, path.basename(m[2]));
      if (fs.existsSync(file)) continue;
      fs.writeFileSync(file, git('cat-file', '-p', m[1]));
    }
  }
  return dest;
}

/** A heuristic purpose, first match wins. Boundaries are ±10%: it reads the expression, not the result. */
function category(x) {
  if (/\.(id|name|className)\s*=(?!=)|dataset\.[\w$]+\s*=(?!=)/.test(x)) return 'mutate:identity';
  if (/window\.open\s*\(|location\.(href|hash)\s*=(?!=)|location\.(assign|replace|reload)\s*\(|history\.(push|replace|back|go)/.test(x)) return 'mutate:navigate';
  if (/\.(click|submit|requestSubmit)\s*\(|dispatchEvent/.test(x)) return 'mutate:click/event';
  if (/\.(value|checked|selectedIndex)\s*=(?!=)/.test(x)) return 'mutate:value';
  if (/\.(innerHTML|outerHTML|textContent|innerText)\s*=(?!=)|\.(remove|removeChild|appendChild|insertBefore|replaceWith|setAttribute|removeAttribute)\s*\(|window\.__\w+\s*=|window\.fetch\s*=/.test(x)) return 'mutate:dom/instrument';
  if (/\bfetch\s*\(|XMLHttpRequest|\$\.(get|post|ajax)/.test(x)) return 'network';
  if (/__NUXT__|__NEXT_DATA__|window\.(Ember|require|odoo|Vue|app|Espo)\b|\bodoo\.|__vue__|__react|localStorage|sessionStorage|monaco\.|jQuery/.test(x)) return 'app-internals';
  if (/scrollIntoView|scrollTo|scrollBy|scrollTop\s*=|\.focus\s*\(|\.blur\s*\(/.test(x)) return 'scroll/focus';
  if (/new Date\(|Intl\./.test(x) && !/querySelector/.test(x)) return 'clock';
  if (/^\s*\(?\s*(window\.|document\.)?(location|URL|title)\b[\w.]*\s*\)?\s*;?\s*$/.test(x)) return 'url/title';
  if (/document\.body\.(innerText|textContent)/.test(x)) return 'read:page-text';
  if (/outerHTML|innerHTML|tagName|className|classList|\.attributes\b|getAttribute\(\s*['"](class|id|role|type|name|aria-[\w-]+|data-[\w-]+|placeholder|contenteditable)['"]|\bid\s*:|offsetParent|getBoundingClientRect|getComputedStyle|disabled|readOnly|\.type\b/.test(x)) return 'probe:structure';
  if (/querySelectorAll|\.map\s*\(|Array\.from|\[\.\.\./.test(x)) return 'read:list';
  if (/querySelector\s*\(|getElementById|innerText|textContent|\.value\b|getAttribute/.test(x)) return 'read:one';
  return 'other';
}

const fold = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
const appOf = (run) => run.replace(/^fw/, '').replace(/[0-9].*/, '');
const EMPTY = new Set(['[]', '""', '0', '']);

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dir = opts.fromGit ? extractFromGit(opts.outDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'eval-audit-'))) : opts.dir;
  const dist = (p) => pathToFileURL(path.join(REPO, 'dist', p)).href;
  if (!fs.existsSync(path.join(REPO, 'dist', 'agent', 'tools.js'))) throw new Error('run npm run build first');
  const { evalMutation } = await import(dist('agent/tools.js'));
  const { unseenGotoParts } = await import(dist('skills/ledger.js'));

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('-n1-script.jsonl')).sort();
  const byApp = {};
  const byCategory = {};
  const blocked = [];
  const seenExpr = new Set();
  const emptyThenEval = [];
  const gotos = [];
  const sourcedByEval = [];
  const totals = { recordings: files.length, steps: 0, evals: 0, distinctEvals: 0, instructions: 0, instructionsWithEval: 0, reads: 0, emptyReads: 0, evalsWithResult: 0 };

  for (const f of files) {
    const run = f.replace(/-n1-script\.jsonl$/, '');
    const entries = fs
      .readFileSync(path.join(dir, f), 'utf8')
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
    const app = (byApp[appOf(run)] ??= { recordings: 0, withEval: 0, steps: 0, evals: 0, instructions: 0, instructionsWithEval: 0 });
    app.recordings++;
    let runEvals = 0;
    let group = null;
    const groups = [];
    entries.forEach((e, i) => {
      if (e.k === 'instruction') {
        if (!e.resume || !group) groups.push((group = { text: e.text ?? '', steps: [], reports: [] }));
        return;
      }
      if (!group) return;
      if (e.k === 'report') group.reports.push(e);
      if (e.k !== 'step') return;
      group.steps.push({ e, i });
      totals.steps++;
      app.steps++;
      if ((e.tool === 'read' || e.tool === 'read_all') && e.args?.target !== '(read-back)') {
        totals.reads++;
        if (EMPTY.has(String(e.result ?? '').trim())) {
          totals.emptyReads++;
          const next = entries.slice(i + 1).find((x) => x.k === 'step' || x.k === 'instruction');
          if (next?.k === 'step' && next.tool === 'eval') emptyThenEval.push(`${run}: ${e.tool} ${JSON.stringify(e.args.target)} -> eval ${String(next.args.expression).slice(0, 100)}`);
        }
      }
      if (e.tool === 'goto') {
        const url = String(e.args?.url ?? '');
        const unseen = unseenGotoParts(url, entries.slice(0, i));
        const prev = [];
        for (let j = i - 1; j >= 0 && prev.length < 3; j--) {
          if (entries[j].k === 'instruction' && !entries[j].resume) break;
          if (entries[j].k === 'step') prev.push(entries[j]);
        }
        if (unseen.length && prev.some((p) => p.tool === 'eval')) gotos.push(`${run}: goto ${url} (unseen ${unseen.map((p) => p.value).join(',')}; linkedFrom ${e.linkedFrom ? 'yes' : 'no'})`);
      }
      if (e.tool !== 'eval') return;
      const x = String(e.args?.expression ?? '');
      totals.evals++;
      app.evals++;
      runEvals++;
      if (typeof e.evalResult === 'string') totals.evalsWithResult++;
      const c = category(x);
      const cat = (byCategory[c] ??= { evals: 0, recordings: new Set() });
      cat.evals++;
      cat.recordings.add(run);
      if (seenExpr.has(x)) return;
      seenExpr.add(x);
      const why = evalMutation(x);
      if (why) blocked.push({ run, why, category: c, expression: x });
    });
    for (const g of groups) {
      totals.instructions++;
      app.instructions++;
      const evals = g.steps.filter(({ e }) => e.tool === 'eval');
      if (evals.length) {
        totals.instructionsWithEval++;
        app.instructionsWithEval++;
      }
      const results = evals.map(({ e }) => e.evalResult).filter((r) => typeof r === 'string').map(fold);
      if (!results.length) continue;
      const reads = g.steps
        .filter(({ e }) => e.tool !== 'eval')
        .flatMap(({ e }) => [e.result ?? '', e.diff ? JSON.stringify(e.diff) : ''])
        .map(fold);
      for (const r of g.reports) {
        if (r.status !== 'success') continue;
        for (const [k, v] of Object.entries(r.values ?? {})) {
          const fv = fold(v);
          if (fv.length < 2 || fv.length > 80) continue;
          if (results.some((t) => t.includes(fv)) && !reads.some((t) => t.includes(fv))) sourcedByEval.push(`${run}: ${k}=${String(v).slice(0, 60)}`);
        }
      }
    }
    if (runEvals) app.withEval++;
  }
  totals.distinctEvals = seenExpr.size;
  const blockedByReason = {};
  for (const b of blocked) blockedByReason[b.why] = (blockedByReason[b.why] ?? 0) + 1;
  const report = {
    totals,
    byApp,
    byCategory: Object.fromEntries(Object.entries(byCategory).sort((a, b) => b[1].evals - a[1].evals).map(([k, v]) => [k, { evals: v.evals, recordings: v.recordings.size }])),
    guard: { refused: blocked.length, allowed: seenExpr.size - blocked.length, byReason: blockedByReason },
    emptyReadThenEval: emptyThenEval.length,
    unseenGotoAfterEval: gotos.length,
    reportedValuesOnlyAnEvalReturned: sourcedByEval.length,
  };
  if (opts.json) {
    console.log(JSON.stringify({ ...report, blocked: opts.list.has('blocked') ? blocked : undefined, gotos: opts.list.has('goto') ? gotos : undefined, emptyThenEval: opts.list.has('empty') ? emptyThenEval : undefined, sourcedByEval: opts.list.has('sourced') ? sourcedByEval : undefined }, null, 2));
    return;
  }
  const t = totals;
  const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
  console.log(`recordings ${t.recordings}: ${t.evals} evals in ${t.steps} steps (${pct(t.evals, t.steps)}), ${t.distinctEvals} distinct; ${t.instructionsWithEval}/${t.instructions} instructions use eval`);
  console.log(`evals carrying evalResult: ${t.evalsWithResult}`);
  console.log('\napp  recordings(withEval)  evals/steps  instructions(withEval)');
  for (const [a, v] of Object.entries(byApp).sort()) console.log(`${a.padEnd(4)} ${v.recordings}(${v.withEval})  ${v.evals}/${v.steps} ${pct(v.evals, v.steps)}  ${v.instructions}(${v.instructionsWithEval})`);
  console.log('\ncategory: evals (recordings)');
  for (const [c, v] of Object.entries(report.byCategory)) console.log(`  ${c}: ${v.evals} (${v.recordings})`);
  console.log(`\nguard (dist evalMutation) over ${t.distinctEvals} distinct expressions: refuses ${blocked.length}, allows ${report.guard.allowed}`);
  for (const [why, n] of Object.entries(blockedByReason)) console.log(`  ${why}: ${n}`);
  console.log(`\nreads ${t.reads}, empty ${t.emptyReads}, followed by an eval ${emptyThenEval.length}`);
  console.log(`gotos to an unseen record with an eval in the 3 steps before: ${gotos.length}`);
  console.log(`reported values only an eval returned (needs evalResult): ${sourcedByEval.length}`);
  if (opts.list.has('blocked')) for (const b of blocked) console.log(`\nBLOCKED ${b.run} [${b.why}] (${b.category})\n  ${b.expression.slice(0, 300)}`);
  if (opts.list.has('goto')) console.log('\n' + gotos.join('\n'));
  if (opts.list.has('empty')) console.log('\n' + emptyThenEval.join('\n'));
  if (opts.list.has('sourced')) console.log('\n' + sourcedByEval.join('\n'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
