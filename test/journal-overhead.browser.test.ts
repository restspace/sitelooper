/**
 * The recorder journal's cost, measured on the fixture app: the same scripted
 * session (fills, clicks, a picker, reads, a polling page with a ticking
 * clock) with the journal off (SITELOOPER_JOURNAL=0) and on, alternated, three
 * rounds each. Reports time per tool call, daemon CPU, browser main-thread task
 * time (CDP Performance.getMetrics TaskDuration) and script.jsonl growth.
 *
 *   BP_BROWSER_TESTS=1 BP_JOURNAL_OVERHEAD=1 npx vitest run test/journal-overhead.browser.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/daemon/browser.js';
import { executeTool } from '../src/agent/tools.js';
import { startJournalApp } from './fixture/journal-app.js';

const enabled = process.env.BP_BROWSER_TESTS === '1' && process.env.BP_JOURNAL_OVERHEAD === '1';
const d = enabled ? describe : describe.skip;

interface Sample {
  calls: number[];
  cpuMs: number;
  taskMs: number;
  bytes: number;
  steps: number;
  journalBytes: number;
}

d('recorder journal overhead', () => {
  let app: Awaited<ReturnType<typeof startJournalApp>>;
  let home: string;

  beforeAll(async () => {
    app = await startJournalApp();
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-journal-cost-'));
    process.env.SITELOOPER_HOME = home;
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.SITELOOPER_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  async function session(journal: boolean, name: string): Promise<Sample> {
    if (journal) delete process.env.SITELOOPER_JOURNAL;
    else process.env.SITELOOPER_JOURNAL = '0';
    const s = new BrowserSession({ session: name, persist: false, learn: true });
    s.script!.beginInstruction('overhead');
    const calls: number[] = [];
    let taskMs = 0;
    const cpu0 = process.cpuUsage();
    const run = async (tool: string, args: Record<string, unknown>) => {
      const t0 = performance.now();
      await executeTool(s, tool, args, os.tmpdir());
      calls.push(performance.now() - t0);
    };
    // One CDP session per page, enabled once: TaskDuration is cumulative from enable.
    let cdp: Awaited<ReturnType<ReturnType<Awaited<ReturnType<typeof s.getPage>>['context']>['newCDPSession']>> | null = null;
    const task = async () => {
      if (!cdp) {
        const page = await s.getPage();
        cdp = await page.context().newCDPSession(page);
        await cdp.send('Performance.enable');
      }
      const { metrics } = await cdp.send('Performance.getMetrics');
      return (metrics.find((m: { name: string }) => m.name === 'TaskDuration')?.value ?? 0) * 1000;
    };
    for (const path of ['/', '/picker', '/?poll=1']) {
      await run('goto', { url: `${app.url}${path}` });
      await cdp?.detach().catch(() => {});
      cdp = null;
      const before = await task();
      // The polling page settles slowly (its traffic never goes quiet): one round there.
      for (let i = 0; i < (path.includes('poll') ? 1 : 4); i++) {
        if (path === '/picker') {
          await run('click', { target: '#open' });
          await run('click', { target: `a[data-id="${(i % 3) + 1}"]` });
          await run('click', { target: '#elsewhere' });
        } else {
          await run('fill', { target: '#title', value: `Overhead ${i}` });
          await run('click', { target: '#save' });
          await run('read', { target: '#status', what: 'text' });
        }
      }
      taskMs += (await task()) - before;
    }
    const cpu = process.cpuUsage(cpu0);
    const file = path.join(home, 'sessions', name, 'script.jsonl');
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    await s.close();
    delete process.env.SITELOOPER_JOURNAL;
    return {
      calls,
      cpuMs: (cpu.user + cpu.system) / 1000,
      taskMs,
      bytes: Buffer.byteLength(text),
      steps: lines.filter((e) => e.k === 'step').length,
      journalBytes: lines.reduce((n, e) => n + (e.journal ? Buffer.byteLength(JSON.stringify(e.journal)) : 0), 0),
    };
  }

  it('measures', async () => {
    const off: Sample[] = [];
    const on: Sample[] = [];
    for (let r = 0; r < 3; r++) {
      off.push(await session(false, `cost-off-${r}`));
      on.push(await session(true, `cost-on-${r}`));
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const sum = (list: Sample[]) => ({
      medianCallMs: median(list.flatMap((x) => x.calls)),
      meanCallMs: mean(list.flatMap((x) => x.calls)),
      daemonCpuMsPerCall: mean(list.map((x) => x.cpuMs / x.calls.length)),
      browserTaskMsPerCall: mean(list.map((x) => x.taskMs / x.calls.length)),
      bytesPerStep: mean(list.map((x) => x.bytes / x.steps)),
      journalBytesPerStep: mean(list.map((x) => x.journalBytes / x.steps)),
    });
    const report = { off: sum(off), on: sum(on), calls: off[0].calls.length };
    console.log(`\n[journal-overhead] ${JSON.stringify(report, null, 2)}`);
    fs.writeFileSync(path.join(os.tmpdir(), 'journal-overhead.json'), JSON.stringify(report, null, 2));
    expect(report.on.journalBytesPerStep).toBeGreaterThan(0);
    expect(report.off.journalBytesPerStep).toBe(0);
  }, 1_800_000);
});
