import fs from 'node:fs';
import path from 'node:path';

export const PROJECT_CONFIG_NAME = 'sitelooper.config.json';

export interface ProjectConfig {
  /** Entry URL used for verification. An absolute URL or a path resolved against Playwright baseURL. */
  targetUrl?: string;
  /** Flow variables the caller must bind before a live run. */
  requiredVars?: string[];
  /** Non-secret default/template values. Secrets should be supplied by the environment or CLI. */
  vars?: Record<string, string>;
  resetCommand?: string;
  playwright?: {
    config?: string;
    project?: string;
  };
  fixtureIsolation?: boolean;
  verificationRuns?: number;
  /** Optional spec used to prove the test fails under a controlled fault. */
  negativeSpec?: string;
  outputDir?: string;
  /** Portable procedure bundle used instead of the user-level skill store. */
  snapshotFile?: string;
}

export interface ResolvedProjectConfig extends Omit<ProjectConfig, 'playwright' | 'outputDir' | 'snapshotFile' | 'negativeSpec'> {
  file: string | null;
  root: string;
  playwright: { config?: string; project?: string };
  outputDir: string;
  snapshotFile: string;
  negativeSpec?: string;
  requiredVars: string[];
  vars: Record<string, string>;
  verificationRuns: number;
}

/** Find the nearest project config, walking from startDir to the filesystem root. */
export function findProjectConfig(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  try {
    if (fs.statSync(dir).isFile()) dir = path.dirname(dir);
  } catch {
    // A not-yet-created path is treated as a directory, which is useful to callers.
  }
  while (true) {
    const candidate = path.join(dir, PROJECT_CONFIG_NAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function object(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${at} must be an object`);
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, at: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${at} must be a non-empty string`);
  return value;
}

function resolveFrom(root: string, value: string | undefined, fallback: string): string {
  return path.resolve(root, value ?? fallback);
}

function parseConfig(raw: unknown, file: string): ProjectConfig {
  const input = object(raw, file);
  const cfg: ProjectConfig = {};
  cfg.targetUrl = optionalString(input.targetUrl, 'targetUrl');
  cfg.resetCommand = optionalString(input.resetCommand, 'resetCommand');
  cfg.negativeSpec = optionalString(input.negativeSpec, 'negativeSpec');
  cfg.outputDir = optionalString(input.outputDir, 'outputDir');
  cfg.snapshotFile = optionalString(input.snapshotFile, 'snapshotFile');

  if (input.requiredVars !== undefined) {
    if (!Array.isArray(input.requiredVars) || input.requiredVars.some((v) => typeof v !== 'string' || !v.trim())) {
      throw new Error('requiredVars must be an array of non-empty strings');
    }
    cfg.requiredVars = [...new Set(input.requiredVars as string[])];
  }
  if (input.vars !== undefined) {
    const vars = object(input.vars, 'vars');
    if (Object.values(vars).some((v) => typeof v !== 'string')) throw new Error('vars values must be strings');
    cfg.vars = vars as Record<string, string>;
  }
  if (input.playwright !== undefined) {
    const playwright = object(input.playwright, 'playwright');
    cfg.playwright = {
      config: optionalString(playwright.config, 'playwright.config'),
      project: optionalString(playwright.project, 'playwright.project'),
    };
  }
  if (input.fixtureIsolation !== undefined) {
    if (typeof input.fixtureIsolation !== 'boolean') throw new Error('fixtureIsolation must be a boolean');
    cfg.fixtureIsolation = input.fixtureIsolation;
  }
  if (input.verificationRuns !== undefined) {
    if (!Number.isInteger(input.verificationRuns) || (input.verificationRuns as number) < 1) {
      throw new Error('verificationRuns must be a positive integer');
    }
    cfg.verificationRuns = input.verificationRuns as number;
  }
  return cfg;
}

/**
 * Load and resolve project settings. Relative paths are anchored at the config
 * directory, so invoking Sitelooper from a nested package produces the same artifacts.
 */
export function loadProjectConfig(startDir: string = process.cwd(), explicitFile?: string): ResolvedProjectConfig {
  const file = explicitFile ? path.resolve(startDir, explicitFile) : findProjectConfig(startDir);
  const root = file ? path.dirname(file) : path.resolve(startDir);
  let cfg: ProjectConfig = {};
  if (file) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
    cfg = parseConfig(raw, file);
  }
  return {
    ...cfg,
    file,
    root,
    requiredVars: cfg.requiredVars ?? [],
    vars: cfg.vars ?? {},
    verificationRuns: cfg.verificationRuns ?? 3,
    playwright: {
      ...(cfg.playwright?.config ? { config: resolveFrom(root, cfg.playwright.config, '') } : {}),
      ...(cfg.playwright?.project ? { project: cfg.playwright.project } : {}),
    },
    outputDir: resolveFrom(root, cfg.outputDir, path.join('tests', 'sitelooper')),
    snapshotFile: resolveFrom(root, cfg.snapshotFile, path.join('.sitelooper', 'procedures.json')),
    ...(cfg.negativeSpec ? { negativeSpec: resolveFrom(root, cfg.negativeSpec, '') } : {}),
  };
}
