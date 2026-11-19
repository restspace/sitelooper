#!/usr/bin/env node
// Copy plugin/ into the standalone marketplace repo (restspace/sitelooper-plugin).
// That repo exists so its GitHub clone count measures plugin installs on their own.
//
//   node scripts/sync-plugin-marketplace.mjs [path-to-marketplace-checkout]
//
// Default target: ../sitelooper-plugin. Replaces the target's plugin/ with exactly
// the files git tracks under plugin/ here, then prints the target's git status.
// Commit and push the target yourself.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] ?? join(root, '..', 'sitelooper-plugin'));

if (!existsSync(join(target, '.claude-plugin', 'marketplace.json'))) {
  console.error(`Not a marketplace checkout: ${target} (no .claude-plugin/marketplace.json)`);
  process.exit(1);
}

const files = execFileSync('git', ['ls-files', 'plugin'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
if (!files.includes('plugin/.claude-plugin/plugin.json')) {
  console.error('plugin/.claude-plugin/plugin.json is not tracked; refusing to sync');
  process.exit(1);
}

const dest = join(target, 'plugin');
rmSync(dest, { recursive: true, force: true });
for (const file of files) {
  const out = join(target, file);
  mkdirSync(dirname(out), { recursive: true });
  cpSync(join(root, file), out);
}
console.log(`Copied ${files.length} files to ${dest}`);
console.log(execFileSync('git', ['status', '--short'], { cwd: target, encoding: 'utf8' }) || '(no changes)');
