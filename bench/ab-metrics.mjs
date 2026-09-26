#!/usr/bin/env node
/**
 * ab-metrics — one row of recording/replay/compile measures per sweep, for an
 * A/B between two arms of the recording model (bench/sweep-prompts/vision-ab.md).
 *
 * Reads only published files, so it runs anywhere a results branch can be read:
 *   <base>-n1-script.jsonl                 steps, evals, failed actions, screenshot steps
 *   <base>-n1-trace.jsonl                  every inner tool call: screenshots, images shown/withheld, repeated clicks
 *   <base>-n1-timing.jsonl                 inner model calls per instruction (the recording's turns)
 *   <base>-n1-sitelooper-transcript.jsonl  each `do`'s status line ([OK] / [BLOCKED] / …)
 *   <base>-n1-sitelooper-result.json       inner tokens by model and the backends that served them
 *   <base>-n{2,3}-flowrun.json             replay turns and tiers
 *   <base>-spec-spec-result.json           the compiled script
 *   <base>-sweep.json / <base>-sweep.log   total_usd per run, verifier summaries
 *   <base>-skills/<origin>/site-facts.json observed site facts (notes/design/design-site-facts.md)
 *   <base>-skills/shadow.jsonl             shadow rows, one per consumer decision, rule-prefixed
 *                                           ("facts.<consumer>" rows are the site-facts ones)
 *
 * Usage:
 *   node bench/ab-metrics.mjs --dir bench/results-published --base vgt1v [--base vgt1n ...] [--json]
 *
 * Cost: `total_usd` is the sweep's own figure (orchestrator + inner, priced from
 * bench/rates.json); `inner_usd` prices the inner model's tokens alone from
 * rates.json, image tokens included (OpenRouter bills them as prompt tokens).
 * Both are rate-table figures: check `served` holds only the pinned backend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rates = JSON.parse(fs.readFileSync(path.join(HERE, 'rates.json'), 'utf8'));

function parseArgs(argv) {
  const out = { dir: 'bench/results-published', bases: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') out.dir = argv[++i];
    else if (argv[i] === '--base') out.bases.push(argv[++i]);
    else if (argv[i] === '--json') out.json = true;
    else throw new Error(`unknown option ${argv[i]}`);
  }
  if (!out.bases.length) throw new Error('pass --base <runid base> (repeatable)');
  return out;
}

const readJsonl = (file) =>
  fs.existsSync(file)
    ? fs
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
        .filter(Boolean)
    : null;
const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
const GESTURES = new Set(['click', 'dblclick', 'modifier_click', 'right_click']);

// site facts (notes/design/design-site-facts.md, design-site-facts-stage0-contract.md Piece E):
// reliable = no live contradiction, and either a structural proof (hard) or
// confirmed across 2+ sessions (soft) — execution/facts.ts `reliable()`, copied
// rather than imported so this script stays a plain node script.
const factReliable = (f) => f.contra === 0 && (f.hard || (f.sessions ?? []).length >= 2);

/** Every `<origin>/site-facts.json` under a published skills store, or []. */
function readSiteFacts(storeDir) {
  const out = [];
  if (!storeDir || !fs.existsSync(storeDir)) return out;
  for (const name of fs.readdirSync(storeDir)) {
    const originDir = path.join(storeDir, name);
    if (!fs.statSync(originDir).isDirectory()) continue;
    const sf = readJson(path.join(originDir, 'site-facts.json'));
    if (sf && Array.isArray(sf.facts)) out.push(sf);
  }
  return out;
}

/** `<storeDir>/shadow.jsonl` rows whose rule starts with `facts.`, or []. */
function readFactShadowRows(storeDir) {
  if (!storeDir) return [];
  const rows = readJsonl(path.join(storeDir, 'shadow.jsonl'));
  return (rows ?? []).filter((r) => typeof r.rule === 'string' && r.rule.startsWith('facts.'));
}

function price(provider, model, u) {
  const r = rates[provider]?.[model];
  if (!r || !u) return null;
  return ((u.promptTokens - (u.cachedTokens ?? 0)) * r.input + (u.cachedTokens ?? 0) * (r.cacheRead ?? r.input) + u.completionTokens * r.output) / 1e6;
}

function metrics(dir, base) {
  const f = (suffix) => path.join(dir, `${base}${suffix}`);
  const row = { base };

  const script = readJsonl(f('-n1-script.jsonl'));
  if (script) {
    const steps = script.filter((e) => e.k === 'step');
    row.rec_steps = steps.length;
    row.rec_evals = steps.filter((s) => s.tool === 'eval').length;
    row.rec_failed_steps = steps.filter((s) => s.failed).length;
    row.rec_screenshot_steps = steps.filter((s) => s.tool === 'screenshot').length;
    // The sourcing hold (SITELOOPER_SOURCING_HOLD): how often it fired, how
    // often the retry answered with a labelled read, and how often the model
    // changed data after it instead (RecordedReport.sourcingAsk).
    const holds = script.filter((e) => e.k === 'report' && e.sourcingAsk).map((e) => e.sourcingAsk);
    row.rec_sourcing_holds = holds.length;
    row.rec_sourcing_labelled = holds.filter((h) => (h.labelled ?? []).length > 0).length;
    row.rec_sourcing_gestures_after = holds.reduce((n, h) => n + (h.gesturesAfter ?? []).length, 0);
  }

  const trace = readJsonl(f('-n1-trace.jsonl'));
  if (trace) {
    const calls = trace.filter((t) => t.by !== 'jev' && t.tool !== '(evidence)');
    let shots = 0;
    for (const t of calls) {
      if (t.tool === 'screenshot') shots++;
      if (t.tool === 'batch') for (const s of t.args?.steps ?? []) if (s?.tool === 'screenshot') shots++;
    }
    row.rec_tool_calls = calls.length;
    row.rec_screenshots = shots;
    row.images_shown = calls.filter((t) => /\[image attached below\]|\[screenshot after this action attached below\]/.test(t.result ?? '')).length;
    row.images_withheld = calls.filter((t) => /\[image withheld/.test(t.result ?? '')).length;
    row.eval_refusals = calls.filter((t) => t.tool === 'eval' && /eval is read-only/.test(t.result ?? '')).length;
    // The same gesture on the same target as the previous gesture, the model
    // clicking again because it could not tell the first one worked.
    let repeats = 0;
    let last = null;
    for (const t of calls) {
      if (!GESTURES.has(t.tool)) continue;
      const key = `${t.tool} ${JSON.stringify(t.args ?? {})}`;
      if (key === last) repeats++;
      last = key;
    }
    row.rec_repeated_clicks = repeats;
  }

  const timing = readJsonl(f('-n1-timing.jsonl'));
  if (timing) {
    row.rec_instructions = timing.length;
    row.rec_model_calls = timing.reduce((n, t) => n + (t.modelCalls ?? 0), 0);
    row.rec_model_ms = timing.reduce((n, t) => n + (t.modelMs ?? 0), 0);
    row.rec_wall_ms = timing.reduce((n, t) => n + (t.totalMs ?? 0), 0);
  }

  const transcript = readJsonl(f('-n1-sitelooper-transcript.jsonl'));
  if (transcript) {
    const dos = transcript.filter((e) => e.k === 'cmd' && /\bsitelooper do\b/.test(e.cmd ?? ''));
    // [OK] / [BLOCKED] / [FAILURE] …; a command that died before its report (an HTTP 402, a crash) is ERR.
    const status = (e) => /^\[(\w+)\]/.exec(e.out ?? '')?.[1] ?? 'ERR';
    row.rec_dos = dos.length;
    row.rec_blocked = dos.filter((e) => !['OK', 'ERR'].includes(status(e))).length;
    row.rec_errors = dos.filter((e) => status(e) === 'ERR').length;
    row.rec_statuses = dos.map(status).join(',');
  }

  const result = readJson(f('-n1-sitelooper-result.json'));
  if (result) {
    const byModel = result.inner?.byModel ?? {};
    row.inner_models = Object.fromEntries(Object.entries(byModel).map(([m, u]) => [m, u.instructions]));
    let usd = 0;
    let priced = true;
    for (const [m, u] of Object.entries(byModel)) {
      const p = price(result.provider === 'openrouter' || !result.provider ? 'openrouter' : result.provider, m, u);
      if (p === null) priced = false;
      else usd += p;
    }
    row.inner_usd = priced ? +usd.toFixed(4) : null;
    row.inner_prompt_tokens = result.inner?.promptTokens ?? null;
    row.inner_cached_tokens = result.inner?.cachedTokens ?? null;
    row.served = result.inner?.servedByModel ?? null;
    row.or_reported_usd = result.orReportedCostUsd ?? null;
  }

  for (const n of [2, 3]) {
    const fr = readJson(f(`-n${n}-flowrun.json`));
    if (!fr) continue;
    row[`n${n}_status`] = fr.status;
    row[`n${n}_turns`] = (fr.steps ?? []).reduce((a, s) => a + (s.turns ?? 0), 0);
    row[`n${n}_tiers`] = (fr.steps ?? []).map((s) => s.tier ?? '-').join('');
    row[`n${n}_fell_back`] = (fr.steps ?? []).filter((s) => s.fellBack || s.recovered).length;
  }

  const spec = readJson(f('-spec-spec-result.json'));
  if (spec) row.compiled = spec.compiled === false ? 'not compiled' : `exit ${spec.exitCode} ${spec.stats?.passed ?? '?'}/${spec.stats?.total ?? '?'} drift ${(spec.tests ?? []).reduce((a, t) => a + (t.drift?.length ?? 0), 0)}`;

  const sweep = readJson(f('-sweep.json'));
  if (sweep) {
    for (const r of sweep.rows ?? []) {
      row[`n${r.n}_verified`] = r.verified;
      row[`n${r.n}_usd`] = r.total_usd;
    }
    row.total_usd = +(sweep.rows ?? []).reduce((a, r) => a + (r.total_usd ?? 0), 0).toFixed(4);
  }
  if (fs.existsSync(f('-spec-verify.log'))) {
    const log = fs.readFileSync(f('-spec-verify.log'), 'utf8');
    row.spec_objectives = /objectives passed (\S+)/.exec(log)?.[1] ?? log.split('\n').filter((l) => /obj \d+: (PASS|FAIL)/.test(l)).map((l) => (/PASS/.test(l) ? 'P' : 'F')).join('');
  }

  const storeDir = f('-skills');
  if (fs.existsSync(storeDir)) {
    const facts = readSiteFacts(storeDir).flatMap((sf) => sf.facts);
    row.facts_written = facts.length;
    row.facts_hard = facts.filter((fc) => fc.hard).length;
    row.facts_soft = facts.filter((fc) => !fc.hard).length;
    row.facts_relied = facts.filter(factReliable).length;
    const shadow = readFactShadowRows(storeDir);
    row.facts_shadow_rows = shadow.length;
    row.facts_agree = shadow.filter((r) => r.agree).length;
    row.facts_disagree = shadow.filter((r) => !r.agree).length;
  }
  return row;
}

const opts = parseArgs(process.argv.slice(2));
const rows = opts.bases.map((b) => metrics(opts.dir, b));
if (opts.json) console.log(JSON.stringify(rows, null, 2));
else for (const r of rows) console.log(Object.entries(r).map(([k, v]) => `${k}=${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`).join('  '));
