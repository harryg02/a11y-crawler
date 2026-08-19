# Experiment: detecting clickable-but-not-keyboard-reachable elements

Tests the hypotheses in [`tabbing.md`](../../tabbing.md) against a ground-truth fixture
corpus, using this repo's existing infrastructure (Playwright + Chromium + CDP).

## Read this first

| document | what it is |
|---|---|
| **[STUDY.md](STUDY.md)** | **The study.** Method, results, three corrections to the survey, FP/FN analysis, threats to validity. |
| [DETECTORS.md](DETECTORS.md) | Per-detector reference: what each asks, its rule, its implementation, its result. |
| [results/results.md](results/results.md) | Generated output. Overwritten on every run — don't edit. |
| [report/](report/) | The two documents above, rendered as self-contained HTML for sharing. |

The rest of this file is the experiment design and how to run it.

## Design

**Corpus.** 9 hand-built fixture pages, 60 labelled probes (26 violations, 34 negatives). Every element that
could plausibly be picked up by a detector carries `data-probe="pNN"`; the label
lives out-of-band in `fixtures/truth.json` so no detector can read it.

Labels:

| label | meaning | scored as |
|---|---|---|
| `violation` | mouse-operable, not keyboard-operable, functionality not otherwise available | positive |
| `ok` | accessible (native control, or role+tabindex+key handler) | negative |
| `decoy` | looks clickable but has no functionality, or functionality is keyboard-equivalent elsewhere | negative |
| `excluded` | hidden / inert / `pointer-events:none` — not mouse-operable either | negative |

**Detectors.** Each returns a set of probe ids it would report as a violation.

| id | detector | tabbing.md § | hypothesis under test |
|---|---|---|---|
| D0 | current crawler `collectClickables` − Set T | — | what this repo ships today |
| D1 | axe-core (wcag2a/2aa/21aa) | §6 | "zero violations on all four defect variants" |
| D2 | inline-attribute scan (HTML_CodeSniffer-style) | §7.3 | only `onclick=` attributes are visible |
| D3 | tabindex-counter / aria-check | §6 table | 93% precision, 39% recall shape |
| D4 | CSS + lexical heuristics (`cursor:pointer`, class lexicon) | §3.10 | high recall, terrible precision |
| D5 | CDP `DOMDebugger.getEventListeners` (pierce) | §3.4 | complete for direct listeners, blind to delegation |
| D6 | `addEventListener` shim at document-start | §3.5 | catches everything registered after injection |
| D7 | React fiber props (`__reactProps$*`) | §3.6 | the only way to see React's delegated handlers |
| D8 | hover-diff rendering | §3.9 | cheap, ML-free affordance signal; catches CSS-only menus |
| D9 | mouse-vs-keyboard behavioural differential | §3.2 | the KAFE oracle — highest precision |
| D10 | D9 with V8 coverage as the state channel | §3.7 | catches handlers with no DOM trace |

**Set T** (the tab-order set) is computed once per page by real `Tab` /
`Shift+Tab` dispatch through CDP, piercing shadow roots (§3.3). Every
candidate-generator detector (D0, D2–D8) reports `candidates − T`.

**Ablation.** D9's oracle is scored at four state-observation depths, to test
which channels are load-bearing:

- `dom` — `innerHTML` hash only (this repo's current click oracle, and KAFE's δ flag)
- `dom+visible` — plus the visible-element/geometry set (catches CSS-only `:hover` reveals)
- `all` — plus network, storage, console, navigation, canvas
- `coverage` — V8 precise coverage executed-function sets

**Side experiments.**

- `E1 focus-vs-tab` — `el.focus()` reachability vs real Tab traversal (§3.3)
- `E2 trusted-vs-untrusted` — CDP `Input.dispatchMouseEvent` vs `element.click()` under occlusion (§1.3)
- `E3 equivalence` — Stage-4 dismissal of a clickable card wrapping a real `<a>` (§2, §5)

## Pilot

```
npx playwright test tests/tabbing-pilot.spec.ts --project=chromium      # 11 assertions, ~7 s
```

Eleven assertions on the instrumentation itself. If this is red, the numbers the full
experiment produces are meaningless, so it runs first. It caught five bugs that would each
have silently invalidated results:

| bug | how it would have shown up |
|---|---|
| `INIT_SCRIPT` threw at document-start (`document.documentElement` is null before the parser builds `<html>`) | every channel dead; every probe scored as "no effect" |
| Fixture used `var closed`, which collides with the read-only `window.closed` | the closed shadow root was never populated — I nearly concluded CDP `pierce` can't see closed roots |
| State was observed only in the top document | the iframe probe scored as a false negative for the whole corpus |
| `startCoverage()` was defined but never called | D10 coverage sets always empty |
| MutationObserver deferred via `requestAnimationFrame`, which is throttled in backgrounded headless tabs | `mutations` channel intermittently dead — a 1-in-5 flake |

## Full matrix

```
npx playwright test tests/tabbing-experiment.spec.ts --project=chromium # ~2.4 min
```

Results land in `results/` (`results.md` + `raw.json`). Both are regenerated wholesale; the
interpretation lives in [STUDY.md](STUDY.md) and is maintained by hand.
