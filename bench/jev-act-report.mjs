#!/usr/bin/env node
/**
 * The acting actor's A/B, read off two recording sessions (PLAN-jev.md §4c step 7).
 *
 *   node bench/jev-act-report.mjs fwrdj7-n1 fwrdj8-n1     # model-only arm, then the acting arm
 *
 * Neither arm is the reference. What is compared is what the bench verifies
 * (bench/results/<runid>.json) and what each recording cost in time: model
 * calls, model ms, tool ms, and — for the acting arm — what Jev took, what the
 * tools said about it, and why it deferred when it did.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = process.env.SITELOOPER_HOME || path.join(os.homedir(), '.sitelooper');
const readJsonl = (file) =>
  fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

function arm(session) {
  const dir = path.join(home, 'sessions', session);
  const timing = readJsonl(path.join(dir, 'timing.jsonl'));
  const acts = readJsonl(path.join(dir, 'system-one.jsonl')).filter((r) => r.site === 'actor.act');
  const sum = (k) => timing.reduce((n, t) => n + (t[k] ?? 0), 0);
  const tools = {};
  for (const t of timing) for (const turn of t.turns ?? []) for (const name of turn.tools ?? []) tools[name] = (tools[name] ?? 0) + 1;
  const acted = acts.filter((r) => r.outcome === 'acted');
  const deferred = {};
  for (const r of acts.filter((r) => r.outcome === 'deferred')) {
    const why = String(r.why ?? '').replace(/\(.*\)/, '').replace(/".*"/, '"…"').trim();
    deferred[why] = (deferred[why] ?? 0) + 1;
  }
  return {
    session,
    instructions: timing.length,
    totalS: +(sum('totalMs') / 1000).toFixed(1),
    modelS: +(sum('modelMs') / 1000).toFixed(1),
    toolS: +(sum('toolMs') / 1000).toFixed(1),
    actorS: +(sum('actorMs') / 1000).toFixed(1),
    modelCalls: sum('modelCalls'),
    modelTools: tools,
    jevAsked: acts.length,
    jevActed: acted.length,
    jevActedOk: acted.filter((r) => r.verified === true).length,
    jevActedFailed: acted.filter((r) => r.verified === false).length,
    jevActs: acted.map((r) => `${r.detail?.tool} ${r.detail?.target} (${r.confidence.toFixed(2)})${r.verified === false ? ' FAILED' : ''}`),
    deferred,
  };
}

const sessions = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!sessions.length) {
  console.error('usage: node bench/jev-act-report.mjs <model-only-session> <acting-session>');
  process.exit(2);
}
const out = sessions.map(arm);
console.log(JSON.stringify(out, null, 2));
