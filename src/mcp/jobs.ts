import { randomBytes } from 'node:crypto';
import { runCli, type RunCliOptions, type RunCliResult } from './run-cli.js';

/**
 * Long CLI commands (build, check --ready, repair --propose, rerecord) run for
 * minutes, longer than a tool call should block. Each one becomes a job: the
 * tool returns its id at once and `job_status` reports progress and, once the
 * child exits, its result. In memory only: a job lives as long as the server.
 */
export type JobStatus = 'running' | 'done' | 'failed';

export interface Job {
  id: string;
  tool: string;
  /** The CLI arguments the job runs (never holds a secret: none is ever passed as an argument). */
  argv: string[];
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  /** The last progress lines from the child's stderr. */
  progress: string[];
  result?: RunCliResult;
}

const TAIL = 40;
const KEEP_FINISHED = 50;

export class JobTable {
  private jobs = new Map<string, Job>();
  private controllers = new Map<string, AbortController>();
  private waiters = new Map<string, Set<() => void>>();

  start(tool: string, argv: string[], opts: Omit<RunCliOptions, 'signal' | 'onStderrLine'> & { onStderrLine?: (line: string) => void } = {}): Job {
    const id = `job_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
    const job: Job = { id, tool, argv, status: 'running', startedAt: Date.now(), progress: [] };
    const controller = new AbortController();
    this.jobs.set(id, job);
    this.controllers.set(id, controller);
    this.prune();
    void runCli(argv, {
      ...opts,
      signal: controller.signal,
      onStderrLine: (line) => {
        job.progress.push(line);
        if (job.progress.length > TAIL) job.progress.splice(0, job.progress.length - TAIL);
        opts.onStderrLine?.(line);
      },
    }).then((result) => {
      job.result = result;
      job.status = result.exitCode === 0 ? 'done' : 'failed';
      job.finishedAt = Date.now();
      this.controllers.delete(id);
      for (const wake of this.waiters.get(id) ?? []) wake();
      this.waiters.delete(id);
    });
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /** Resolve when the job finishes, `ms` passes, or `signal` aborts — whichever is first. */
  wait(id: string, ms: number, signal?: AbortSignal): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'running' || ms <= 0) return Promise.resolve(job);
    return new Promise((resolve) => {
      let set = this.waiters.get(id);
      if (!set) this.waiters.set(id, (set = new Set()));
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        set!.delete(done);
        resolve(this.jobs.get(id));
      };
      const timer = setTimeout(done, ms);
      signal?.addEventListener('abort', done, { once: true });
      set.add(done);
    });
  }

  /** Kill every running job's child (server shutdown). */
  killAll(): void {
    for (const controller of this.controllers.values()) controller.abort();
  }

  private prune(): void {
    const finished = [...this.jobs.values()].filter((j) => j.status !== 'running').sort((a, b) => a.startedAt - b.startedAt);
    for (const j of finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED))) this.jobs.delete(j.id);
  }
}
