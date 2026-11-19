#!/usr/bin/env node
// Record GitHub clone and view traffic for the sitelooper repos before GitHub's
// 14-day window drops it. Safe to run as often as you like: daily rows are keyed
// by date and the latest fetch for a date wins (today's row fills in during the day).
//
//   node scripts/record-repo-traffic.mjs            # fetch and save
//   node scripts/record-repo-traffic.mjs --report   # print totals from the saved file
//
// Needs `gh` logged in with push access to the repos. Data file:
// $SITELOOPER_STATS (default ~/.sitelooper-stats/traffic.json).
//
// restspace/sitelooper-plugin is the plugin marketplace, so its unique cloners per
// day approximate plugin installs (auto-updates re-fetch, so daily uniques summed
// over time overcount returning users; the saved 14-day uniques undercount less).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const REPOS = ['restspace/sitelooper-plugin', 'restspace/sitelooper'];
const file = process.env.SITELOOPER_STATS ?? join(homedir(), '.sitelooper-stats', 'traffic.json');

const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { repos: {} };

if (process.argv.includes('--report')) {
  for (const [repo, r] of Object.entries(data.repos)) {
    const days = Object.keys(r.clones ?? {}).sort();
    const sum = (kind, key) => Object.values(r[kind] ?? {}).reduce((a, d) => a + d[key], 0);
    console.log(`${repo}  (${days[0] ?? '-'} .. ${days.at(-1) ?? '-'})`);
    console.log(`  clones: ${sum('clones', 'count')} total, ${sum('clones', 'uniques')} daily-unique sum`);
    console.log(`  views:  ${sum('views', 'count')} total, ${sum('views', 'uniques')} daily-unique sum`);
    const last = r.snapshots?.at(-1);
    if (last) console.log(`  last 14-day window (${last.at.slice(0, 10)}): ${last.clones.uniques} unique cloners, ${last.views.uniques} unique visitors`);
  }
  process.exit(0);
}

const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));

const at = new Date().toISOString();
for (const repo of REPOS) {
  const r = (data.repos[repo] ??= { clones: {}, views: {}, snapshots: [] });
  const clones = gh(`repos/${repo}/traffic/clones`);
  const views = gh(`repos/${repo}/traffic/views`);
  for (const d of clones.clones) r.clones[d.timestamp.slice(0, 10)] = { count: d.count, uniques: d.uniques };
  for (const d of views.views) r.views[d.timestamp.slice(0, 10)] = { count: d.count, uniques: d.uniques };
  r.snapshots.push({ at, clones: { count: clones.count, uniques: clones.uniques }, views: { count: views.count, uniques: views.uniques } });
  console.log(`${repo}: 14d clones ${clones.count} (${clones.uniques} unique), views ${views.count} (${views.uniques} unique)`);
}

mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`Saved ${file}`);
