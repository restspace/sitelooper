// Replays a captured terminal log: prompt lines are "typed", output lines
// stream quickly. Every character shown was produced by the real run.
import fs from 'node:fs';
const [file, stopAt] = process.argv.slice(2);
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (s) => process.stdout.write(s);
const DIM = '\x1b[2m', GREEN = '\x1b[32m', BOLD = '\x1b[1m', RST = '\x1b[0m';
let first = true; let lastWasDo = false;
for (const raw of lines) {
  if (stopAt && raw.startsWith(stopAt)) break;
  let line = raw.replace(/C:.Users[^ ]*?scratchpad.gif./g, './');
  if (line.startsWith('$ ')) {
    if (!first) await sleep(700);
    first = false;
    out(`${GREEN}❯${RST} `);
    let cmd = line.slice(2); const d = cmd.indexOf(' do '); lastWasDo = d >= 0;
    if (lastWasDo) cmd = cmd.slice(0, d + 4) + '"' + cmd.slice(d + 4) + '"';
    for (const ch of cmd) { out(ch); await sleep(ch === ' ' ? 40 : 22); }
    await sleep(500); out('\n');
    continue;
  }
  const m = /^\[exit 0 after (\d+)s\]$/.exec(line);
  if (m) { if (lastWasDo) { out(`${DIM}  ↳ ${m[1]}s with the agent driving${RST}
`); await sleep(900); } continue; }
  if (line === '' ) { continue; }
  if (line.startsWith('[OK]')) { await sleep(400); out(`${BOLD}${line}${RST}\n`); await sleep(500); continue; }
  out(line + '\n'); await sleep(90);
}
