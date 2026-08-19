/**
 * Document-start instrumentation for the tabbing experiment.
 *
 * Installed via page.addInitScript, so it runs before any fixture script. It
 * provides two things the detectors need:
 *
 *  1. the addEventListener shim of tabbing.md §3.5 — every registration is
 *     recorded with its target and a stack trace;
 *  2. the state-observation surface of §2 — DOM, geometry/visibility, network,
 *     storage, console, navigation, canvas — so a mouse-vs-keyboard delta can
 *     be taken over channels wider than an innerHTML hash.
 *
 * It also records closed shadow roots (attachShadow is patched), which is not
 * in the doc but is the only way page-script enumeration can reach them; the
 * experiment scores that surface separately from the CDP one.
 */
export const INIT_SCRIPT = String.raw`
(() => {
  const W = window;
  if (W.__a11y) return;

  const listeners = [];      // §3.5: { target, type, stack }
  const closedRoots = [];    // shadow roots page script could not otherwise see
  const net = [];
  const storage = [];
  const consoleCalls = [];
  const canvasOps = [];
  const navEvents = [];
  let mutations = 0;

  // ---- §3.5 addEventListener shim -----------------------------------------
  const rawAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    try {
      const stack = (new Error()).stack || '';
      listeners.push({ target: this, type, stack: stack.split('\n').slice(2, 5).join(' | ') });
    } catch (e) { /* never break the page */ }
    return rawAdd.call(this, type, fn, opts);
  };

  // ---- closed shadow roots -------------------------------------------------
  const rawAttach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = rawAttach.call(this, init);
    if (init && init.mode === 'closed') closedRoots.push(root);
    return root;
  };

  // ---- state channels ------------------------------------------------------
  const rawFetch = W.fetch;
  if (rawFetch) {
    W.fetch = function (...args) {
      try { net.push('fetch ' + String(args[0])); } catch (e) {}
      return rawFetch.apply(this, args);
    };
  }
  const rawOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try { net.push('xhr ' + method + ' ' + url); } catch (e) {}
    return rawOpen.call(this, method, url, ...rest);
  };

  for (const name of ['setItem', 'removeItem', 'clear']) {
    const raw = Storage.prototype[name];
    Storage.prototype[name] = function (...args) {
      try { storage.push(name + ' ' + args[0]); } catch (e) {}
      return raw.apply(this, args);
    };
  }

  for (const name of ['log', 'info', 'warn', 'error', 'debug']) {
    const raw = console[name];
    console[name] = function (...args) {
      try { consoleCalls.push(name + ' ' + args.map(String).join(' ')); } catch (e) {}
      return raw.apply(this, args);
    };
  }

  const CANVAS_OPS = ['fillRect','strokeRect','clearRect','fill','stroke','drawImage','fillText','strokeText','putImageData'];
  if (W.CanvasRenderingContext2D) {
    for (const name of CANVAS_OPS) {
      const raw = CanvasRenderingContext2D.prototype[name];
      if (!raw) continue;
      CanvasRenderingContext2D.prototype[name] = function (...args) {
        try { canvasOps.push(name); } catch (e) {}
        return raw.apply(this, args);
      };
    }
  }

  for (const name of ['pushState', 'replaceState']) {
    const raw = history[name];
    history[name] = function (...args) {
      try { navEvents.push(name + ' ' + args[2]); } catch (e) {}
      return raw.apply(this, args);
    };
  }
  W.addEventListener('hashchange', () => navEvents.push('hashchange ' + location.hash));

  // addInitScript runs before the parser has created <html>, so documentElement
  // is still null here. document itself always exists, and observing it with
  // subtree:true covers everything the element would have. (An earlier version
  // deferred via requestAnimationFrame, which is throttled in backgrounded
  // headless tabs and intermittently left the observer unattached — the
  // mutations channel then went silent at random.)
  new MutationObserver((recs) => { mutations += recs.length; })
    .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });

  // ---- enumeration ---------------------------------------------------------
  // Walks the document plus every shadow root we can see. withClosed adds the
  // closed roots captured by the attachShadow patch above.
  function allElements(withClosed) {
    const out = [];
    const roots = [document];
    const seen = new Set();
    while (roots.length) {
      const root = roots.pop();
      if (seen.has(root)) continue;
      seen.add(root);
      for (const el of root.querySelectorAll('*')) {
        out.push(el);
        if (el.shadowRoot) roots.push(el.shadowRoot);
      }
    }
    if (withClosed) {
      for (const root of closedRoots) {
        for (const el of root.querySelectorAll('*')) out.push(el);
      }
    }
    return out;
  }

  function probeOf(el) {
    let n = el;
    while (n && n.nodeType === 1) {
      const id = n.getAttribute && n.getAttribute('data-probe');
      if (id) return id;
      n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
    }
    return null;
  }

  function findProbe(id, withClosed) {
    for (const el of allElements(withClosed !== false)) {
      if (el.getAttribute && el.getAttribute('data-probe') === id) return el;
    }
    return null;
  }

  // KAFE's visibility heuristics (§7.10): not display:none / visibility:hidden,
  // non-zero box, not disabled.
  function isVisible(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (el.disabled) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return true;
  }

  function geometrySignature() {
    const parts = [];
    for (const el of allElements(true)) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      parts.push(
        el.tagName + '#' + (el.id || '') + '.' + (typeof el.className === 'string' ? el.className : '') +
        '|' + Math.round(r.x + scrollX) + ',' + Math.round(r.y + scrollY) + ',' + Math.round(r.width) + ',' + Math.round(r.height) +
        '|' + cs.display + ',' + cs.visibility + ',' + cs.opacity
      );
    }
    return parts.join('\n');
  }

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return h;
  }

  W.__a11y = {
    listeners,
    closedRoots,
    allElements,
    probeOf,
    findProbe,
    isVisible,

    /** Everything a differential needs, in one call. */
    snapshot() {
      return {
        dom: hash(document.documentElement.innerHTML),
        geometry: hash(geometrySignature()),
        mutations,
        net: net.length,
        storage: storage.length,
        console: consoleCalls.length,
        canvas: canvasOps.length,
        nav: navEvents.length,
        href: location.href,
        // recorded but deliberately NOT a delta channel: pressing Space or an
        // arrow key scrolls the page, which is not an activation effect.
        scroll: scrollX + ',' + scrollY,
      };
    },

    /** Per-channel delta between two snapshots. */
    delta(before, after) {
      return {
        dom:       before.dom !== after.dom,
        geometry:  before.geometry !== after.geometry,
        mutations: after.mutations > before.mutations,
        net:       after.net > before.net,
        storage:   after.storage > before.storage,
        console:   after.console > before.console,
        canvas:    after.canvas > before.canvas,
        nav:       after.nav > before.nav || before.href !== after.href,
      };
    },
  };
})();
`;

/** Which channels each named observation depth is allowed to look at. */
export const CHANNEL_SETS: Record<string, string[]> = {
  dom:           ['dom'],
  'dom+geom':    ['dom', 'geometry'],
  all:           ['dom', 'geometry', 'mutations', 'net', 'storage', 'console', 'canvas', 'nav'],
};
