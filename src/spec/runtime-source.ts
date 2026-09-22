import fs from 'node:fs';

/**
 * Embed the same typed implementation the daemon imports. The build copies
 * these sources beside the compiled modules; installed compilers therefore do
 * not need the repository, TypeScript, or a runtime dependency in their output.
 *
 * Shared modules must be self-contained apart from Playwright type imports and
 * imports from SIBLING shared modules (`./text.js`). A sibling import is
 * stripped from the embedded text and recorded as a dependency, so that the
 * emitter can carry the sibling too — once, and ahead of the module that
 * needs it. Anything else is rejected instead of silently producing an
 * incomplete artifact. This is deliberately not a general TypeScript bundler.
 */
export const EXECUTION_MODULES = ['text', 'url', 'gates', 'observe', 'browser', 'action', 'lifecycle', 'loop', 'snapshot', 'expect', 'point', 'resolve', 'recipes', 'fingerprint', 'echo', 'recover', 'context', 'refill', 'toggle', 'report', 'totp'] as const;
export type ExecutionModule = (typeof EXECUTION_MODULES)[number];

/** One shared module as the artifact carries it. */
export interface ExecutionSource {
  name: string;
  /** Sibling shared modules this one imports, in import order. */
  dependencies: string[];
  /** Exported value names, as the tokens whose presence in a body proves the module is used: `fn(` or a bare constant. */
  tokens: string[];
  /** The embeddable text: imports and export modifiers removed, headed by a provenance comment. */
  source: string[];
}

const SIBLING_IMPORT = /^import (?:type )?\{[^}]*\} from ['"]\.\/([a-z][a-z0-9-]*)\.js['"];\r?\n/gm;
const PLAYWRIGHT_TYPE_IMPORT = /^import type \{[^}]*\} from ['"]playwright-core['"];\r?\n/gm;
const EXPORT_MODIFIER = /^export (?=(?:async )?function |const |interface |type |class )/gm;

/**
 * The embeddable form of one module's text. Pure, so the rejection rules can
 * be tested without a source tree: a foreign import throws, a sibling import
 * is stripped and reported.
 */
export function parseExecutionSource(name: string, source: string): ExecutionSource {
  const dependencies: string[] = [];
  const body = source
    .replace(PLAYWRIGHT_TYPE_IMPORT, '')
    .replace(SIBLING_IMPORT, (_line, sibling: string) => {
      if (sibling === name) throw new Error(`Shared execution module ${name} imports itself`);
      if (!dependencies.includes(sibling)) dependencies.push(sibling);
      return '';
    })
    .replace(EXPORT_MODIFIER, '');
  if (/^(?:import|export)\s/m.test(body)) {
    throw new Error(`Shared execution module ${name} has a dependency the standalone compiler cannot embed`);
  }
  const tokens = [
    ...[...source.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => `${m[1]}(`),
    ...[...source.matchAll(/^export const (\w+)/gm)].map((m) => m[1]),
  ];
  return {
    name,
    dependencies,
    tokens,
    source: [`// Shared execution source: ${name}.ts. Regenerate to update.`, ...body.replace(/\r\n/g, '\n').trim().split('\n')],
  };
}

function moduleUrl(name: string): URL {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`Not a shared execution module name: ${JSON.stringify(name)}`);
  const local = new URL(`../execution/${name}.ts`, import.meta.url);
  if (fs.existsSync(local)) return local;
  const asset = new URL(`../execution/source/${name}.ts`, import.meta.url);
  if (fs.existsSync(asset)) return asset;
  throw new Error(`Shared execution module ${name} is not shipped with this compiler`);
}

function loadExecutionSource(name: string): ExecutionSource {
  return parseExecutionSource(name, fs.readFileSync(moduleUrl(name), 'utf8'));
}

/** One module's embeddable lines, siblings NOT included — see executionClosure for those. */
export function executionSource(name: ExecutionModule): string[] {
  return loadExecutionSource(name).source;
}

/**
 * `names` and every sibling module they depend on, transitively, each exactly
 * once and every dependency AHEAD of the module that imports it — declaration
 * order matters for a `const` a dependent reads at module top level. The
 * relative order of independent modules follows `names`.
 */
export function executionClosure(names: readonly string[]): ExecutionSource[] {
  const out: ExecutionSource[] = [];
  const visiting = new Set<string>();
  const visit = (name: string, via: string[]) => {
    if (out.some((m) => m.name === name)) return;
    if (visiting.has(name)) throw new Error(`Shared execution modules import each other in a cycle: ${[...via, name].join(' -> ')}`);
    visiting.add(name);
    const module = loadExecutionSource(name);
    for (const dependency of module.dependencies) visit(dependency, [...via, name]);
    visiting.delete(name);
    out.push(module);
  };
  for (const name of names) visit(name, []);
  return out;
}
