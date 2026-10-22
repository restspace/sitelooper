// A stand-in for bin/sitelooper.js in test/mcp-server.test.ts: echoes its
// argv, stdin and cwd as JSON on stdout. Tokens anywhere in argv or stdin
// steer it: exit=N (exit code), sleep=MS (delay before answering),
// progress=N (N progress lines on stderr), leak (print TEST_FAKE_API_KEY).
// STUB_PIDFILE, when set, receives its pid.
import fs from 'node:fs';

const argv = process.argv.slice(2);
const stdin = argv.includes('--stdin') ? fs.readFileSync(0, 'utf8') : null;
const all = [...argv, stdin ?? ''].join(' ');
const code = Number(/exit=(\d)/.exec(all)?.[1] ?? 0);
const sleep = Number(/sleep=(\d+)/.exec(all)?.[1] ?? 0);
const progress = Number(/progress=(\d+)/.exec(all)?.[1] ?? 0);
if (process.env.STUB_PIDFILE) fs.writeFileSync(process.env.STUB_PIDFILE, String(process.pid));

for (let i = 0; i < progress; i++) process.stderr.write(`  · step ${i + 1}\n`);
if (sleep) await new Promise((r) => setTimeout(r, sleep));

const out = { argv, stdin, cwd: process.cwd(), outcome: code === 0 ? 'stubbed' : 'stub-failed' };
const shot = argv.indexOf('screenshot');
if (shot >= 0) {
  // 1x1 transparent PNG
  fs.writeFileSync(argv[shot + 1], Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
  out.path = argv[shot + 1];
}
if (all.includes('leak')) out.leaked = process.env.TEST_FAKE_API_KEY;
process.stdout.write(JSON.stringify(out) + '\n');
if (code) process.stderr.write(`sitelooper: stub failure ${code}\n`);
process.exit(code);
