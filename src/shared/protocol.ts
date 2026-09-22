/**
 * CLI <-> daemon wire protocol: newline-delimited JSON over a named pipe
 * (Windows) / unix domain socket.
 */

import path from 'node:path';
import type { DriftTicket } from '../skills/repair.js';

export type CommandName =
  | 'ping'
  | 'do'
  | 'open'
  | 'brief'
  | 'note'
  | 'peek'
  | 'screenshot'
  | 'config'
  | 'reset'
  | 'script'
  | 'var'
  | 'flow'
  | 'run'
  /** Drain a run's drift tickets INSIDE the live session — see server.ts's case. */
  | 'patch'
  | 'stop';

export interface Request {
  id: number;
  command: CommandName;
  args: Record<string, unknown>;
}

/** Streamed while a command runs (only consumed under --verbose). */
export interface ProgressFrame {
  id: number;
  type: 'progress';
  message: string;
}

export interface ResultFrame {
  id: number;
  type: 'result';
  ok: boolean;
  /** Present when ok === false. */
  error?: string;
  /** `infra` errors map to exit code 2 on the CLI side. */
  errorKind?: 'infra' | 'command';
  data?: unknown;
}

export type Frame = ProgressFrame | ResultFrame;

/** A daemon's answer to `ping`. `learning`/`skillsDir` are absent from a daemon built before they were. */
export interface PingInfo {
  pid: number;
  session: string;
  learning?: boolean;
  skillsDir?: string | null;
}

const samePath = (a: string, b: string): boolean => {
  const norm = (p: string) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  return norm(a) === norm(b);
};

/**
 * Why a RUNNING daemon must not serve a command that wants a skill store, or
 * null when it may. A session's store is fixed when its daemon starts, and
 * the CLI reuses whatever daemon holds the session's socket: a default daemon
 * started without one (a plain `do`) then served a later `--learn` run, which
 * reported "no skill store" on every step. A daemon started with ANOTHER
 * store would silently replay and write the wrong procedures. Refused rather
 * than restarted: stopping a daemon ends its signed-in browser, which is the
 * user's call. A command that wants no store is served by any daemon; a
 * daemon too old to say is given the benefit of the doubt.
 */
export function storeMismatch(want: { learn: boolean; skillsDir: string }, have: PingInfo): string | null {
  if (!want.learn || have.learning === undefined) return null;
  const restart = `stop it first (sitelooper --session ${have.session} stop), then re-run`;
  if (!have.learning || !have.skillsDir) {
    return `session "${have.session}" is already running WITHOUT a skill store (its daemon was started without --learn / SITELOOPER_SKILLS=1), and this command needs one — ${restart}`;
  }
  if (!samePath(have.skillsDir, want.skillsDir)) {
    return `session "${have.session}" is already running with the skill store ${have.skillsDir}, not ${want.skillsDir} — ${restart}`;
  }
  return null;
}

export function encodeFrame(frame: Frame | Request): string {
  return JSON.stringify(frame) + '\n';
}

/**
 * Incremental NDJSON decoder. Feed it raw socket chunks; it yields complete
 * parsed frames and buffers partial lines.
 */
export class LineDecoder<T> {
  private buffer = '';

  push(chunk: string | Buffer): T[] {
    this.buffer += chunk.toString('utf8');
    const out: T[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      out.push(JSON.parse(line) as T);
    }
    return out;
  }
}

/**
 * One step of a flow run, as the daemon reports it back over the wire.
 *
 * `recovered`/`fellBack` are the run's own account of WHY a step needed the
 * model. They travel on the step, not only on a drift ticket, because a ticket
 * is filed only for a step whose pinned skill was actually invoked: a step
 * whose skill refused before it ran (sp4od's 06-open) recovered, learned a new
 * skill, and left no ticket at all — so the report had no trace of the cause.
 */
export interface FlowStepResult {
  id: string;
  status: string;
  summary?: string;
  /** Replay tier ('A'/'B'/...), or null when the model drove the step. */
  tier?: string | null;
  /** The step fell through to model recovery. */
  recovered?: boolean;
  /** Why the zero-model path did not run it (only meaningful when `recovered`). */
  fellBack?: string;
  /** The step's goal was already showing for this record, so nothing ran. */
  satisfied?: true;
  values?: Record<string, string>;
  replayed?: string | null;
  repaired?: boolean;
  turns?: number;
  repinned?: string;
  repinParams?: Record<string, string>;
  /** Declared outputs a successful step did not report (a zero-model replay drops what it could not re-read). */
  unreported?: string[];
  reason?: string;
}

/** The `run` command's result payload. */
export interface FlowRunResult {
  flow: string;
  status: string;
  passed: number;
  total: number;
  steps: FlowStepResult[];
  driftTickets?: DriftTicket[];
  wallMs: number;
}
