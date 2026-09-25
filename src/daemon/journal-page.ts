/**
 * The in-page half of the recorder journal (stage 2; daemon/journal.ts). One
 * init script per document: a MutationObserver and a few capture-phase
 * listeners that SUMMARISE what the page does into a bounded buffer the
 * daemon drains at each recorded step. It never changes the page: no history
 * wrapping, no prototype patching, no DOM writes.
 *
 * What it records (each event time-stamped, Date.now() — the daemon's clock):
 *  - show / hide: a landmark (dialog, listbox, menu, tooltip, tabpanel, grid,
 *    tree, alert, status, log, [popover], aria-modal, aria-live) becoming
 *    visible or not, with its id and, on a hide, when it was shown (`sa`) —
 *    the lineage attribution follows back to the window that showed it;
 *  - txt: the text of a heading or live region changing (a "Saved!" flash);
 *    a host changing 4 times in 10 s is marked periodic (`per`) once and then
 *    ignored (clocks, counters);
 *  - state: aria-selected / -checked / -pressed / -expanded, a native
 *    checkbox's `checked`, and a CSS-class tick on an option (the option's own
 *    class, or a check mark inside it shown or hidden), with `on` when the
 *    tick's direction is known;
 *  - val: a field's value after input/change (coalesced while typing), as a
 *    length and an FNV-1a hash — never the text; a password field gives only
 *    its length; fields already seen are re-checked at each drain, so a value
 *    the app changed without an event is caught (`src: 'd'`);
 *  - foc: focus in / out, with the element;
 *  - hit: what a pointerdown or click actually landed on, whether that is the
 *    element the recorder aimed at (`on`), what covered it when not
 *    (`cover`), trusted or not, and whether the page prevented the click.
 */

/** The page function. Self-contained: it is serialised into an init script. */
function journalInPage(): void {
  const g = window as unknown as { __slj?: unknown };
  if (g.__slj) return;
  const MAX = 500;
  let buf: Record<string, unknown>[] = [];
  let dropped = 0;
  const push = (e: Record<string, unknown>): Record<string, unknown> => {
    e.t = Date.now();
    buf.push(e);
    if (buf.length > MAX) {
      buf.shift();
      dropped++;
    }
    return e;
  };
  const fnv = (s: string): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  };
  const LANDMARK_ROLES = new Set(['dialog', 'alertdialog', 'listbox', 'menu', 'menubar', 'tooltip', 'tabpanel', 'grid', 'tree', 'alert', 'status', 'log']);
  const LM_SEL =
    '[role=dialog],[role=alertdialog],[role=listbox],[role=menu],[role=menubar],[role=tooltip],[role=tabpanel],[role=grid],[role=tree],[role=alert],[role=status],[role=log],dialog,[popover],[aria-modal=true],[aria-live]';
  const OPTION_SEL = '[role=option],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=checkbox],[role=radio],[role=switch],[role=treeitem],[role=tab]';
  const TEXT_HOST_SEL = 'h1,h2,h3,h4,h5,h6,[role=heading],[role=status],[role=alert],[aria-live]';
  const ARIA_STATE = new Set(['aria-selected', 'aria-checked', 'aria-pressed', 'aria-expanded']);
  const VIS_ATTRS = new Set(['class', 'style', 'hidden', 'aria-hidden', 'open']);
  const IMPLICIT: Record<string, string> = {
    BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox', DIALOG: 'dialog', OPTION: 'option', LI: 'listitem', UL: 'list', OL: 'list',
    NAV: 'navigation', TABLE: 'table', TR: 'row', TD: 'cell', TH: 'columnheader', FORM: 'form', IMG: 'img', MAIN: 'main', SUMMARY: 'button', LABEL: 'label', P: 'paragraph',
  };

  const textOf = (node: Node, n: number): string => {
    let out = '';
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let x: Node | null;
    while ((x = walk.nextNode()) && out.length < n * 2) out += ' ' + (x.nodeValue ?? '');
    return out.replace(/\s+/g, ' ').trim().slice(0, n);
  };
  const roleOf = (el: Element): string => {
    const r = el.getAttribute('role');
    if (r) return r.trim().split(/\s+/)[0];
    const tag = el.tagName;
    if (tag === 'INPUT') {
      const ty = ((el as HTMLInputElement).type || 'text').toLowerCase();
      if (ty === 'checkbox' || ty === 'radio') return ty;
      if (ty === 'button' || ty === 'submit' || ty === 'reset') return 'button';
      return ty === 'search' ? 'searchbox' : 'textbox';
    }
    if (tag === 'A') return el.hasAttribute('href') ? 'link' : 'generic';
    if (/^H[1-6]$/.test(tag)) return 'heading';
    if ((el as HTMLElement).isContentEditable && el.hasAttribute('contenteditable')) return 'textbox';
    return IMPLICIT[tag] ?? tag.toLowerCase();
  };
  const nameOf = (el: Element): string => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter((x): x is HTMLElement => Boolean(x))
        .map((x) => textOf(x, 60))
        .join(' ');
      if (t) return t;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      const label = el.labels?.[0];
      if (label) return textOf(label, 60);
      return el.getAttribute('placeholder') || el.getAttribute('name') || el.id || '';
    }
    return textOf(el, 60);
  };
  const desc = (el: Element | null): string => (el ? `${roleOf(el)} "${nameOf(el).replace(/"/g, "'").slice(0, 60)}"` : '');

  // --- landmarks: show / hide, with lineage ------------------------------
  const visible = (el: Element): boolean => {
    if (!el.isConnected || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const isLandmark = (el: Element): boolean =>
    LANDMARK_ROLES.has(roleOf(el)) || el.tagName === 'DIALOG' || el.hasAttribute('popover') || el.getAttribute('aria-modal') === 'true' || (el.hasAttribute('aria-live') && el.getAttribute('aria-live') !== 'off');
  interface Lm {
    id: number;
    vis: boolean;
    sa?: number;
  }
  const tracked = new Map<Element, Lm>();
  let nextId = 1;
  // While the document is still parsing, what appears is the page arriving, not a change: baseline only.
  let ready = document.readyState !== 'loading';
  const track = (el: Element, emit: boolean) => {
    if (tracked.has(el) || tracked.size >= 300) return;
    const st: Lm = { id: nextId++, vis: visible(el) };
    tracked.set(el, st);
    if (st.vis) {
      st.sa = Date.now();
      if (emit) push({ k: 'show', d: desc(el), lm: st.id });
    }
  };
  const scan = (root: Node, emit: boolean) => {
    if (!(root instanceof Element)) return;
    if (isLandmark(root)) track(root, emit);
    let n = 0;
    for (const el of Array.from(root.querySelectorAll(LM_SEL))) {
      if (n++ > 60) break;
      track(el, emit);
    }
  };
  const recheck = () => {
    for (const [el, st] of tracked) {
      const v = visible(el);
      if (v !== st.vis) {
        st.vis = v;
        if (v) {
          st.sa = Date.now();
          push({ k: 'show', d: desc(el), lm: st.id });
        } else {
          push({ k: 'hide', d: desc(el), lm: st.id, ...(st.sa ? { sa: st.sa } : {}), ...(el.isConnected ? {} : { gone: 1 }) });
        }
      }
      if (!el.isConnected) tracked.delete(el);
    }
  };
  const inVisibleLandmark = (el: Element): boolean => {
    for (const [lm, st] of tracked) if (st.vis && lm.contains(el)) return true;
    return false;
  };

  // --- text of headings and live regions ----------------------------------
  const lastText = new WeakMap<Element, string>();
  const rate = new WeakMap<Element, { n: number; since: number }>();
  const noteText = (host: Element) => {
    const x = textOf(host, 80);
    const prev = lastText.get(host);
    if (prev === x) return;
    lastText.set(host, x);
    const now = Date.now();
    const st = rate.get(host) ?? { n: 0, since: now };
    if (now - st.since > 10_000) {
      st.n = 0;
      st.since = now;
    }
    st.n++;
    rate.set(host, st);
    if (st.n === 4) push({ k: 'txt', d: roleOf(host), x, per: 1 });
    if (st.n >= 4) return;
    push({ k: 'txt', d: roleOf(host), x, ...(prev !== undefined ? { was: prev } : {}) });
  };

  // --- option ticks --------------------------------------------------------
  const ON_TOKEN = /^(checked|is-checked|ticked|chosen)$/;
  const MARK_HIDDEN = /^(invisible|hidden|d-none|is-hidden|hide)$/;
  const WATCHED_TOKEN = /select|activ|current|check|tick|chosen|invisible|hidden/;
  const classTick = (el: Element, old: string | null) => {
    const host = el.closest(OPTION_SEL) ?? (inVisibleLandmark(el) ? el.closest('.item,li,[data-value]') : null);
    if (!host) return;
    const before = new Set((old ?? '').split(/\s+/).filter(Boolean));
    const after = new Set((el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean));
    const added = [...after].filter((x) => !before.has(x));
    const removed = [...before].filter((x) => !after.has(x));
    if (![...added, ...removed].some((x) => WATCHED_TOKEN.test(x))) return;
    let on: boolean | undefined;
    if (el === host) {
      if (added.some((x) => ON_TOKEN.test(x))) on = true;
      else if (removed.some((x) => ON_TOKEN.test(x))) on = false;
    } else if (removed.some((x) => MARK_HIDDEN.test(x))) on = true;
    else if (added.some((x) => MARK_HIDDEN.test(x))) on = false;
    else if (added.some((x) => ON_TOKEN.test(x))) on = true;
    else if (removed.some((x) => ON_TOKEN.test(x))) on = false;
    push({ k: 'state', d: desc(host), a: 'class', x: [...added.map((x) => `+${x}`), ...removed.map((x) => `-${x}`)].join(' ').slice(0, 60), ...(on !== undefined ? { on } : {}) });
  };

  // --- field values ---------------------------------------------------------
  const fieldValue = (el: Element): string | null => {
    if (el instanceof HTMLInputElement) return el.type === 'checkbox' || el.type === 'radio' ? String(el.checked) : el.value;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value;
    if (el instanceof HTMLElement && el.isContentEditable) return el.textContent ?? '';
    return null;
  };
  const seenValue = new Map<Element, string>();
  let lastVal: { el: Element; rec: Record<string, unknown> } | null = null;
  const noteVal = (el: Element, src: 'e' | 'd') => {
    const v = fieldValue(el);
    if (v === null) return;
    const pw = el instanceof HTMLInputElement && el.type === 'password';
    const key = pw ? `pw:${v.length}` : fnv(v);
    const prev = seenValue.get(el);
    if (prev === key) return;
    const first = prev === undefined;
    seenValue.set(el, key);
    if (seenValue.size > 100) seenValue.delete(seenValue.keys().next().value as Element);
    if (src === 'd' && first) return; // a field first met at a drain has no before
    if (lastVal && lastVal.el === el && buf[buf.length - 1] === lastVal.rec) {
      lastVal.rec.t = Date.now();
      lastVal.rec.len = v.length;
      if (!pw) lastVal.rec.h = key;
      return;
    }
    // `was`: the hash the field held before this change (seen at focus or an
    // earlier drain), so a set that puts a field back is provably a restore
    // (round 62, snipeit fwsi13: Asset Tag's pre-filled tag cleared and
    // filled back). Never for a password field; a credential's hash is
    // scrubbed daemon-side as `h` is.
    const was = !pw && prev !== undefined && !prev.startsWith('pw:') ? { was: prev } : {};
    const rec = push({ k: 'val', f: desc(el), len: v.length, ...(pw ? { pw: 1 } : { h: key, ...was }), ...(src === 'd' ? { src: 'd' } : {}) });
    lastVal = { el, rec };
  };
  const onValue = (ev: Event) => {
    const el = ev.composedPath()[0];
    if (!(el instanceof Element)) return;
    noteVal(el, 'e');
    if (ev.type === 'change' && el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) push({ k: 'state', d: desc(el), a: 'checked', on: el.checked });
  };
  document.addEventListener('input', onValue, true);
  document.addEventListener('change', onValue, true);

  // --- focus ----------------------------------------------------------------
  const onFocus = (ev: FocusEvent) => {
    const el = ev.target;
    if (!(el instanceof Element) || el === document.body || el === document.documentElement) return;
    // What gets focus is a field worth re-checking at the next drain.
    if (ev.type === 'focusin' && fieldValue(el) !== null && !seenValue.has(el)) seenValue.set(el, (el instanceof HTMLInputElement && el.type === 'password') ? `pw:${(fieldValue(el) ?? '').length}` : fnv(fieldValue(el) ?? ''));
    push({ k: 'foc', dir: ev.type === 'focusin' ? 'in' : 'out', d: desc(el) });
  };
  document.addEventListener('focusin', onFocus, true);
  document.addEventListener('focusout', onFocus, true);

  // --- where a click landed ---------------------------------------------------
  let intended: Element | null = null;
  const onHit = (ev: MouseEvent, ty: 'pd' | 'c') => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const on = intended ? intended === t || intended.contains(t) || t.contains(intended) : undefined;
    const top = typeof ev.clientX === 'number' && ev.isTrusted ? document.elementFromPoint(ev.clientX, ev.clientY) : null;
    const rec = push({ k: 'hit', ty, d: desc(t), tr: ev.isTrusted ? 1 : 0, ...(on === undefined ? {} : { on: on ? 1 : 0 }), ...(on === false ? { cover: desc(top ?? t) } : {}) });
    if (ty === 'c') setTimeout(() => {
      if (ev.defaultPrevented) rec.pv = 1;
    }, 0);
  };
  document.addEventListener('pointerdown', (ev) => onHit(ev, 'pd'), true);
  document.addEventListener('click', (ev) => onHit(ev, 'c'), true);

  // --- the observer -----------------------------------------------------------
  const observer = new MutationObserver((records) => {
    let again = false;
    const hosts = new Set<Element>();
    const textHost = (n: Node) => {
      const el = n.nodeType === Node.TEXT_NODE ? n.parentElement : n instanceof Element ? n : null;
      const host = el?.closest(TEXT_HOST_SEL);
      if (host) hosts.add(host);
    };
    for (const r of records) {
      if (r.type === 'childList') {
        for (const n of Array.from(r.addedNodes)) scan(n, ready);
        if (r.removedNodes.length) again = true;
        textHost(r.target);
      } else if (r.type === 'characterData') {
        textHost(r.target);
      } else if (r.type === 'attributes' && r.target instanceof Element) {
        const el = r.target;
        const name = r.attributeName ?? '';
        if (ARIA_STATE.has(name)) {
          const v = el.getAttribute(name);
          if (v !== r.oldValue) push({ k: 'state', d: desc(el), a: name, on: v === 'true' });
        }
        if (name === 'class') classTick(el, r.oldValue);
        if (VIS_ATTRS.has(name)) again = true;
      }
    }
    if (again && ready) recheck();
    for (const h of hosts) {
      if (ready) noteText(h);
      else lastText.set(h, textOf(h, 80));
    }
  });
  const start = () => {
    observer.observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'open', 'aria-expanded', 'aria-selected', 'aria-checked', 'aria-pressed'],
    });
    if (document.documentElement) scan(document.documentElement, false);
    for (const h of Array.from(document.querySelectorAll(TEXT_HOST_SEL)).slice(0, 200)) lastText.set(h, textOf(h, 80));
  };
  start();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {
    ready = true;
    scan(document.documentElement, false);
    for (const st of tracked.values()) st.vis = false;
    for (const [el, st] of tracked) {
      st.vis = visible(el);
      if (st.vis) st.sa = Date.now();
    }
    for (const h of Array.from(document.querySelectorAll(TEXT_HOST_SEL)).slice(0, 200)) if (!lastText.has(h)) lastText.set(h, textOf(h, 80));
  });

  g.__slj = {
    intend(el: Element | null) {
      intended = el;
    },
    drain() {
      for (const el of [...seenValue.keys()]) if (el.isConnected) noteVal(el, 'd');
      recheck();
      const out = buf;
      const d = dropped;
      buf = [];
      dropped = 0;
      lastVal = null;
      intended = null;
      return { ev: out, dropped: d };
    },
  };
}

/** The init script every document of a recording session runs (idempotent). */
export const JOURNAL_PAGE_SCRIPT = `(${journalInPage.toString()})();`;
