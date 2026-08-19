import type { Page, Frame } from '@playwright/test';

/**
 * Set T — the real tab order (tabbing.md §3.3).
 *
 * Computed by dispatching actual Tab keypresses through CDP and reading
 * document.activeElement after each one, recursing into open shadow roots and
 * into same-origin frames. el.focus() is deliberately not used: it tests
 * focusability, which is a different question, and tabindex > 0 reorders the
 * sequence away from document order.
 */
export interface TabOrder {
  /** probe ids in the order Tab reaches them */
  order: string[];
  /** how many Tab presses were needed to reach each probe (1-based) */
  index: Map<string, number>;
  /** focus stops that landed on an element with no data-probe */
  unlabelled: number;
  /** true if traversal hit the press cap instead of cycling */
  truncated: boolean;
}

const ACTIVE_PROBE = `(() => {
  // Descend through open shadow roots to the innermost active element.
  let el = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { probe: null, tag: null };
  return {
    probe: el.getAttribute ? el.getAttribute('data-probe') : null,
    tag: el.tagName.toLowerCase(),
    isFrame: el.tagName === 'IFRAME',
  };
})()`;

async function activeProbe(page: Page): Promise<{ probe: string | null; tag: string | null }> {
  const top = await page.evaluate(ACTIVE_PROBE) as { probe: string | null; tag: string | null; isFrame?: boolean };
  if (!top.isFrame) return top;
  // Focus is inside a frame: the top document only reports the <iframe>.
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const inner = await frame.evaluate(ACTIVE_PROBE).catch(() => null) as { probe: string | null; tag: string | null } | null;
    if (inner && inner.tag) return inner;
  }
  return top;
}

export async function computeTabOrder(page: Page, maxPresses = 80): Promise<TabOrder> {
  // Start from a known point: focus the document body, not an element.
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur?.(); });

  const order: string[] = [];
  const index = new Map<string, number>();
  const seenTags: string[] = [];
  let unlabelled = 0;
  let truncated = true;

  for (let i = 1; i <= maxPresses; i++) {
    await page.keyboard.press('Tab');
    const { probe, tag } = await activeProbe(page);

    // The order has cycled once we are back at the first stop we recorded.
    if (order.length > 0 && probe && probe === order[0] && i > 1) { truncated = false; break; }
    if (!probe && seenTags.length > 0 && tag === null) { truncated = false; break; }

    if (probe) {
      if (!index.has(probe)) { index.set(probe, i); order.push(probe); }
      else { truncated = false; break; }
    } else {
      unlabelled++;
    }
    seenTags.push(tag ?? '(none)');
  }

  return { order, index, unlabelled, truncated };
}

/**
 * The contrast case for §3.3: which probes report themselves as focusable when
 * asked directly with el.focus(). Any probe focusable-but-not-in-T is exactly
 * the class a focus()-based checker would wrongly clear.
 */
export async function focusableSet(target: Page | Frame): Promise<string[]> {
  return target.evaluate(() => {
    const out: string[] = [];
    for (const el of (window as any).__a11y.allElements(true)) {
      const id = el.getAttribute?.('data-probe');
      if (!id) continue;
      const before = document.activeElement;
      try { (el as HTMLElement).focus?.(); } catch { /* not focusable */ }
      let active: Element | null = document.activeElement;
      while (active && (active as any).shadowRoot?.activeElement) active = (active as any).shadowRoot.activeElement;
      if (active === el) out.push(id);
      (before as HTMLElement | null)?.focus?.();
    }
    return out;
  });
}
