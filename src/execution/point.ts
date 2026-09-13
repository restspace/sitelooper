import type { Locator, Page } from 'playwright-core';

/**
 * Geometry as a locator kind, shared by daemon replay and the standalone
 * artifact.
 *
 * A `point` candidate says where the element WAS: its box in document
 * coordinates and the viewport it was recorded in, plus the role (or tag) it
 * had. It is resolved in two moves — `markPoint` finds the element under the
 * recorded point, walks up to the recorded KIND of thing, and tags it; then
 * `pointLocator` names the tag — so that the result is an ordinary Locator
 * that stands only when the role matches: a locator, not a blind click.
 *
 * The same box is the yardstick a positional guess is measured against (see
 * resolve.ts's plausibility rule).
 */
export interface PointGeometry {
  /** Centre of the recorded element, in document coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The role it had, or null when it had none — then `tag` decides. */
  role: string | null;
  tag: string;
  /** The viewport it was recorded in: what "near" means for the box. */
  vw: number;
  vh: number;
}

/** The attribute markPoint leaves on the element it found, so a sync Locator can name it. */
export const POINT_MARK = 'data-sitelooper-point';

export function pointToken(c: { x: number; y: number }): string {
  return `${c.x},${c.y}`;
}

/** The Locator naming what markPoint tagged for this point. Empty until markPoint has run on this page. */
export function pointLocator(page: Page, c: { x: number; y: number }): Locator {
  return page.locator(`[${POINT_MARK}=${JSON.stringify(pointToken(c))}]`);
}

/**
 * Find the element under a recorded point, walk up to its actionable
 * ancestor, and tag it for pointLocator — but only when it is the KIND of
 * thing recorded (same role, or same tag when the recording had no role).
 * Returns what it found, or null when nothing of that kind is there. Scrolls
 * the window so the point is on screen first; a point in an inner scroller
 * is found only when that scroller sits where it was recorded.
 */
export async function markPoint(page: Page, c: PointGeometry): Promise<{ role: string | null; tag: string } | null> {
  try {
    return await page.evaluate(
      ({ x, y, role, tag, mark, token }) => {
        const ACTIONABLE = 'button,a[href],input,select,textarea,summary,[role],[tabindex],label';
        const targetY = y - window.innerHeight / 2;
        if (Math.abs(window.scrollY - targetY) > window.innerHeight / 2 || x - window.scrollX > window.innerWidth) {
          window.scrollTo(Math.max(0, x - window.innerWidth / 2), Math.max(0, targetY));
        }
        const hit = document.elementFromPoint(x - window.scrollX, y - window.scrollY);
        if (!hit) return null;
        const kindOf = (el: Element): { role: string | null; tag: string } => {
          const tagOf = el.tagName.toLowerCase();
          const type = (el.getAttribute('type') || '').toLowerCase();
          const implicit = (): string | null => {
            if (tagOf === 'button') return 'button';
            if (tagOf === 'a') return el.hasAttribute('href') ? 'link' : null;
            if (tagOf === 'select') return el.hasAttribute('multiple') ? 'listbox' : 'combobox';
            if (tagOf === 'textarea') return 'textbox';
            if (tagOf === 'img') return 'img';
            if (/^h[1-6]$/.test(tagOf)) return 'heading';
            if (tagOf === 'input') {
              if (type === 'checkbox') return 'checkbox';
              if (type === 'radio') return 'radio';
              if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
              if (type === 'search') return 'searchbox';
              if (type === 'number') return 'spinbutton';
              if (['text', 'email', 'tel', 'url', 'password', ''].includes(type)) return 'textbox';
              return null;
            }
            return null;
          };
          return { role: el.getAttribute('role') || implicit(), tag: tagOf };
        };
        // The point lands on whatever is painted there — a heading's text
        // span, a button's icon. Walk up a few ancestors for the recorded
        // KIND (fwgr27: every heading point missed because the hit was the
        // title's inner span); failing that, the nearest actionable ancestor.
        let el: Element | null = null;
        for (let cur: Element | null = hit, hops = 0; cur && hops < 6; cur = cur.parentElement, hops++) {
          const k = kindOf(cur);
          if (role ? k.role === role : k.tag === tag) {
            el = cur;
            break;
          }
        }
        el ??= (hit.closest(ACTIONABLE) as Element | null) ?? hit;
        const { role: roleOf, tag: tagOf } = kindOf(el);
        const same = role ? roleOf === role : tagOf === tag;
        if (!same) return null;
        for (const old of Array.from(document.querySelectorAll(`[${mark}]`))) old.removeAttribute(mark);
        el.setAttribute(mark, token);
        return { role: roleOf, tag: tagOf };
      },
      { x: c.x, y: c.y, role: c.role, tag: c.tag, mark: POINT_MARK, token: pointToken(c) },
    );
  } catch {
    return null;
  }
}
