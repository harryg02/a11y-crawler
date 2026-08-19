import type { Page, Frame, CDPSession } from '@playwright/test';
import { collectClickables } from '../../lib/crawler/scanner';

/** A resolved probe element: CDP node id plus its box in top-viewport pixels. */
export interface ProbeNode {
  probe: string;
  nodeId: number;
  tag: string;
  box: { x: number; y: number; w: number; h: number } | null;
  inShadow: boolean;
  inFrame: boolean;
  /** which enumeration surface found it — CDP pierce, or the attachShadow shim */
  via: 'cdp' | 'shim';
}

interface CdpNode {
  nodeId: number;
  nodeName: string;
  nodeType: number;
  attributes?: string[];
  children?: CdpNode[];
  shadowRoots?: CdpNode[];
  contentDocument?: CdpNode;
  templateContent?: CdpNode;
  shadowRootType?: string;
}

function attr(node: CdpNode, name: string): string | undefined {
  const a = node.attributes ?? [];
  for (let i = 0; i < a.length; i += 2) if (a[i] === name) return a[i + 1];
  return undefined;
}

/**
 * Builds the probe → CDP-node table by walking the pierced DOM tree. This is
 * the single element-addressing surface the whole experiment uses: it reaches
 * open shadow roots, closed shadow roots and same-origin frames uniformly, and
 * yields viewport coordinates for trusted input (tabbing.md §1.3, §3.4).
 */
export async function resolveProbeNodes(
  cdp: CDPSession,
  only?: string[],
  page?: Page,
): Promise<Map<string, ProbeNode>> {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true }) as { root: CdpNode };
  const found = new Map<string, ProbeNode>();

  const walk = (node: CdpNode, inShadow: boolean, inFrame: boolean) => {
    if (node.nodeType === 1) {
      const probe = attr(node, 'data-probe');
      if (probe && !found.has(probe)) {
        found.set(probe, {
          probe, nodeId: node.nodeId, tag: node.nodeName.toLowerCase(),
          box: null, inShadow, inFrame, via: 'cdp',
        });
      }
    }
    for (const c of node.children ?? []) walk(c, inShadow, inFrame);
    for (const s of node.shadowRoots ?? []) walk(s, true, inFrame);
    if (node.contentDocument) walk(node.contentDocument, inShadow, true);
    if (node.templateContent) walk(node.templateContent, inShadow, inFrame);
  };
  walk(root, false, false);

  const wanted = only ? new Set(only) : null;
  for (const p of found.values()) {
    if (wanted && !wanted.has(p.probe)) continue;
    try {
      const { model } = await cdp.send('DOM.getBoxModel', { nodeId: p.nodeId }) as any;
      // border quad: [x1,y1, x2,y2, x3,y3, x4,y4]
      const q = model.border as number[];
      const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
      const x = Math.min(...xs), y = Math.min(...ys);
      p.box = { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    } catch {
      p.box = null; // not rendered (display:none, zero-size, detached)
    }
  }

  // DOM.getDocument({pierce:true}) does NOT expose CLOSED shadow roots. When a
  // page is available, fall back to the document-start attachShadow shim, which
  // does — recorded as via:'shim' so the two surfaces stay distinguishable.
  if (page) {
    const missing = (only ?? []).filter(id => !found.has(id));
    for (const id of missing) {
      for (const target of [page, ...page.frames().filter(f => f !== page.mainFrame())]) {
        const info = await resolveViaShim(target, id).catch(() => null);
        if (!info) continue;
        found.set(id, {
          probe: id, nodeId: -1, tag: info.tag, box: info.box,
          inShadow: info.inShadow, inFrame: target !== page, via: 'shim',
        });
        break;
      }
    }
  }
  return found;
}

/** Page-script element lookup, including closed shadow roots, in top-viewport pixels. */
async function resolveViaShim(target: Page | Frame, probe: string) {
  return target.evaluate((id: string) => {
    const el = (window as any).__a11y?.findProbe(id, true);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // Offset by the frame chain so coordinates are comparable to CDP's.
    let ox = 0, oy = 0, win: any = window;
    while (win !== win.parent) {
      const fe = win.frameElement;
      if (!fe) break;
      const fr = fe.getBoundingClientRect();
      ox += fr.x; oy += fr.y; win = win.parent;
    }
    return {
      tag: el.tagName.toLowerCase(),
      inShadow: el.getRootNode() !== document,
      box: r.width || r.height ? { x: r.x + ox, y: r.y + oy, w: r.width, h: r.height } : null,
    };
  }, probe);
}

export function centerOf(p: ProbeNode): { x: number; y: number } | null {
  if (!p.box || p.box.w === 0 || p.box.h === 0) return null;
  return { x: p.box.x + p.box.w / 2, y: p.box.y + p.box.h / 2 };
}

// ---------------------------------------------------------------------------
// D0 — what this repo ships today
// ---------------------------------------------------------------------------

/**
 * The crawler's own candidate set (lib/crawler/scanner.ts `collectClickables`),
 * mapped onto probe ids.
 *
 * The selector strings collectClickables emits are `tag#id` or `tag.class1.class2`,
 * which are not unique — re-querying them lands on the first match rather than
 * the element they were derived from. Measuring recall through those strings
 * would understate the generator, so identity is read off the matched element
 * instead, and the collision rate is reported separately by `d0SelectorCollisions`.
 */
export async function d0CurrentCrawler(page: Page): Promise<string[]> {
  const out = new Set<string>();
  for (const t of [page, ...page.frames().filter(f => f !== page.mainFrame())]) {
    const ids = await t.evaluate(() => {
      // Mirrors the candidate query and filters in collectClickables().
      const candidates = document.querySelectorAll(
        'button, [role="button"], [role="tab"], [role="menuitem"], ' +
        '[role="switch"], [role="checkbox"], [role="radio"], ' +
        'details > summary, [aria-expanded], [aria-haspopup], ' +
        'select, [onclick]',
      );
      const res: string[] = [];
      for (const el of candidates) {
        if (el.closest('a')) continue;
        if ((el as HTMLElement).offsetParent === null) continue;
        if (el.tagName === 'TD' || el.tagName === 'TR' || el.tagName === 'TH') continue;
        const probe = (window as any).__a11y.probeOf(el);
        if (probe) res.push(probe);
      }
      return res;
    }).catch(() => [] as string[]);
    for (const id of ids) out.add(id);
  }
  return [...out];
}

/**
 * How often the crawler's generated selector resolves to a different element
 * than the one it was generated from — the crawler clicks `.first()` match, so
 * every collision is a control it never actually reaches.
 */
export async function d0SelectorCollisions(page: Page): Promise<{ total: number; colliding: number; examples: string[] }> {
  let total = 0, colliding = 0;
  const examples: string[] = [];
  for (const t of [page, ...page.frames().filter(f => f !== page.mainFrame())]) {
    const clickables = await collectClickables(t as any).catch(() => []);
    for (const c of clickables) {
      total++;
      const n = await t.evaluate((sel: string) => {
        try { return document.querySelectorAll(sel).length; } catch { return -1; }
      }, c.selector).catch(() => -1);
      if (n > 1) {
        colliding++;
        if (examples.length < 5) examples.push(`${c.selector} → ${n} matches`);
      }
    }
  }
  return { total, colliding, examples };
}

// ---------------------------------------------------------------------------
// D2–D4, D7 — page-script detectors (open shadow roots + closed via the shim)
// ---------------------------------------------------------------------------

type PageDetector = 'attrScan' | 'handlerProp' | 'tabindexCounter' | 'cssLexical' | 'reactProps';

export async function pageDetector(page: Page, which: PageDetector): Promise<string[]> {
  const run = async (target: any) => target.evaluate((kind: PageDetector) => {
    const a11y = (window as any).__a11y;
    const hits = new Set<string>();

    const NATIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'audio', 'video', 'iframe']);
    const INTERACTIVE_ROLES = new Set([
      'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
      'menuitemcheckbox', 'menuitemradio', 'option', 'slider', 'spinbutton', 'treeitem',
    ]);
    const LEXICON = /(^|[-_ ])(btn|button|click|clickable|toggle|tab|selected|action|menu|icon|link|card|switch|dropdown|expand|close|open|nav)([-_ ]|$)/i;
    const INLINE = ['onclick', 'onkeyup', 'onkeydown', 'onkeypress', 'onmousedown', 'onmouseup', 'onmouseover'];

    const nativelyFocusable = (el: Element) => {
      const t = el.tagName.toLowerCase();
      if (!NATIVE.has(t)) return false;
      if (t === 'a') return el.hasAttribute('href');
      return !(el as any).disabled;
    };

    for (const el of a11y.allElements(true) as Element[]) {
      const probe = el.getAttribute?.('data-probe');
      if (!probe) continue;
      if (!a11y.isVisible(el)) continue;

      const role = el.getAttribute('role') ?? '';
      const hasTabindex = el.hasAttribute('tabindex');
      const hasInline = INLINE.some(a => el.hasAttribute(a));
      const cls = typeof el.className === 'string' ? el.className : '';

      if (kind === 'attrScan') {
        // HTML_CodeSniffer 2.1.1: inline handler attributes only (§7.3).
        if (hasInline && !nativelyFocusable(el) && !hasTabindex) hits.add(probe);
      } else if (kind === 'handlerProp') {
        // The *property*, not the attribute. React 19 assigns el.onclick
        // directly, so this sees React handlers that the attribute scan and the
        // addEventListener shim both miss.
        const hasProp = ['onclick', 'onmousedown', 'onmouseup', 'onmouseover', 'ondblclick']
          .some(k => typeof (el as any)[k] === 'function');
        if (hasProp) hits.add(probe);
      } else if (kind === 'tabindexCounter') {
        // "should be focusable but carries no tabindex"
        const looksInteractive = INTERACTIVE_ROLES.has(role) || hasInline || el.hasAttribute('aria-expanded') || el.hasAttribute('aria-haspopup');
        if (looksInteractive && !nativelyFocusable(el) && !hasTabindex) hits.add(probe);
      } else if (kind === 'cssLexical') {
        const cs = getComputedStyle(el);
        const looks = cs.cursor === 'pointer' || LEXICON.test(cls) || INTERACTIVE_ROLES.has(role);
        if (looks) hits.add(probe);
      } else if (kind === 'reactProps') {
        // §3.6: React's delegated handlers only show up in fiber props.
        for (const key of Object.keys(el)) {
          if (!key.startsWith('__reactProps$')) continue;
          const props = (el as any)[key];
          if (props && (props.onClick || props.onMouseDown || props.onMouseOver)) hits.add(probe);
        }
      }
    }
    return [...hits];
  }, which);

  const out = new Set<string>();
  for (const t of [page, ...page.frames().filter(f => f !== page.mainFrame())]) {
    for (const id of await run(t).catch(() => [])) out.add(id);
  }
  return [...out];
}

/**
 * Probes that pass KAFE's visibility heuristics (§7.10). Every candidate
 * generator is filtered through this, so none is charged with a false positive
 * on an element none of them should have considered.
 */
export async function visibleProbes(page: Page): Promise<Set<string>> {
  const out = new Set<string>();
  for (const t of [page, ...page.frames().filter(f => f !== page.mainFrame())]) {
    const ids = await t.evaluate(() => {
      const a11y = (window as any).__a11y;
      const res: string[] = [];
      for (const el of a11y.allElements(true) as Element[]) {
        const id = el.getAttribute?.('data-probe');
        if (id && a11y.isVisible(el)) res.push(id);
      }
      return res;
    }).catch(() => [] as string[]);
    for (const id of ids) out.add(id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// D5 — CDP DOMDebugger.getEventListeners, pierced (§3.4, §7.7)
// ---------------------------------------------------------------------------

const MOUSE_EVENTS = new Set(['click', 'mousedown', 'mouseup', 'mouseover', 'mouseenter', 'dblclick', 'pointerdown', 'pointerup']);

export async function d5CdpListeners(
  cdp: CDPSession,
  probes: Map<string, ProbeNode>,
  visible?: Set<string>,
): Promise<string[]> {
  const hits: string[] = [];
  for (const p of probes.values()) {
    if (visible && !visible.has(p.probe)) continue;
    let objectId: string | undefined;
    try {
      const resolved = await cdp.send('DOM.resolveNode', { nodeId: p.nodeId }) as any;
      objectId = resolved.object?.objectId;
    } catch { continue; }
    if (!objectId) continue;
    try {
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId, depth: 0, pierce: true }) as any;
      if ((listeners ?? []).some((l: any) => MOUSE_EVENTS.has(l.type))) hits.push(p.probe);
    } catch { /* node gone */ }
    finally {
      if (objectId) await cdp.send('Runtime.releaseObject', { objectId }).catch(() => {});
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// D6 — the addEventListener shim registry (§3.5)
// ---------------------------------------------------------------------------

export async function d6ListenerShim(
  page: Page,
  visible?: Set<string>,
): Promise<{ hits: string[]; provenance: Record<string, string> }> {
  const perTarget = await Promise.all(
    [page, ...page.frames().filter(f => f !== page.mainFrame())].map(t =>
      t.evaluate(() => {
        const a11y = (window as any).__a11y;
        const MOUSE = ['click', 'mousedown', 'mouseup', 'mouseover', 'mouseenter', 'dblclick', 'pointerdown'];
        const out: { probe: string; stack: string }[] = [];
        for (const rec of a11y.listeners) {
          if (!MOUSE.includes(rec.type)) continue;
          if (!rec.target || rec.target.nodeType !== 1) continue;   // document/window delegation
          const probe = rec.target.getAttribute?.('data-probe');
          if (probe) out.push({ probe, stack: rec.stack });
        }
        return out;
      }).catch(() => [] as { probe: string; stack: string }[]),
    ),
  );
  const hits = new Set<string>();
  const provenance: Record<string, string> = {};
  for (const rec of perTarget.flat()) {
    if (visible && !visible.has(rec.probe)) continue;
    hits.add(rec.probe);
    provenance[rec.probe] ??= rec.stack;
  }
  return { hits: [...hits], provenance };
}

// ---------------------------------------------------------------------------
// D8 — hover-diff rendering (§3.9)
// ---------------------------------------------------------------------------

/**
 * Screenshots each probe's box at rest and again with the mouse over its
 * centre. A pixel change is the site's own CSS declaring the element
 * interactive — no model, no training data.
 */
export async function d8HoverDiff(page: Page, probes: Map<string, ProbeNode>): Promise<string[]> {
  const hits: string[] = [];
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  const park = { x: vp.width - 2, y: vp.height - 2 };

  for (const p of probes.values()) {
    const c = centerOf(p);
    if (!c || c.x < 0 || c.y < 0 || c.x > vp.width || c.y > vp.height) continue;
    // Clip a generous margin: a hover often reveals a submenu *outside* the box.
    const clip = {
      x: Math.max(0, p.box!.x - 8),
      y: Math.max(0, p.box!.y - 8),
      width: Math.min(vp.width - Math.max(0, p.box!.x - 8), p.box!.w + 16),
      height: Math.min(vp.height - Math.max(0, p.box!.y - 8), p.box!.h + 200),
    };
    if (clip.width < 1 || clip.height < 1) continue;

    await page.mouse.move(park.x, park.y);
    await page.waitForTimeout(60);
    const rest = await page.screenshot({ clip }).catch(() => null);
    await page.mouse.move(c.x, c.y);
    await page.waitForTimeout(120);
    const hovered = await page.screenshot({ clip }).catch(() => null);
    if (rest && hovered && !rest.equals(hovered)) hits.push(p.probe);
  }
  await page.mouse.move(park.x, park.y);
  return hits;
}
