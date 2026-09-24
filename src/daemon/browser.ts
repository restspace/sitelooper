import path from 'node:path';
import { chromium, devices, type BrowserContext, type Page, type Video } from 'playwright-core';
import { ensureSessionDir } from '../shared/paths.js';
import { DialogManager } from './dialogs.js';
import { RECORDING_VIEWPORT, profileMismatch, readLiveBrowser, type BrowserProfile } from '../execution/browser.js';
import { pageTraffic } from '../execution/action.js';
import { ScriptRecorder } from './recorder.js';
import { Journal, currentJournal, setCurrentJournal } from './journal.js';
import { SkillStore } from '../skills/store.js';

/**
 * The browser a session records and replays in, from `--viewport WxH` or
 * `--device <Playwright device name>` (the CLI hands them to the daemon as
 * SITELOOPER_VIEWPORT / SITELOOPER_DEVICE). A device supplies its viewport,
 * scale factor, touch, mobile flag and user agent; a viewport alongside it
 * overrides the size only. Neither: RECORDING_VIEWPORT, which every session
 * recorded in before the option existed. Throws on a size that does not parse
 * or a device Playwright does not know, naming close matches.
 */
export function resolveBrowserProfile(o: { viewport?: string; device?: string } = {}): BrowserProfile {
  let profile: BrowserProfile = { viewport: { ...RECORDING_VIEWPORT } };
  const deviceName = o.device?.trim();
  if (deviceName) {
    const d = devices[deviceName as keyof typeof devices];
    if (!d) {
      const first = deviceName.toLowerCase().split(/\s+/)[0];
      const near = Object.keys(devices).filter((n) => n.toLowerCase().includes(first)).slice(0, 8);
      throw new Error(
        `unknown device ${JSON.stringify(deviceName)}${near.length ? ` — did you mean: ${near.join(', ')}` : ''} (Playwright device names, e.g. "iPhone 13", "Pixel 7")`,
      );
    }
    profile = {
      device: deviceName,
      viewport: { ...d.viewport },
      deviceScaleFactor: d.deviceScaleFactor,
      isMobile: d.isMobile,
      hasTouch: d.hasTouch,
      userAgent: d.userAgent,
    };
  }
  const size = o.viewport?.trim();
  if (size) {
    const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i.exec(size);
    if (!m) throw new Error(`--viewport must be WIDTHxHEIGHT, e.g. 390x844 (got ${JSON.stringify(size)})`);
    profile = { ...profile, viewport: { width: Number(m[1]), height: Number(m[2]) } };
  }
  return profile;
}

/** The profile the environment asks for: what a spawned daemon launches with. */
export function profileFromEnv(env: NodeJS.ProcessEnv = process.env): BrowserProfile {
  return resolveBrowserProfile({ viewport: env.SITELOOPER_VIEWPORT, device: env.SITELOOPER_DEVICE });
}

/** The env a daemon is spawned with to launch a profile (the inverse of profileFromEnv). */
export function profileEnv(p: BrowserProfile): Record<string, string> {
  return {
    ...(p.device ? { SITELOOPER_DEVICE: p.device } : {}),
    SITELOOPER_VIEWPORT: `${p.viewport.width}x${p.viewport.height}`,
  };
}

/** Playwright context options for a profile. */
function contextOptions(p: BrowserProfile) {
  return {
    viewport: p.viewport,
    ...(p.deviceScaleFactor !== undefined ? { deviceScaleFactor: p.deviceScaleFactor } : {}),
    ...(p.isMobile !== undefined ? { isMobile: p.isMobile } : {}),
    ...(p.hasTouch !== undefined ? { hasTouch: p.hasTouch } : {}),
    ...(p.userAgent !== undefined ? { userAgent: p.userAgent } : {}),
  };
}

export interface BrowserOptions {
  session: string;
  headed?: boolean;
  /** Playwright channel; defaults to installed Chrome, then Edge. */
  channel?: string;
  executablePath?: string;
  /** Persist cookies/localStorage in the session profile dir (default true). */
  persist?: boolean;
  /**
   * Record the whole session to webm, one file per tab. Playwright only offers
   * video as a context-creation option and only finalises the files on context
   * close, so this is fixed when the browser launches and the paths come back
   * from close() — there is no mid-session start/stop.
   */
  record?: boolean;
  /**
   * Record every action as a replayable Playwright step (see ScriptRecorder).
   * Unlike video this costs a page round trip per action (resolving a durable
   * selector), so it is opt-in and fixed for the life of the session.
   */
  script?: boolean;
  /**
   * Learning mode: successful instructions are compiled into stored skills
   * and stored skills are offered back for replay. Implies script recording
   * (the recording is what gets compiled).
   */
  learn?: boolean;
  /** The browser to launch; defaults to what the environment asks for (profileFromEnv). */
  profile?: BrowserProfile;
}

/**
 * Owns the Playwright context for one session: a persistent profile so
 * logins survive daemon restarts, plus dialog capture wired to every page.
 */
export class BrowserSession {
  private context: BrowserContext | null = null;
  private activePage: Page | null = null;
  /** Videos of every page adopted this session, kept so close() can resolve their paths. */
  private videos = new Set<Video>();
  readonly dialogs = new DialogManager();
  /** Non-null only when script recording is on; tools feed it every action. */
  readonly script: ScriptRecorder | null;
  /** Non-null only in learning mode: where compiled skills go and come from. */
  readonly learn: SkillStore | null;
  /** The browser this session launches (and so records and replays) in; stored on a flow it saves. */
  readonly profile: BrowserProfile;
  /**
   * The recorder journal (daemon/journal.ts, SHADOW MODE): on whenever the
   * script recorder is, unless SITELOOPER_JOURNAL=0. Read only by the shadow
   * report; nothing it records changes what replays, compiles or exports.
   */
  readonly journal: Journal | null;

  constructor(private opts: BrowserOptions) {
    this.profile = opts.profile ?? profileFromEnv();
    const learning = Boolean(opts.learn) || process.env.SITELOOPER_SKILLS === '1';
    this.learn = learning ? new SkillStore() : null;
    this.script =
      learning || opts.script || process.env.SITELOOPER_SCRIPT === '1' ? new ScriptRecorder(opts.session) : null;
    this.journal = this.script && process.env.SITELOOPER_JOURNAL !== '0' ? new Journal() : null;
    if (this.journal) setCurrentJournal(this.journal);
  }

  private async launch(): Promise<BrowserContext> {
    const headless = !(this.opts.headed || process.env.SITELOOPER_HEADED === '1');
    const executablePath = this.opts.executablePath || process.env.SITELOOPER_EXECUTABLE || undefined;
    const recordVideo = this.recording
      ? { dir: path.join(ensureSessionDir(this.opts.session), 'video'), size: this.profile.viewport }
      : undefined;
    const channels = executablePath
      ? [undefined]
      : [this.opts.channel || process.env.SITELOOPER_CHANNEL || 'chrome', 'msedge', 'chromium'];

    let lastErr: unknown;
    for (const channel of channels) {
      try {
        if (this.opts.persist === false) {
          const browser = await chromium.launch({ headless, channel: channel as string | undefined, executablePath });
          return await browser.newContext({ ...contextOptions(this.profile), recordVideo });
        }
        const userDataDir = path.join(ensureSessionDir(this.opts.session), 'profile');
        return await chromium.launchPersistentContext(userDataDir, {
          headless,
          channel: channel as string | undefined,
          executablePath,
          ...contextOptions(this.profile),
          recordVideo,
        });
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(
      `could not launch a browser (tried channels: chrome, msedge, chromium). ` +
        `Install Chrome/Edge or set SITELOOPER_EXECUTABLE. Last error: ${(lastErr as Error)?.message}`,
    );
  }

  async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    // One launch at a time: an unqueued command (screenshot) arriving while
    // the first launch is in flight used to start a second browser and
    // orphan the first, videos and all.
    this.launching ??= this.launch()
      .then(async (context) => {
        // Before any page is adopted: the in-page journal must be in every document from its first script.
        await this.journal?.attachContext(context).catch(() => {});
        this.context = context;
        this.journal?.setPageLister(() => context.pages().filter((p) => !p.isClosed()));
        context.on('page', (p) => this.adoptPage(p));
        context.on('close', () => {
          this.context = null;
          this.activePage = null;
        });
        for (const p of context.pages()) this.adoptPage(p);
        return context;
      })
      .finally(() => {
        this.launching = null;
      });
    return this.launching;
  }

  private launching: Promise<BrowserContext> | null = null;

  private adoptPage(page: Page): void {
    this.dialogs.attach(page);
    this.journal?.attachPage(page);
    // Traffic is recorded from the moment the session adopts the page, so the
    // first action on it has a baseline (src/execution/action.ts).
    pageTraffic(page);
    const video = page.video();
    if (video) this.videos.add(video);
    const previous = this.activePage;
    // A new tab becomes the active page — the agent follows what it opened —
    // unless a replay has pinned its page: a replayed click that spawns a tab
    // (fwgr26's sign-in skill carried a stray click on a target=_blank
    // "Support" link) must not move the procedure off the page it is on.
    if (!this.pinnedPage || this.pinnedPage.isClosed()) this.activePage = page;
    page.on('close', () => {
      if (this.activePage === page) this.activePage = previous && !previous.isClosed() ? previous : null;
    });
    // A tab that lands on a browser error page is a dead link, not a place to
    // work: close it and go back to where the click came from. On the offline
    // bench box that Support tab was chrome-error://chromewebdata/, and every
    // later step of the create segment was asked of the error page.
    if (previous && previous !== page) {
      // Polled, not awaited through a load state: an error page never
      // reports itself loaded, and a popup starts as about:blank.
      const poll = async () => {
        const deadline = Date.now() + 15_000;
        while (!page.isClosed() && Date.now() < deadline) {
          const url = page.url();
          if (/^chrome-error:|^about:neterror/.test(url)) {
            if (this.activePage === page) this.activePage = previous.isClosed() ? null : previous;
            await page.close().catch(() => {});
            return;
          }
          if (url && url !== 'about:blank') return; // a real page: the agent's to keep
          // Woken by the navigation itself, so a tab that resolves in 20ms is
          // judged in 20ms. The timeout is only a backstop for a tab that
          // commits its url without a main-frame navigation event.
          await page.waitForEvent('framenavigated', { timeout: Math.max(1, Math.min(250, deadline - Date.now())) }).catch(() => {});
        }
      };
      poll().catch(() => {});
    }
  }

  private pinnedPage: Page | null = null;

  /**
   * Keep `page` active for the duration of `fn`, whatever tabs open meanwhile.
   * The pin moves only when `fn` says so (repin): a replayed step that was
   * RECORDED opening a popup, closing its page or switching tabs follows it.
   * Whichever page the pin stands on when `fn` ends is left active, so the
   * next segment of a chain starts where this one left the procedure.
   */
  async withPinnedPage<T>(page: Page, fn: () => Promise<T>): Promise<T> {
    const outer = this.pinnedPage;
    this.pinnedPage = page;
    try {
      return await fn();
    } finally {
      const landed = this.pinnedPage;
      this.pinnedPage = outer;
      if (landed && !landed.isClosed()) this.activePage = landed;
      else if (!page.isClosed()) this.activePage = page;
    }
  }

  /** Move a pin (and the active page) to `page` — a replay following a recorded page effect. */
  repin(page: Page): void {
    if (this.pinnedPage) this.pinnedPage = page;
    this.activePage = page;
  }

  /** Whether a context is already live — so callers can look without launching one. */
  get isOpen(): boolean {
    return this.context !== null;
  }

  /** Whether this session records video (flag or env; fixed at construction). */
  get recording(): boolean {
    return Boolean(this.opts.record || process.env.SITELOOPER_RECORD === '1');
  }

  /** Current page, creating one if none is open. */
  /**
   * Put the page in the browser a flow was recorded in, as far as a launched
   * session can: the window is resized (a page's viewport is settable), while
   * a user agent, touch support or mobile flag is fixed at launch and can only
   * be reported. Returns what still differs, or null. `sitelooper run` spawns
   * a fresh session with the flow's own profile, so the report is for a
   * session that was already running in another one.
   */
  async alignTo(recorded: BrowserProfile): Promise<string | null> {
    const page = await this.getPage();
    let live = await readLiveBrowser(page);
    if (live.viewport && (live.viewport.width !== recorded.viewport.width || live.viewport.height !== recorded.viewport.height)) {
      await page.setViewportSize(recorded.viewport);
      live = await readLiveBrowser(page);
    }
    return profileMismatch(recorded, live);
  }

  async getPage(): Promise<Page> {
    const context = await this.getContext();
    if (this.activePage && !this.activePage.isClosed()) return this.activePage;
    const existing = context.pages().find((p) => !p.isClosed());
    if (existing) {
      this.activePage = existing;
      return existing;
    }
    const page = await context.newPage();
    this.activePage = page;
    return page;
  }

  /** Pages in the context, for tab-switching tools. */
  async listPages(): Promise<Page[]> {
    const context = await this.getContext();
    return context.pages().filter((p) => !p.isClosed());
  }

  async switchToPage(index: number): Promise<Page> {
    const pages = await this.listPages();
    const page = pages[index];
    if (!page) throw new Error(`no tab at index ${index} (open tabs: ${pages.length})`);
    this.activePage = page;
    await page.bringToFront().catch(() => {});
    return page;
  }

  /**
   * Close the context and return the recorded video paths (empty unless
   * recording). Videos are only written out on context close, so this is the
   * one moment they can be reported. Idempotent.
   */
  async close(): Promise<string[]> {
    if (this.journal && currentJournal() === this.journal) setCurrentJournal(null);
    const context = this.context;
    if (context) {
      this.context = null;
      this.activePage = null;
      const browser = context.browser();
      await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
    const videos = [...this.videos];
    this.videos.clear();
    const paths = await Promise.all(videos.map((v) => v.path().catch(() => null)));
    return paths.filter((p): p is string => Boolean(p));
  }
}

/**
 * Requests in flight per page: the shared traffic record (src/execution/action.ts),
 * which the standalone artifact carries too. Installed when this session adopts
 * a page, so a page this session never adopted reads as idle.
 */
export { inFlightRequests } from '../execution/action.js';

/**
 * The whole budget of one agent or replay action: dispatch (every click tier
 * included), its settle and its expected effect. Click tiers are cut to what
 * is left of it, so a click that used to be able to spend 3×10s plus a 10s
 * re-render window now ends by 30s.
 */
export const ACTION_DEADLINE_MS = 30_000;
