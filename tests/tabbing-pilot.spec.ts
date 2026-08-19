/**
 * Pilot for the tabbing experiment (experiments/tabbing/README.md).
 *
 * Runs every mechanism the full matrix depends on, on one page each, and
 * asserts the fixtures themselves behave as designed. If this is red, the
 * numbers the full experiment produces are meaningless.
 */
import { test, expect } from '@playwright/test';
import type { Server } from 'node:http';
import { startFixtureServer } from '../experiments/tabbing/server';
import { ensureReactBundle } from '../experiments/tabbing/build';
import { INIT_SCRIPT } from '../experiments/tabbing/instrument';
import { computeTabOrder, focusableSet } from '../experiments/tabbing/taborder';
import { resolveProbeNodes, centerOf, pageDetector, d5CdpListeners, d6ListenerShim, d8HoverDiff } from '../experiments/tabbing/candidates';
import { runDifferential, measureCoverageBaseline, jaccard } from '../experiments/tabbing/differential';
import { loadTruth } from '../experiments/tabbing/score';

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  await ensureReactBundle();
  ({ server, baseUrl } = await startFixtureServer());
});
test.afterAll(async () => { server?.close(); });

test.use({ viewport: { width: 1280, height: 900 } });

test.describe('pilot', () => {
  test('fixture corpus is complete and self-consistent', async ({ page }) => {
    const truth = loadTruth();
    const labelled = Object.keys(truth.probes);
    const listed = Object.values(truth.pages).flat();
    expect(new Set(listed)).toEqual(new Set(labelled));

    // Every probe declared for a page is actually present on that page.
    await page.addInitScript(INIT_SCRIPT);
    for (const [file, probes] of Object.entries(truth.pages)) {
      await page.goto(`${baseUrl}/${file}`, { waitUntil: 'load' });
      const cdp = await page.context().newCDPSession(page);
      const found = await resolveProbeNodes(cdp, probes, page);
      await cdp.detach();
      expect(new Set(found.keys()), `probes missing from ${file}`).toEqual(new Set(probes));
    }
  });

  test('instrumentation installs and observes every channel', async ({ page }) => {
    await page.addInitScript(INIT_SCRIPT);
    await page.goto(`${baseUrl}/e-nodom.html`, { waitUntil: 'load' });

    const before = await page.evaluate(() => (window as any).__a11y.snapshot());
    await page.evaluate(() => {
      fetch('/api/ping?probe=pilot');
      localStorage.setItem('pilot', '1');
      console.log('pilot');
      const c = (document.getElementById('cv') as HTMLCanvasElement).getContext('2d')!;
      c.fillRect(0, 0, 10, 10);
      document.getElementById('sink')!.appendChild(document.createElement('b'));
      location.hash = 'pilot';
    });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => (window as any).__a11y.snapshot());
    const delta = await page.evaluate(([b, a]) => (window as any).__a11y.delta(b, a), [before, after] as const);

    for (const ch of ['dom', 'net', 'storage', 'console', 'canvas', 'nav', 'mutations']) {
      expect(delta[ch], `channel ${ch} did not fire`).toBe(true);
    }
  });

  test('scrolling does not register as an activation effect', async ({ page }) => {
    await page.addInitScript(INIT_SCRIPT);
    await page.goto(`${baseUrl}/a-vanilla.html`, { waitUntil: 'load' });
    const before = await page.evaluate(() => (window as any).__a11y.snapshot());
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => (window as any).__a11y.snapshot());
    const delta = await page.evaluate(([b, a]) => (window as any).__a11y.delta(b, a), [before, after] as const);
    expect(delta.geometry, 'page scroll leaked into the geometry channel').toBe(false);
    expect(delta.dom).toBe(false);
  });

  test('real Tab traversal reflects tabindex ordering, not document order', async ({ page }) => {
    await page.addInitScript(INIT_SCRIPT);
    await page.goto(`${baseUrl}/g-taborder.html`, { waitUntil: 'load' });
    const t = await computeTabOrder(page);

    // tabindex=5 is reached before any tabindex=0 / native control.
    expect(t.order[0]).toBe('p80');
    expect(t.order).toContain('p84');
    expect(t.order).toContain('p86');
    // Not in the tab order: tabindex=-1, disabled, inert, visibility:hidden.
    for (const excluded of ['p81', 'p85', 'p82', 'p83']) {
      expect(t.order, `${excluded} should not be a tab stop`).not.toContain(excluded);
    }

    // §3.3: el.focus() answers a different question than Tab does.
    const focusable = await focusableSet(page);
    expect(focusable, 'tabindex=-1 is focusable but not a tab stop').toContain('p81');
  });

  test('trusted CDP input hit-tests; element.click() does not', async ({ page }) => {
    await page.addInitScript(INIT_SCRIPT);
    await page.goto(`${baseUrl}/f-occlusion.html`, { waitUntil: 'load' });
    const cdp = await page.context().newCDPSession(page);
    const nodes = await resolveProbeNodes(cdp, ['p70']);
    const c = centerOf(nodes.get('p70')!)!;

    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__fired), 'trusted click must hit the veil, not the element').toEqual([]);

    await page.evaluate(() => (window as any).__a11y.findProbe('p70', true).click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__fired), 'untrusted click ignores occlusion').toEqual(['p70']);
    await cdp.detach();
  });

  test('candidate generators each return something on their target page', async ({ page }) => {
    await page.addInitScript(INIT_SCRIPT);
    const cdp = await page.context().newCDPSession(page);

    await page.goto(`${baseUrl}/a-vanilla.html`, { waitUntil: 'load' });
    const nodes = await resolveProbeNodes(cdp);
    expect(await pageDetector(page, 'attrScan')).toContain('p11');
    expect(await pageDetector(page, 'cssLexical')).toContain('p01');
    expect(await d5CdpListeners(cdp, nodes)).toContain('p01');
    expect((await d6ListenerShim(page)).hits).toContain('p01');

    await page.goto(`${baseUrl}/react/index.html`, { waitUntil: 'load' });
    expect(await pageDetector(page, 'reactProps'), 'React fiber props').toContain('p50');

    await page.goto(`${baseUrl}/c-hover.html`, { waitUntil: 'load' });
    const hoverNodes = await resolveProbeNodes(cdp);
    expect(await d8HoverDiff(page, hoverNodes)).toContain('p30');
    await cdp.detach();
  });

  test('the differential oracle separates a defect from a correct control', async ({ page }) => {
    await page.addInitScript(INIT_SCRIPT);
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`${baseUrl}/a-vanilla.html`, { waitUntil: 'load' });
    const tabOrder = await computeTabOrder(page);
    const opts = { baseUrl, url: `${baseUrl}/a-vanilla.html`, includeHover: true };

    const bad = await runDifferential(page, cdp, 'p01', tabOrder, opts);
    expect(bad.mouse.channels.length, 'mouse must produce an effect on p01').toBeGreaterThan(0);
    expect(bad.keyboard.channels, 'keyboard must produce none').toEqual([]);
    expect(bad.mouse.coverage.length, 'V8 coverage must see the handler run').toBeGreaterThan(0);

    const good = await runDifferential(page, cdp, 'p09', tabOrder, opts);
    expect(good.mouse.channels.length).toBeGreaterThan(0);
    expect(good.keyboard.channels.length, 'p09 has an Enter/Space handler').toBeGreaterThan(0);
    await cdp.detach();
  });

  test('state is observed inside iframes, not just the top document', async ({ page }) => {
    await page.addInitScript(INIT_SCRIPT);
    const cdp = await page.context().newCDPSession(page);
    const url = `${baseUrl}/h-shadow.html`;
    await page.goto(url, { waitUntil: 'load' });
    const tabOrder = await computeTabOrder(page);

    const d = await runDifferential(page, cdp, 'p92', tabOrder, { baseUrl, url, includeHover: true });
    expect(d.mouse.channels, 'a click inside an iframe must register somewhere').not.toEqual([]);
    expect(d.mouse.coverage.length).toBeGreaterThan(0);
    await cdp.detach();
  });

  test('each probe has its own handler, so coverage sets discriminate', async ({ page }) => {
    await page.addInitScript(INIT_SCRIPT);
    const cdp = await page.context().newCDPSession(page);
    const url = `${baseUrl}/a-vanilla.html`;
    await page.goto(url, { waitUntil: 'load' });
    const tabOrder = await computeTabOrder(page);
    const opts = { baseUrl, url, includeHover: true };

    const bad = await runDifferential(page, cdp, 'p01', tabOrder, opts);
    const good = await runDifferential(page, cdp, 'p07', tabOrder, opts);
    // They share fired(), so overlap is expected — but they must not be equal,
    // or Stage-4 equivalence would dismiss every defect on the page.
    expect(jaccard(bad.mouse.coverage, good.mouse.coverage)).toBeLessThan(1);
    await cdp.detach();
  });

  test('the coverage baseline strips a framework\'s per-click machinery', async ({ page }) => {
    await page.addInitScript(INIT_SCRIPT);
    const cdp = await page.context().newCDPSession(page);
    const url = `${baseUrl}/react/index.html`;
    const baseline = await measureCoverageBaseline(page, cdp, baseUrl, url);
    expect(baseline.size, 'a click anywhere in a React page runs React dispatch').toBeGreaterThan(10);

    await page.goto(url, { waitUntil: 'load' });
    const tabOrder = await computeTabOrder(page);
    const raw = await runDifferential(page, cdp, 'p55', tabOrder, { baseUrl, url, includeHover: true });
    const net = await runDifferential(page, cdp, 'p55', tabOrder, { baseUrl, url, includeHover: true, coverageBaseline: baseline });
    // p55 has no onClick: with the baseline removed it should run (almost) nothing.
    expect(net.mouse.coverage.length).toBeLessThan(raw.mouse.coverage.length);
    await cdp.detach();
  });

  test('coverage-diff sees handlers that leave no DOM trace', async ({ page }) => {
    await page.addInitScript(INIT_SCRIPT);
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`${baseUrl}/e-nodom.html`, { waitUntil: 'load' });
    const tabOrder = await computeTabOrder(page);
    const d = await runDifferential(page, cdp, 'p61', tabOrder, { baseUrl, url: `${baseUrl}/e-nodom.html`, includeHover: true });

    expect(d.mouse.channels, 'localStorage-only handler must not touch the DOM').not.toContain('dom');
    expect(d.mouse.channels, 'the storage channel must catch it').toContain('storage');
    expect(d.mouse.coverage.length, 'and so must coverage').toBeGreaterThan(0);
    await cdp.detach();
  });
});
