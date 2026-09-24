/**
 * Round 60, openproject fwop14: the compiled run failed, and the one file that
 * says what the page showed — Playwright's error-context.md, the page's
 * accessibility snapshot at the failure — was never published. spec-replay
 * points Playwright's outputDir into the per-tag tmp dir, and the sweep copies
 * that dir with `cp -r bench/results/<tag>-* bench/results-published/`, but
 * the repo's .gitignore ignores every `test-results/` directory (and every
 * `*.png`), so `git add` dropped both without a word. publishFailureEvidence
 * copies each failing test's error context, and its screenshot when small,
 * to top-level `<tag>-spec-…` files the ignore rules leave alone.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_SCREENSHOT_BYTES, publishFailureEvidence } from '../bench/spec-evidence.mjs';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-evidence-'));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A report shaped as the Playwright JSON reporter writes it, with the attachment paths fwop14's carried. */
function reportFor(dir: string, withShot: boolean, shotBytes = 1024) {
  const results = path.join(dir, 'fwop14-spec-spec-tmp', 'test-results', 'fwop14-fwop14');
  fs.mkdirSync(results, { recursive: true });
  const context = path.join(results, 'error-context.md');
  fs.writeFileSync(context, '# Page snapshot\n\n- row "45 Work package leaf at level 0. fwop14-spec Bench Work Package TASK New - Normal" [selected]\n');
  const shot = path.join(results, 'test-failed-1.png');
  if (withShot) fs.writeFileSync(shot, Buffer.alloc(shotBytes, 1));
  return {
    suites: [
      {
        specs: [
          {
            title: 'fwop14',
            tests: [
              {
                status: 'unexpected',
                results: [
                  {
                    status: 'failed',
                    attachments: [
                      { name: 'sitelooper-drift', contentType: 'text/plain', body: '' },
                      ...(withShot ? [{ name: 'screenshot', contentType: 'image/png', path: shot }] : []),
                      { name: 'error-context', contentType: 'text/markdown', path: context },
                    ],
                  },
                ],
              },
            ],
          },
          { title: 'passing', tests: [{ status: 'expected', results: [{ status: 'passed', attachments: [{ name: 'screenshot', path: shot }] }] }] },
        ],
      },
    ],
  };
}

describe('publishFailureEvidence (fwop14)', () => {
  it('copies a failing test’s error context and small screenshot to top-level <tag>-spec files', () => {
    const dir = path.join(tmp, 'a');
    const written = publishFailureEvidence(reportFor(dir, true), dir, 'fwop14-spec');
    expect(written.map((f) => path.basename(f)).sort()).toEqual(['fwop14-spec-spec-error-context.md', 'fwop14-spec-spec-failure.png']);
    expect(fs.readFileSync(path.join(dir, 'fwop14-spec-spec-error-context.md'), 'utf8')).toContain('- row "45 Work package leaf at level 0.');
  });

  it('leaves a large screenshot behind, and never copies a passing test’s attachments', () => {
    const dir = path.join(tmp, 'b');
    const written = publishFailureEvidence(reportFor(dir, true, MAX_SCREENSHOT_BYTES + 1), dir, 'fwop14-spec');
    expect(written.map((f) => path.basename(f))).toEqual(['fwop14-spec-spec-error-context.md']);
  });

  it('says nothing, and writes nothing, for a report with no failure or none at all', () => {
    const dir = path.join(tmp, 'c');
    fs.mkdirSync(dir, { recursive: true });
    expect(publishFailureEvidence(null, dir, 't')).toEqual([]);
    expect(publishFailureEvidence({ suites: [{ specs: [{ title: 'x', tests: [{ status: 'expected', results: [{ attachments: [] }] }] }] }] }, dir, 't')).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('the published names are not ignored by git, where test-results/ and the raw screenshot are', () => {
    const root = path.resolve(__dirname, '..');
    const ignored = (p: string) => {
      try {
        execFileSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: root });
        return true;
      } catch {
        return false;
      }
    };
    expect(ignored('bench/results-published/fwop14-spec-spec-tmp/test-results/fwop14-fwop14/error-context.md')).toBe(true);
    expect(ignored('bench/results-published/fwop14-spec-spec-tmp/test-results/fwop14-fwop14/test-failed-1.png')).toBe(true);
    expect(ignored('bench/results-published/fwop14-spec-spec-error-context.md')).toBe(false);
    expect(ignored('bench/results-published/fwop14-spec-spec-failure.png')).toBe(false);
  });
});
