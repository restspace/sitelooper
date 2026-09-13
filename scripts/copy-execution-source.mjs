import fs from 'node:fs';

// Ship the exact TypeScript checked by tsc, rather than a handwritten emitter
// translation or Function.toString() of JavaScript with its types erased.
const source = new URL('../src/execution/', import.meta.url);
const target = new URL('../dist/execution/source/', import.meta.url);
fs.mkdirSync(target, { recursive: true });
for (const name of fs.readdirSync(source).filter((name) => name.endsWith('.ts'))) {
  fs.copyFileSync(new URL(name, source), new URL(name, target));
}
