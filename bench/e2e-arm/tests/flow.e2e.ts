/**
 * One bench task as an e2e test: sign in, then one `agent.act` per objective,
 * each followed by the check e2e's replay cache needs before it records the
 * step (`agent.assert`), and an `agent.extract` where the objective asks for a
 * value to be reported. Steps come from ../task.mjs.
 *
 * No step is fatal except the sign-in: a failed act or assertion is logged
 * and the flow carries on, because the run is scored by the app-side verifier
 * (bench/verify-<target>.mjs), not by this test's own verdict.
 */
import fs from 'node:fs';
import { test } from '@e2e-dev/web';
import { unique } from 'e2e';
import { z } from 'zod';
import { loadTask } from '../task.mjs';

const TARGET = process.env.BENCH_TARGET ?? 'repairdesk';
const RUNID = process.env.BENCH_RUNID ?? 'e2e-local';
const STEPLOG = process.env.BENCH_STEPLOG ?? '';
const ACT_TIMEOUT = 300_000;
// Ghost's admin is not at the site root; every other app signs in from it.
const START: Record<string, string> = { ghost: 'ghost/' };

const task = loadTask(TARGET);
const literal = (s: string) => s.replaceAll('<RUNID>', RUNID);
const slotted = (s: string) => s.replaceAll('<RUNID>', '{runid}');

type Row = Record<string, unknown>;
const rows: Row[] = [];
const report: string[] = [];
const flush = () => {
  if (STEPLOG) fs.writeFileSync(STEPLOG, JSON.stringify({ target: TARGET, runid: RUNID, steps: rows, finalText: report.join('\n') }, null, 2));
};
const failure = (e: unknown): Row => {
  const err = e as { code?: string; explanation?: string; message?: string; blocked?: boolean };
  return { ok: false, code: err?.code ?? null, blocked: err?.blocked ?? null, error: String(err?.explanation ?? err?.message ?? e).slice(0, 2000) };
};
/** Run one agent call, log it, never throw. */
async function step<T>(row: Row, fn: () => Promise<T>): Promise<T | undefined> {
  const t0 = Date.now();
  try {
    const out = await fn();
    rows.push({ ...row, ok: true, ms: Date.now() - t0, ...(out && typeof out === 'object' ? out as Row : {}) });
    return out;
  } catch (e) {
    rows.push({ ...row, ...failure(e), ms: Date.now() - t0 });
    return undefined;
  } finally {
    flush();
  }
}

test(`${TARGET} flow`, { timeout: 2_700_000, agentContext: task.context }, async ({ app, agent }) => {
  await app.open(START[TARGET] ?? '/');

  const signedIn = await step({ kind: 'act', id: 'signin' }, () =>
    agent.act('Sign in with username {username} and password {password}', {
      params: { username: process.env.APP_EMAIL ?? '', password: process.env.APP_PASSWORD ?? '' },
      timeout: ACT_TIMEOUT,
    }));
  if (!signedIn) throw new Error('sign-in failed; nothing else can run');
  await step({ kind: 'assert', id: 'signin' }, () => agent.assert('The app shows a signed-in page, not a sign-in form'));

  for (const o of task.objectives) {
    const id = `obj${o.n}`;
    const instruction = o.state
      ? `Achieve objective ${o.n} of the goal, for run id {runid}: ${slotted(o.text)}` +
        (o.report ? ' Finish on a screen that shows the value(s) it asks you to report.' : '')
      : `Objective ${o.n} of the goal, for run id {runid}, asks only for a report: ${slotted(o.text)} ` +
        'Bring the app to the screen that shows the requested value(s) and stop there. Do not change any data.';
    const acted = await step({ kind: 'act', id }, () =>
      agent.act(instruction, { params: { runid: unique(RUNID) }, timeout: ACT_TIMEOUT }));

    if (o.state) {
      await step({ kind: 'assert', id }, () =>
        agent.assert(`For run id ${RUNID}, this now holds in the app: ${literal(o.state)}`));
    }
    if (o.report) {
      const got = await step({ kind: 'extract', id }, () =>
        agent.extract(
          `For run id ${RUNID}: ${literal(o.report)} Return each requested value exactly as the screen shows it.`,
          { schema: z.object({ values: z.array(z.string()) }) },
        ));
      // The act's own summary goes in too: a value only the agent can see (the
      // page URL, e2gr1 obj 6) is in no observation `extract` judges.
      report.push(`${o.n}. ${acted && got ? 'DONE' : 'FAILED'} ${(got?.values ?? []).join(' | ')}${acted?.summary ? ` (${acted.summary})` : ''}`);
    } else {
      report.push(`${o.n}. ${acted ? 'DONE' : 'FAILED'}`);
    }
    flush();
  }
});
