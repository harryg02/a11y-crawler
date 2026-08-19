# The keyboard differential

Detecting clickable-but-not-keyboard-reachable elements: twelve detectors, scored in
eighteen configurations against a purpose-built corpus with known answers.

Companion documents:
- [DETECTORS.md](DETECTORS.md) — what each detector is, its rule, its implementation, its result
- [README.md](README.md) — experiment design and how to run it
- [results/results.md](results/results.md) — generated output, regenerated on every run

Tests the hypotheses in the survey at [`tabbing.md`](../../tabbing.md) (repo root). Section
references below (§) point into that document.

---

## 1. What was measured

Nine fixture pages carry **60 labelled probes**: the canonical defect (a `<div>` with
`addEventListener('click')` and no `tabindex`), plus the variants the survey names —
delegated listeners, React handlers, hover-only menus, closed shadow roots, same-origin
frames, handlers that touch nothing but `fetch` or `localStorage`, and a deliberate set of
decoys that *look* operable and are not.

Ground truth lives in [`fixtures/truth.json`](fixtures/truth.json), keyed by probe id and
held out-of-band so no detector can read it. A probe counts as a violation only when all
three hold:

1. a real user can operate it with a mouse,
2. cannot operate it with a keyboard, and
3. the same functionality is not reachable from any other keyboard-reachable element.

That yields **26 positives and 34 negatives**.

**Set T** — the true tab order — is computed once per page by dispatching real `Tab`
keypresses through CDP and reading `document.activeElement` after each, descending into
open shadow roots and same-origin frames ([`taborder.ts`](taborder.ts)). Every candidate
generator reports *candidates − T*.

### The pipeline

| Stage | What it does | Cost |
|---|---|---|
| 1 | Set T, exactly — real `Tab` dispatch | free, exact |
| 2 | Over-generate candidates — listeners, properties, CSS, lexicon | 32–292 ms / corpus |
| 3 | Behavioural confirmation — mouse vs keyboard, eight state channels | 1.20 s / probe |
| 4 | Equivalence dismissal — drop findings a keyboard-reachable element already delivers | free |

---

## 2. Results

Chromium, 1280×900, single run.

| detector | TP | FP | FN | precision | recall | F1 | runtime |
|---|---|---|---|---|---|---|---|
| **D9 + Stage-4 @ exact coverage equality** | 26 | 1 | 0 | **96.3%** | **100.0%** | **98.1%** | 71.7 s |
| D9 differential — all channels | 26 | 4 | 0 | 86.7% | 100.0% | 92.9% | 71.7 s |
| D9 differential — pointer parked before reading | 25 | 3 | 1 | 89.3% | 96.2% | 92.6% | 76.9 s |
| D9 + Stage-4 @ Jaccard ≥ 0.5 | 23 | 1 | 3 | 95.8% | 88.5% | 92.0% | 71.7 s |
| D10b coverage-diff (set difference) | 25 | 5 | 1 | 83.3% | 96.2% | 89.3% | 71.7 s |
| D10a coverage-diff (keyboard ran nothing) | 23 | 4 | 3 | 85.2% | 88.5% | 86.8% | 71.7 s |
| D9 differential — dom + geometry | 22 | 3 | 4 | 88.0% | 84.6% | 86.3% | 71.7 s |
| D9 differential — dom only | 21 | 2 | 5 | 91.3% | 80.8% | 85.7% | 71.7 s |
| D5 CDP `getEventListeners` | 20 | 5 | 6 | 80.0% | 76.9% | 78.4% | 292 ms |
| D4 CSS + lexical | 22 | 9 | 4 | 71.0% | 84.6% | 77.2% | 34 ms |
| D6 `addEventListener` shim | 17 | 5 | 9 | 77.3% | 65.4% | 70.8% | 59 ms |
| D8 hover-diff | 18 | 7 | 8 | 72.0% | 69.2% | 70.6% | 15.4 s |
| D2b handler-property scan | 3 | 0 | 23 | 100.0% | 11.5% | 20.7% | 35 ms |
| D7 React fiber props | 2 | 0 | 24 | 100.0% | 7.7% | 14.3% | 38 ms |
| D2 inline-attribute scan | 1 | 0 | 25 | 100.0% | 3.8% | 7.4% | 34 ms |
| D3 tabindex-counter | 1 | 0 | 25 | 100.0% | 3.8% | 7.4% | 32 ms |
| D0 this repo's `collectClickables` | 1 | 2 | 25 | 33.3% | 3.8% | 6.9% | 35 ms |
| D1 axe-core (wcag2a / 2aa / 21aa) | 0 | 0 | 26 | — | 0.0% | 0.0% | 4.3 s |

Runtimes are single-run and moved 10–80% between otherwise identical runs on a loaded
machine. Read them as orders of magnitude, not benchmarks.

---

## 3. Three corrections to the survey

### 3.1 React 19 handlers are directly inspectable — §1.2, §3.6

> "React attaches a single listener at the root container. `getEventListeners` on a React
> button returns *nothing*. … Framework-prop extraction is not an optimization here — it is
> mandatory, and it is version-fragile."

It returns a `click` listener. React 19 does install **139 listeners on the root container**
(three of them `click`), but it *also* assigns `element.onclick` directly on every element
carrying an `onClick` prop — the property, not the attribute:

| probe | `el.onclick` is a function | has `onclick` attribute | React `onClick` prop |
|---|---|---|---|
| p50 (`<div onClick>`) | yes | no | yes |
| p51 (`<button onClick>`) | yes | no | yes |
| p55 (no handler) | no | no | no |

CDP `getEventListeners` reports that assignment and found both in-scope React defects. A
three-line `typeof el.onclick === 'function'` check (D2b) finds them too, using a stable
web-platform property.

Framework-prop extraction remains the only route to *which* prop was bound, and stays
necessary for other frameworks. It is not the only route to *whether* a handler exists, and
building a version-fragile React adapter for that purpose is wasted work.

### 3.2 The `addEventListener` shim is the weakest listener route — §3.5

> "Inject before any app script … and record every registration. … Blind to anything
> registered before injection."

Blind to considerably more than that, and none of it about injection timing. Measured at
**65.4% recall**, the worst of the three listener routes. It misses:

- **React entirely** — property assignment never calls `addEventListener`;
- **inline `onclick=` attributes** — same reason;
- **delegated listeners** bound to `document` — the registration is real, but its target is
  not the element.

Its real value is the one the survey mentions in passing and undersells: the **stack trace**.
Every finding came out carrying the exact file and line that bound the handler.

### 3.3 There is no such thing as clicking without hovering — §3.9

> "Probing `click` alone would have missed 35 of 49."

A trusted click cannot skip the hover: CDP dispatches a `mousemove` to the target
coordinates before `mousePressed`. The first version of this experiment scored a
"click-only" arm *identically* to the hover arm for exactly that reason — the ablation was
measuring nothing.

The variable that actually exists is the **observation window**. Reading state while the
pointer rests on the element caught the pure-CSS hover menu; parking the pointer first lost
it and gained back a false positive on a hover tooltip. On this corpus that trade is worth
**+1 true positive for −1 false positive** — real, but nothing like the 35-of-49 headline.
That figure describes tools driving `element.click()`, which fires no pointer events at all.

---

## 4. What held

| § | Claim | Measured | Verdict |
|---|---|---|---|
| §6 | General scanners decline this defect class entirely | axe-core: 0 of 26, on every variant | Confirmed |
| §3.2 | Mouse-vs-keyboard differential is the correct core | F1 92.9%, best of 18 before Stage 4 | Confirmed |
| §2 | "State delta must be broader than the DOM" | recall 80.8% → 100.0% across the channel set | Confirmed |
| §3.3 | `el.focus()` tests focusability, not tab-order membership | `tabindex="-1"` probe: focusable, never a tab stop | Confirmed |
| §3.3 | `tabindex > 0` reorders the sequence | `tabindex="5"` reached first, ahead of document order | Confirmed |
| §1.3 | Trusted input hit-tests; `element.click()` does not | 3 probes fire only under untrusted click | Confirmed |
| §3.10 | CSS/lexical: high recall, terrible precision | 84.6% recall (best cheap route) at 71.0% precision (worst overall) | Confirmed |
| §7.3 | HTML_CodeSniffer sees inline attributes only | 3.8% recall — one probe of 26 | Confirmed |
| §3.4 | `pierce:true` traverses shadow roots | 60 of 60 probes addressed via CDP, closed roots included | Confirmed |
| §5 | Stage-4 equivalence dismissal is what makes output usable | precision 86.7% → 96.3%, recall unchanged | Confirmed |
| §3.7 | Coverage-diff catches handlers with no DOM trace | 96.2% recall vs 80.8% DOM-only — but the network/storage/canvas channels get there more cheaply and precisely | Redundant |
| §6 | tabindex-counter: 93% precision, 39% recall | 100% precision, 3.8% recall — shape right, recall an order of magnitude lower | Qualified |

---

## 5. The Stage-4 threshold decides the design

Stage 4 drops a confirmed finding when some keyboard-reachable element produces the same
effect. The survey proposes comparing executed-function sets but does not say how close
counts as the same. That turns out to be the whole question.

| Similarity required | TP | FP | FN | precision | recall | F1 |
|---|---|---|---|---|---|---|
| Jaccard ≥ 0.50 | 23 | 1 | 3 | 95.8% | 88.5% | 92.0% |
| Jaccard ≥ 0.80 | 23 | 1 | 3 | 95.8% | 88.5% | 92.0% |
| Jaccard ≥ 0.95 | 23 | 1 | 3 | 95.8% | 88.5% | 92.0% |
| **Exact set equality** | **26** | **1** | **0** | **96.3%** | **100.0%** | **98.1%** |

The cliff sits between 0.95 and 1.0, and everything falling off it is React. Inside a
framework, two *different* handlers still share almost every function they execute — the
synthetic event system, the scheduler, the reconciler — so a broken `<div onClick>` and a
correct `<button onClick>` measure 0.95 similar while doing entirely different things.
**Any tolerant threshold silently deletes real defects.**

Subtracting a per-page baseline helps and is worth doing: clicking a handler-free target
first, then removing those functions from every subsequent set, stripped 28 functions per
click from the React page. It was not enough on its own.

**Require exact set equality, and take the baseline subtraction as well.**

---

## 6. False positives and false negatives

Tracked per-probe, not just as counts — [`score.ts`](score.ts) records `falsePositives` and
`falseNegatives` as probe-id arrays. The shipped crawler tracks none of this; it has no
ground truth, so it cannot.

**The winning configuration: 1 FP, 0 FN.** The survivor is `p33`, a hover tooltip on an
abbreviation in running text. The oracle is behaving correctly — the mouse produces a state
change, the keyboard produces none. It is a false positive only because a tooltip is
SC 1.4.13, not 2.1.1. No behavioural oracle can draw that line, because the behaviour
genuinely is identical to a broken menu.

### FPs cluster into three kinds

| Kind | Probes | Who it hits | Why |
|---|---|---|---|
| **Equivalence** | p23, p25, p27 | D9 raw, D10 | Genuinely mouse-operable and not focusable, but the functionality is one Tab away. Cleared by Stage 4. |
| **Not actually mouse-operable** | p70, p72, p82 | D4, D5, D6 | Under a transparent overlay, `pointer-events:none`, inside `inert`. A listener exists; no user can reach it. |
| **Handler that does nothing** | p22 | D5, D6, D10 | An empty click handler. "A listener exists" and "a function ran" are both true; nothing happens. |

Concrete fix available: KAFE's published visibility heuristics — implemented as-is in
[`instrument.ts`](instrument.ts) `isVisible()` — cover `display:none`, `visibility:hidden`,
zero-size and `disabled`, but **not** `inert` or `pointer-events:none`. Adding those two
clears three FPs across three detectors.

### FNs are almost all structural

- **p60–p63** (fetch / localStorage / canvas / console only) — lost the moment observation
  narrows to the DOM. This is the 80.8% → 100% recall gap, and it is the oracle this repo's
  crawler uses today.
- **p30** (pure-CSS `:hover` menu) — lost when the pointer is parked before reading state.
  No JavaScript exists, so every listener route misses it too.
- **p10, p54** (`tabindex="0"` + click, no key handler) — missed by *every* detector that
  subtracts Set T, which is all seven candidate generators. They are in the tab order, so the
  subtraction removes them by construction. Only an oracle that tests actionability separately
  from reachability catches these.
- **p40, p41** (delegated to `document`) — missed by the shim and by `getEventListeners`,
  since nothing is bound to the element.

The last pattern is the most useful in the table: `p10`/`p54` are invisible to attribute
checks, tab-order checks, *and* listener sniffing simultaneously. Any tool built from cheap
signals alone has a blind spot there that no amount of tuning closes.

---

## 7. What this means for the crawler

`collectClickables` in [`lib/crawler/scanner.ts`](../../lib/crawler/scanner.ts) scores
**3.8% recall at 33.3% precision** here. That is expected and not a criticism: it was written
to find things worth clicking during a crawl, not to find keyboard defects, and it is measured
out of scope. Two findings apply to it as it stands.

**Its selectors are ambiguous.** The `tag.class1.class2` strings it emits matched more than
one element **8 times out of 14** on this corpus. Because the crawl clicks `.first()`, every
collision is a control it believes it has visited and has not. That is a live coverage bug,
independent of anything in the survey.

**Its click oracle is the weakest one measured.** The `innerHTML` hash comparison in
`scanInteractiveElements` is exactly the "dom only" row: 80.8% recall, blind to any handler
whose effect is a `fetch`, a storage write, a canvas draw, or a CSS-only reveal. Those clicks
are currently logged as `no DOM change — skipping`. Adding the geometry channel alone recovers
CSS-only reveals for one extra `getComputedStyle` pass per snapshot.

---

## 8. Threats to validity

- **Synthetic corpus, built from the survey's own examples.** Every defect here is one the
  survey predicted. Real pages contain shapes nobody listed; read the recall figures as an
  upper bound.
- **Same author for fixtures and detectors.** Ground truth was written before any detector was
  scored, but the fixtures were not authored blind.
- **n = 26 positives.** One probe moves recall by 3.8 points. Differences under ~8 points
  between adjacent rows are not meaningful.
- **One engine, one viewport.** Chromium at 1280×900. Hover menus and responsive collapse are
  viewport-dependent, so single-resolution results undercount — the same limitation the survey
  notes of KAFE's fixed 1920×1080.
- **React 19 only.** The `el.onclick` finding is specific to this version and may not hold for
  React 17/18, Vue, or Angular.
- **Runtimes are single-run, not benchmarks.** They moved 10–80% between otherwise identical
  runs on a loaded machine.
- **Fixture handlers share a helper.** All probes call the same `fired()` function, which
  inflates coverage overlap between unrelated handlers and makes the Stage-4 threshold result,
  if anything, pessimistic.

---

## 9. Reproducing

```sh
npx playwright test tests/tabbing-pilot.spec.ts --project=chromium       # 11 assertions, ~7 s
npx playwright test tests/tabbing-experiment.spec.ts --project=chromium  # full matrix, ~2.4 min
```

The pilot asserts the instrumentation itself is sound before any numbers are believed. It
caught five bugs that would have invalidated results — see [README.md](README.md#pilot).
