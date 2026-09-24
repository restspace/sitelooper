/**
 * The recorder journal (design-recorder-evidence stages 1-3, SHADOW MODE):
 * what the page did between and during the recording's gestures, each event
 * attributed to the gesture, timer or background source that caused it
 * (journal-attribute.ts). Recorded on the step (RecordedStep.journal) and read
 * by nothing but the shadow report (skills/shadow.ts): no replay, compile,
 * export or model-facing text changes because of it.
 *
 * No added waits. Node-side events (requests, navigations, pages, dialogs) are
 * listened to for the whole session; nothing here ever waits on the page. A
 * request still in flight at a step's collect stays pending and is filed with
 * a later step (its cause still names the window that started it).
 *
 * Never stored: request bodies, response bodies, typed credentials. A request
 * records only which gesture windows' typed values it CARRIES; a response only
 * the id-shaped fields a create/update answered with (`mint`), scrubbed.
 */
import type { BrowserContext, Frame, Page, Request } from 'playwright-core';
import { hasSecretMarker, scrubSecrets, scrubSecretsDeep } from '../shared/secrets.js';
import {
  attribute,
  capEvents,
  causeWindow,
  newAttributionState,
  valueHash,
  type AttributionState,
  type JournalEvent,
  type JournalWindow,
  type WindowKind,
} from './journal-attribute.js';

export type { JournalEvent, JournalWindow, WindowKind } from './journal-attribute.js';

/** Resource types a gesture's consequence rides on; images, fonts, styles and scripts are page furniture. */
const COUNTED_TYPES: ReadonlySet<string> = new Set(['document', 'xhr', 'fetch', 'eventsource', 'ping', 'other']);
/** Methods whose JSON answer may carry a record the request created. */
const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH']);
/** The largest response body read for minted ids. */
const MAX_MINT_BODY = 64 * 1024;
/** A request still open this long after it started is filed as open, not held for ever. */
const OPEN_FILE_MS = 15_000;
/** The most events held between collects (the oldest go first). */
const MAX_PENDING = 2_000;
/** The most events a step keeps, per list (journal and gap). */
export const MAX_STEP_EVENTS = 40;
/** Typed values shorter than this are too common to say a request carried them. */
const MIN_CARRIED = 3;
/** Windows kept once closed: attribution only ever looks this far back. */
const WINDOW_KEEP_MS = 120_000;

/** The kind of window a tool's dispatch opens. */
export function windowKindOf(tool: string): WindowKind {
  if (tool === 'eval') return 'eval';
  if (['read', 'read_all', 'wait_for', 'tabs', 'screenshot', 'scroll_into_view', 'download', 'set_viewport', 'dialog_expect'].includes(tool)) return 'observe';
  if (['click', 'dblclick', 'modifier_click', 'right_click', 'fill', 'type', 'press', 'select', 'check', 'drag', 'upload', 'hover', 'goto', 'back', 'set_offline'].includes(tool)) return 'gesture';
  return 'daemon';
}

/** A url reduced to what identifies its endpoint: origin and path, no query, no fragment, scrubbed. */
export function endpointOf(url: string): string {
  try {
    const u = new URL(url);
    return scrubSecrets(`${u.origin}${u.pathname}`).slice(0, 200);
  } catch {
    return scrubSecrets(url.split(/[?#]/)[0]).slice(0, 200);
  }
}

/** The forms a typed value can take on the wire. */
function wireForms(value: string): string[] {
  const forms = new Set<string>([value]);
  try {
    forms.add(encodeURIComponent(value));
  } catch {
    /* lone surrogate */
  }
  forms.add(encodeURIComponent(value).replace(/%20/g, '+'));
  forms.add(JSON.stringify(value).slice(1, -1));
  return [...forms].filter((f) => f.length >= MIN_CARRIED);
}

/** Id-shaped fields of a JSON answer: top level, one level into an object, or the first element of an array. */
export function mintedIds(body: unknown): { p: string; v: string }[] {
  const out: { p: string; v: string }[] = [];
  const idKey = (k: string) => /^(id|uuid|guid|key|slug|number)$|(_id|Id|_uuid|Uuid)$/.test(k);
  const take = (o: unknown, prefix: string, depth: number) => {
    if (out.length >= 3 || !o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      if (o.length) take(o[0], `${prefix}0.`, depth);
      return;
    }
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (out.length >= 3) return;
      if ((typeof v === 'string' || typeof v === 'number') && idKey(k) && String(v).length <= 80) out.push({ p: `${prefix}${k}`, v: scrubSecrets(String(v)) });
    }
    if (depth > 0) for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (v && typeof v === 'object') take(v, `${prefix}${k}.`, depth - 1);
  };
  take(body, '', 1);
  return out;
}

/** What a recorded step keeps of the journal. */
export interface StepJournal {
  /** The window this step's action ran in; causes elsewhere name windows by this number. */
  w: number;
  /** Events this window caused (in it, or late from it). */
  ev?: JournalEvent[];
  evDropped?: number;
  /** Everything else since the previous collect: other windows' late effects, the app, the unknown. Stage 3 adds the page diff. */
  gap?: {
    ev?: JournalEvent[];
    evDropped?: number;
    /** The window of the previous diffed step on this page, whose after-capture the diff below starts from. */
    since?: number;
    url?: string;
    added?: string[];
    removed?: string[];
    totals?: { added: number; removed: number };
  };
}

/** Per-frame drain from the in-page journal (stage 2); absent until that script is installed. */
export type PageDrain = (page: Page) => Promise<JournalEvent[]>;

/**
 * The session-wide journal. One per recording BrowserSession; `SITELOOPER_JOURNAL=0` turns it off.
 */
export class Journal {
  private readonly windows: JournalWindow[] = [];
  private nextW = 1;
  private pending: JournalEvent[] = [];
  private readonly state: AttributionState = newAttributionState();
  private readonly typed: { w: number; forms: string[]; hash: string }[] = [];
  private readonly live = new Map<Request, JournalEvent>();
  private readonly attached = new WeakSet<Page>();
  private pages: () => Page[] = () => [];
  /** Stage 2: the in-page drain, when the page script is installed. */
  pageDrain: PageDrain | null = null;

  /** Where pages are listed from, for page indices. */
  setPageLister(list: () => Page[]): void {
    this.pages = list;
  }

  async attachContext(_context: BrowserContext): Promise<void> {
    // Stage 2 installs the in-page journal here.
  }

  attachPage(page: Page): void {
    if (this.attached.has(page) || typeof page.on !== 'function') return;
    this.attached.add(page);
    page.on('request', (req) => this.onRequest(page, req));
    page.on('requestfinished', (req) => this.onRequestDone(req, false));
    page.on('requestfailed', (req) => this.onRequestDone(req, true));
  }

  private push(e: JournalEvent): void {
    this.pending.push(e);
    if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
  }

  private pageIndex(page: Page): number | undefined {
    const i = this.pages().indexOf(page);
    return i >= 0 ? i : undefined;
  }

  private onRequest(page: Page, req: Request): void {
    try {
      if (!COUNTED_TYPES.has(req.resourceType())) return;
      const method = req.method();
      const e: JournalEvent = { t: Date.now(), k: 'req', m: method, e: endpointOf(req.url()), rt: req.resourceType(), _open: 1 };
      const pg = this.pageIndex(page);
      if (pg) e.pg = pg;
      if (req.frame() !== page.mainFrame()) e.fr = 1;
      const carries = this.carriesOf(req);
      if (carries.length) e.carries = carries;
      this.live.set(req, e);
      this.push(e);
    } catch {
      // the journal never breaks the run it observes
    }
  }

  private carriesOf(req: Request): number[] {
    if (!this.typed.length) return [];
    let wire = req.url();
    try {
      wire += '\n' + (req.postData() ?? '');
    } catch {
      /* a binary body carries nothing we typed */
    }
    const out = new Set<number>();
    for (const t of this.typed) if (t.forms.some((f) => wire.includes(f))) out.add(t.w);
    return [...out];
  }

  private onRequestDone(req: Request, failed: boolean): void {
    const e = this.live.get(req);
    if (!e) return;
    this.live.delete(req);
    e.t1 = Date.now();
    if (failed) {
      e.fail = 1;
      delete e._open;
      return;
    }
    const job = (async () => {
      const res = await req.response();
      if (res) e.s = res.status();
      if (res && WRITE_METHODS.has(String(e.m)) && (e.rt === 'xhr' || e.rt === 'fetch') && /json/i.test(res.headers()['content-type'] ?? '')) {
        const body = await res.body();
        if (body.length <= MAX_MINT_BODY) {
          const mint = mintedIds(JSON.parse(body.toString('utf8')));
          if (mint.length) e.mint = mint;
        }
      }
    })();
    job.catch(() => {}).finally(() => delete e._open);
  }

  /** Open a window: the span a tool's action (or the daemon's own work) ran in. */
  open(kind: WindowKind, tool: string, input = false): number {
    const w = this.nextW++;
    this.windows.push({ w, kind, tool, start: Date.now(), ...(input ? { input: true } : {}) });
    return w;
  }

  close(w: number): void {
    const win = this.windows.find((x) => x.w === w);
    if (win && win.end === undefined) win.end = Date.now();
  }

  /** Run `fn` inside a daemon window (a snapshot, a capture): its effects, if any, are the daemon's own. */
  async daemon<T>(tool: string, fn: () => Promise<T>): Promise<T> {
    const w = this.open('daemon', tool);
    try {
      return await fn();
    } finally {
      this.close(w);
    }
  }

  /**
   * A value this window typed, so a request carrying it can say so. Never a
   * credential: a value holding a secret marker is not kept at all.
   */
  noteTyped(w: number, value: unknown): void {
    if (typeof value !== 'string' || value.trim().length < MIN_CARRIED || hasSecretMarker(value)) return;
    this.typed.push({ w, forms: wireForms(value), hash: valueHash(value) });
    if (this.typed.length > 60) this.typed.shift();
  }

  /** The window whose typed value hashes to `h`, most recent first (the in-page value journal's `eq`). */
  typedWindow(h: string): number | undefined {
    for (let i = this.typed.length - 1; i >= 0; i--) if (this.typed[i].hash === h) return this.typed[i].w;
    return undefined;
  }

  /**
   * Every settled event since the last collect, attributed. Requests still in
   * flight (or still being read for minted ids) stay for a later collect
   * unless they have been open for OPEN_FILE_MS. Never waits on the page
   * beyond the in-page drain's one evaluate per frame (stage 2).
   */
  async collect(page: Page | null): Promise<JournalEvent[]> {
    const fromPage = page && this.pageDrain ? await this.pageDrain(page).catch(() => [] as JournalEvent[]) : [];
    for (const e of fromPage) {
      if (e.k === 'val' && typeof e.h === 'string') {
        const eq = this.typedWindow(e.h);
        if (eq !== undefined) e.eq = eq;
      }
    }
    const now = Date.now();
    const ready: JournalEvent[] = [];
    const held: JournalEvent[] = [];
    for (const e of this.pending) {
      if (e._open && now - e.t < OPEN_FILE_MS) held.push(e);
      else {
        if (e._open) {
          e.open = 1;
          delete e._open;
        }
        ready.push(e);
      }
    }
    this.pending = held;
    const out = attribute([...ready, ...fromPage], this.windows, this.state);
    const cutoff = now - WINDOW_KEEP_MS;
    for (let i = this.windows.length - 1; i >= 0; i--) {
      const w = this.windows[i];
      if (w.end !== undefined && w.end < cutoff) this.windows.splice(i, 1);
    }
    return scrubSecretsDeep(out);
  }
}

/**
 * A step's share of collected events: what its window caused, and the rest
 * (the gap). Both capped (facts before focus and hit-tests).
 */
export function splitForStep(w: number, events: readonly JournalEvent[]): StepJournal {
  const mine = events.filter((e) => causeWindow(e.c) === w);
  const rest = events.filter((e) => causeWindow(e.c) !== w);
  const a = capEvents(mine, MAX_STEP_EVENTS);
  const b = capEvents(rest, MAX_STEP_EVENTS);
  return {
    w,
    ...(a.kept.length ? { ev: a.kept } : {}),
    ...(a.dropped ? { evDropped: a.dropped } : {}),
    ...(b.kept.length || b.dropped ? { gap: { ...(b.kept.length ? { ev: b.kept } : {}), ...(b.dropped ? { evDropped: b.dropped } : {}) } } : {}),
  };
}

/** The journal active in this process, if any: daemon-internal captures open their windows on it. */
let current: Journal | null = null;

export function setCurrentJournal(j: Journal | null): void {
  current = j;
}

export function currentJournal(): Journal | null {
  return current;
}

/** `fn` inside a daemon window of the current journal, or plainly when there is none. */
export function daemonWindow<T>(tool: string, fn: () => Promise<T>): Promise<T> {
  return current ? current.daemon(tool, fn) : fn();
}

/** Frames a drain visits: the page's own, then its first few children. */
export function drainFrames(page: Page): Frame[] {
  return page.frames().slice(0, 6);
}
