import type { Locator } from 'playwright-core';
export { reactSafeFill, reactSafeSelect, syntheticHover } from '../execution/browser.js';

/**
 * The option a <select> currently shows: its visible label and its value.
 * Null for anything that is not a single-choice select with a selection.
 */
export async function selectedOption(locator: Locator): Promise<{ label: string; value: string } | null> {
  return locator
    .evaluate((el) => {
      if (!(el instanceof HTMLSelectElement) || el.multiple) return null;
      const opt = el.selectedOptions[0];
      return opt ? { label: opt.label.trim(), value: opt.value } : null;
    })
    .catch(() => null);
}

/**
 * HTML5 drag-and-drop fallback: dispatch a full dragstart/dragover/drop
 * sequence with a shared DataTransfer, for libraries that implement DnD on
 * the HTML5 events with custom payloads (where Playwright's mouse-based
 * dragTo doesn't trigger the drop handler).
 */
export async function html5DragDrop(source: Locator, target: Locator): Promise<void> {
  const page = source.page();
  const sourceHandle = await source.elementHandle();
  const targetHandle = await target.elementHandle();
  try {
    if (!sourceHandle || !targetHandle) throw new Error('drag source or target not found');
    await page.evaluate(
    ([src, dst]) => {
      const dataTransfer = new DataTransfer();
      const fire = (el: Element, type: string) => {
        const rect = el.getBoundingClientRect();
        el.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            dataTransfer,
          }),
        );
      };
      fire(src, 'dragstart');
      fire(dst, 'dragenter');
      fire(dst, 'dragover');
      fire(dst, 'drop');
      fire(src, 'dragend');
    },
    [sourceHandle, targetHandle] as const,
    );
  } finally {
    await sourceHandle?.dispose().catch(() => {});
    await targetHandle?.dispose().catch(() => {});
  }
}
