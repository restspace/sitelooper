/**
 * The evidence a failed compiled run leaves, published where a results branch
 * keeps it.
 *
 * WHY. spec-replay points Playwright's outputDir at `<tag>-spec-tmp/test-results`
 * so a failing test's error-context.md (the page's accessibility snapshot at the
 * failure) and screenshot land in the per-tag tmp dir, and the sweep copies that
 * dir with `cp -r bench/results/<tag>-* bench/results-published/`. But the
 * repo's .gitignore ignores every `test-results/` directory and every `*.png`,
 * so `git add bench/results-published` dropped both without a word: fwop14's
 * compiled run failed on a row the daemon had seen, and the one file that could
 * say what the page showed instead never reached the branch.
 *
 * So each FAILING test's error context is copied to `<tag>-spec-error-context.md`
 * beside the result JSON, and its screenshot to `<tag>-spec-failure.png` when it
 * is at most MAX_SCREENSHOT_BYTES (the .gitignore lets exactly that name
 * through). A second failing test gets `-2`, and so on. Passing tests' files
 * are never copied.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The largest failure screenshot published; a bigger one stays in the tmp dir. */
export const MAX_SCREENSHOT_BYTES = 512 * 1024;

/** Every result of every test in a Playwright JSON report, with its test's status. */
function results(suite, acc = []) {
  for (const s of suite?.suites ?? []) results(s, acc);
  for (const spec of suite?.specs ?? []) {
    for (const t of spec.tests ?? []) for (const r of t.results ?? []) acc.push({ status: t.status, result: r });
  }
  return acc;
}

/**
 * Copy the failing tests' error context (and small screenshot) out of the tmp
 * dir. Returns the files written. Never throws: evidence is best-effort, and a
 * copy that fails must not turn a result into a crash.
 */
export function publishFailureEvidence(report, outDir, tag) {
  const written = [];
  if (!report) return written;
  const failed = results(report).filter(({ status, result }) => status !== 'expected' && status !== 'skipped' && result?.status !== 'passed');
  failed.forEach(({ result }, i) => {
    const suffix = i === 0 ? '' : `-${i + 1}`;
    for (const a of result.attachments ?? []) {
      if (typeof a?.path !== 'string' || !a.path) continue;
      try {
        if (a.name === 'error-context') {
          const to = path.join(outDir, `${tag}-spec-error-context${suffix}.md`);
          fs.copyFileSync(a.path, to);
          written.push(to);
        } else if (a.name === 'screenshot' && fs.statSync(a.path).size <= MAX_SCREENSHOT_BYTES) {
          const to = path.join(outDir, `${tag}-spec-failure${suffix}.png`);
          fs.copyFileSync(a.path, to);
          written.push(to);
        }
      } catch {
        /* gone or unreadable: nothing to publish for this attachment */
      }
    }
  });
  return written;
}
