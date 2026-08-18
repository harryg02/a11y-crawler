# Detecting Clickable-but-Not-Keyboard-Reachable Elements

Options survey, grounded in tool source code and published literature.
Compiled 2026-08-12.

---

## 0. Verdict

Your two examples are the canonical form of the defect:

```html
<div class="dropout-btn dropout selected">Inactive Students (<span class="count">0</span>)</div>
<span id="last-responses-btn" class="last-responses-btn"><i class="material-icons calendar">calendar_month</i></span>
```

Neither carries `tabindex`, neither is a natively focusable tag, and in both cases the click handler is almost certainly attached with `addEventListener` — which is invisible to page-context JavaScript.

This is the single most-cited example of a WCAG failure that DOM-scanning automation cannot see. Deque's own published audit data puts automated coverage of SC 2.1.1 Keyboard at **2.49%** — 9,178 of 9,412 real-world issues on that criterion were found by humans, not tools (§7.1).

Your instinct that a clickable `<p>` counts is correct, and the class is broader still: `<li>`, `<td>`, `<svg>`, `<i>`, and pseudo-element overlays all appear in the wild.

**The strongest prior art is KAFE (ESEC/FSE 2021)** — a web-side tool that builds a mouse-interaction model and a keyboard-interaction model of the same page and diffs them. Reported **92% precision / 100% recall** on inaccessible-functionality detection and **94% localization recall**, against 68%/70% for WAVE and 83%/27% for QualWeb. Full treatment in §7.10. Read that section before designing anything.

---

## 1. Assessment of your four proposals

### 1.1 "Use an AI to look at elements to see if they apparently look clickable"

**Mechanism.** Visual affordance classification — pill shape, border-radius, fill contrast, icon glyph, hover response, spatial grouping.

**Precedent exists and is measured.** Swearngin & Li (CHI 2019) built exactly this for mobile: crowdsourced 20,174 elements from 3,470 screens and trained a model on appearance + semantics + spatial context. Reported **mean precision 90.2%, recall 87.0%** (§7.4).

**The ceiling problem — this is the important finding.** The same paper measured human-to-human agreement on "does this look tappable" at **Fleiss' κ = 0.520**, described as *Moderate*. Your ground truth is itself only moderately consistent between annotators.

> `[INFERENCE]` A visual model reporting ~90% precision is not 10% away from solved. It is at the annotation ceiling. Pushing past it means disagreeing with the humans who labeled it.

**Where it is nonetheless indispensable.** It is the only method that finds the *inverse* defect — an element that looks like a button, has no handler at all, and is simply dead. And it is the only method that can flag "this is styled as a control but was never wired up as one."

**Verdict:** Necessary as a *candidate generator*. Insufficient as an oracle. Never emit a violation on visual evidence alone.

### 1.2 "Look into JS, but there are JS elements that are obscured"

Your caveat is exactly right, and it is documented in the primary literature rather than being a mere practical annoyance.

Mesbah et al., the Crawljax paper (ACM TWEB), states the structural reason:

> "In this case, by examining the DOM element it is not possible to find information about the handler, since the event model (DOM Level 2 Events) maintaining the handler registration information is separated from the DOM core model itself."

Squiz's HTML_CodeSniffer — the engine behind Pa11y's default runner — concedes it in a source comment:

> `// Cannot detect event listeners here so only onclick attributes are checked.`

**But "obscured" is not "impossible."** There are four real escape hatches, in descending fidelity:

| Route | Requires | Catches |
|---|---|---|
| CDP `DOMDebugger.getEventListeners` | Playwright/Puppeteer/DevTools | All registered listeners, ancestors, shadow roots (`pierce: true`) |
| Monkey-patch `EventTarget.prototype.addEventListener` at document-start | Extension MAIN world, or `page.addInitScript` | Everything registered after injection |
| Framework internals — React fiber `__reactProps$*.onClick`, Vue `__vnode` | Nothing | Delegated handlers invisible to both routes above |
| Static source lint | Source access | Authoring-time, pre-compile |

**The one that actually bites.** React attaches a single listener at the root container. `getEventListeners` on a React button returns *nothing*. Any tool that enumerates DOM listeners alone will report a modern SPA as having near-zero clickable elements. Framework-prop extraction is not an optimization here — it is mandatory, and it is version-fragile.

**Verdict:** Viable, higher yield than commonly assumed, but requires all four routes combined and still cannot prove a negative.

### 1.3 "Try use a virtual mouse to actually click on it"

**This is the strongest of your four, and it is the basis of every high-scoring system in the literature.** But it needs one correction and one addition.

**Correction — use trusted input, not `element.click()`.** `HTMLElement.prototype.click()` dispatches an untrusted synthetic event: it skips hit-testing, ignores occlusion, does not set `isTrusted`, and does not fire `:active`. CDP `Input.dispatchMouseEvent` at real viewport coordinates does full hit-testing, so overlay/occlusion handling comes free.

**Addition — clicking alone is the wrong oracle.** Crawljax's definition:

> "We call all DOM elements that have event-listeners attached to them and can cause a state transition, clickable elements."

with the DOM-diff test:

> "After firing an event on a candidate clickable, the algorithm compares the resulting DOM-tree with the DOM-tree as it was just before the event fired, in order to determine whether the event results in a state change"

That answers *"is it clickable."* Your actual question is *"is it clickable AND not keyboard-operable"* — which needs the **counterfactual**, not the click.

This is precisely the design Groundhog (ASE 2022) uses on Android: execute each action through different user proxies and diff the outcomes.

> "If the UI hierarchy before and after the action execution is the same, and there is no corresponding AccessibilityEvent of the executed action, the oracle reports an actionability issue for a given User Proxy."

Reported: **293 true issues at 86% precision**, ~59 minutes per app.

The web port of this philosophy is A11yNavigator (ASE 2025), which drives real NVDA:

> "Our empirical evaluation across 26 real websites shows that A11YNAVIGATOR can detect around 200 accessibility issues that remain undetected by existing accessibility testing tools with a precision of 93.24% and recall of 98.97%."

**93.24% / 98.97% is the best number in this entire survey**, and the reason is structural: the oracle is behavioral ground truth, not a perceptual guess.

**Cost profile.** Crawljax on one site at depth 2: 19,247 candidates examined → 1,101 real clickables → 83 minutes. **~5.7% hit rate.** Dynamic verification is definitive and expensive; a good candidate prefilter is what makes it affordable.

**The real blocker — side effects.** Clicking things submits forms, deletes records, triggers payments, navigates away. Mitigations, in order of preference: run against a seeded staging instance; intercept and stub all network via CDP `Fetch.enable`; snapshot/restore between probes; block `beforeunload`; run the whole thing in a disposable container.

**Verdict:** The correct core. Use trusted CDP input, and make the oracle *mouse-vs-keyboard differential*, not *click-produced-a-change*.

### 1.4 "Try to execute a piece of JS code"

Underspecified as stated, but there are two useful readings, one weak and one strong.

**Weak reading — in-page probing.** Dispatch a synthetic click and watch for `preventDefault()` / `stopPropagation()`, or diff the DOM from inside the page. Works without CDP. Loses trusted-input semantics and hit-testing. Fine for a bookmarklet, not for a report you'd act on.

**Strong reading — JS instrumentation as the oracle.** See §3.7 (coverage-diff). This is, in my assessment, the highest-value idea in this document and I have found no published system doing it for web accessibility.

---

## 2. The reframe

The question "which elements are clickable" is the wrong primitive. It is perceptual, has a soft ground truth (κ = 0.52), and no method answers it cleanly.

The question **"does this element do something on mouse input that it does not do on keyboard input"** is a *differential* question. It has a hard ground truth, it is directly what WCAG 2.1.1 requires, and it sidesteps the perception problem entirely.

`[VERIFIED]` This is not speculative framing — it is precisely KAFE's architecture, published in 2021. KAFE builds a Point-Click Navigation Flow Graph (PCNFG) and a Keyboard Navigation Flow Graph (KNFG) over the same page states, then reports every node reachable in the former but not the latter. Its definition of the candidate set is the differential's load-bearing half:

> "a node is only in the PCNFG if it has an associated mouse event handler."

```
For each candidate element e:
    S0   := full observable state
    Mouse: dispatch trusted mousedown/mouseup/click at center(e)
    S_m  := state delta
    reset to S0
    Keyboard: focus(e) if focusable; Tab to it; try Enter, Space, arrows
    S_k  := state delta
    reset to S0

    if  S_m is non-empty  and  S_k is empty        →  VIOLATION candidate
    if  S_m is non-empty  and  S_k ≈ S_m           →  OK
    if  S_m is empty                                →  not interactive (or side-effect-free)
```

Two refinements that decide whether the output is usable:

**"State delta" must be broader than the DOM.** A handler that fires a `fetch`, draws to canvas, writes `localStorage`, or updates a JS store leaves no DOM trace. Observe: DOM mutations (`MutationObserver`), navigation, network requests (CDP `Network`), console output, `history` changes, storage writes, **and executed-function coverage** (§3.7).

**WCAG requires equivalent *functionality*, not equivalent *elements*.** A clickable card containing a real `<a>` that does the same thing is not a failure. This is the dominant false-positive source. The differential oracle handles it naturally: if any keyboard path reaches the same state delta, it passes. A per-element check never can.

---

## 3. Full option catalogue

Ordered by evidence strength, not by cost.

### Tier A — behavioral, high precision

**3.1 Assistive-technology-in-the-loop.** Drive a real screen reader (NVDA on Windows via its API, or VoiceOver) and test two properties: *locatability* (can AT reach it) and *actionability* (does activating it via AT do the thing). Precedent: A11yNavigator, 93.24% / 98.97%. Highest fidelity available. Cost: Windows VM, real AT, slow.

**3.2 Mouse-vs-keyboard differential execution.** §2. Precedent: **KAFE (ESEC/FSE 2021) — the web implementation, 92% precision / 100% recall (§7.10)**; Groundhog (86% precision, mobile); Latte (CHI 2021). Requires state-reset discipline and a broad state-observation surface. KAFE used Selenium + Firefox; CDP would be a strictly better substrate today (see §7.10 limitations).

**3.3 True tab-order traversal.** Dispatch real `Tab`/`Shift+Tab` keypresses via CDP and record `document.activeElement`, recursing through `shadowRoot.activeElement`, until the focus path cycles. This is the *only* correct way to compute Set T — `el.focus()` tests focusability, not tab-order membership, and `tabindex > 0` reorders the sequence away from document order. Cheap. Do this first, always.

### Tier B — listener discovery

**3.4 CDP `DOMDebugger.getEventListeners`.** Documented as *"Returns event listeners of the given object."* with `pierce` — *"Whether or not iframes and shadow roots should be traversed when returning the subtree (default is false). Reports listeners for all contexts if pierce is enabled."* Complete for directly-attached listeners. Blind to framework delegation.

**3.5 Pre-load `addEventListener` interception.** Inject before any app script (`page.addInitScript`, or an extension content script at `document_start` in the MAIN world) and record every registration with its target and stack trace. The stack trace is the payoff: it gives you *source attribution* for free, so the report says which module wired the handler. Blind to anything registered before injection.

**3.6 Framework-internal props.** Read `__reactProps$*` fiber props, Vue `__vnode`, Angular listeners. The only way to see React's delegated handlers. Fragile across framework versions; needs a per-framework adapter and a version check.

**3.7 Coverage-diff oracle.** `[INFERENCE — my proposal; the differential frame is KAFE's, the coverage oracle is not]`
Enable V8 precise coverage via CDP `Profiler.startPreciseCoverage`. Click the element; snapshot which functions executed. Reset. Keyboard-activate; snapshot again. Compare the executed-function sets.

**Corrected novelty claim.** KAFE already does the mouse-vs-keyboard differential; what it does *not* do is use execution coverage as the state observation. Its oracle is a DOM-attribute-change flag:

> "Lastly, if [φ] causes any sort of change in the DOM's attributes' values, then the [δ] flag is set to True, otherwise it is set to False."

So the remaining contribution of coverage-diff is narrow but real: it detects handlers whose effect never touches the DOM (a `fetch`, a canvas draw, a `localStorage` write, an analytics call), it yields the handler's source identity for free, and set-equality of executed functions is a tighter equivalence test than attribute-change detection — which matters most for §5 Stage 4, deciding whether some *other* keyboard-reachable element delivers the same functionality. KAFE's δ flag cannot answer that; two different handlers both mutating the DOM look identical to it.

### Tier C — perceptual candidate generation

**3.8 Visual affordance model.** §1.1. Swearngin & Li 90.2%/87.0%. For web, OmniParser's interactable-region detector is available (AGPL for `icon_detect`), though note its supervision is DOM-derived: *"containing 67k unique screenshot images, each labeled with bounding boxes of interactable icons derived from DOM tree."* — i.e. it learned what the DOM already says, which caps its ability to find elements the DOM mislabels.

**3.9 Hover-state differential rendering.** `[INFERENCE — my proposal]`
Screenshot each candidate's bounding box at rest, then again with a CDP-dispatched `mousemove` over its center, and diff the pixels. A visual change under hover is a strong, cheap, ML-free affordance signal — it is the site's *own* declaration that the element is interactive, expressed in CSS rather than in JS. Catches `:hover` rules, `cursor` changes, transitions. Costs one screenshot pair per candidate, no model, no training data.

**KAFE's data says this is the highest-yield single signal.** `[VERIFIED]` In their 40-page subject pool:

> "Overall, a remarkably high 35 of 49 menus implemented to expand when a mouse hovered over them were inaccessible."

Their headline example is your example. The Alexa nav menu:

> "These menu items are implemented with <div> elements that have the :hover CSS pseudo-class [13] defined in the web page's static CSS declarations to make them interactable."

Hover-triggered behavior is both the most common root cause *and* the case where a click-only prober finds nothing. KAFE handles it by including `mouseover`/`mouseenter` in its mouse action set — do the same. Probing `click` alone would have missed 35 of 49.

**3.10 CSS and lexical heuristics.** `cursor: pointer`, interactive `role=`, `aria-*` widget attributes, class-name lexicon (`btn`, `-click`, `toggle`, `tab`, `selected`). Nearly free. High recall, terrible precision — `cursor: pointer` is applied decoratively constantly. Use strictly as a prefilter feeding Tier A, never as an output.

### Tier D — source and telemetry

**3.11 Static source lint.** `eslint-plugin-jsx-a11y` targets this class directly: `click-events-have-key-events` — *"Enforce `onClick` is accompanied by at least one of the following: `onKeyUp`, `onKeyDown`, `onKeyPress`."* — and `no-static-element-interactions` — *"In order to add interactivity such as a mouse or key event listener to a static element, that element must be given a role value as well."* Cheapest possible, catches it before it ships. Blind to non-JSX code, compiled output, and `addEventListener` inside a `useEffect`.

**3.12 Production click telemetry.** `[INFERENCE — my proposal]`
Attach a capture-phase `click` listener on `window` in production, log `event.target`'s selector path, aggregate. This yields the set of elements *real users actually click* — empirical ground truth for Set C, with zero perception and zero guessing. Cross-reference against the tab-order set computed in §3.3.

Trade-offs: only covers elements users found; needs a privacy review; produces evidence of *actual* user harm rather than theoretical, which is a materially stronger artifact for prioritization than any scanner output.

**3.13 Record-and-replay differential.** Record a human completing a task with a mouse; replay the same task keyboard-only; diff the reachable state sets. This is Latte's use-case-driven philosophy — *"a novel, high-fidelity form of accessibility testing for Android apps, called Latte, that automatically reuses tests written to evaluate an app's functional correctness to assess its accessibility as well."* If you already have Playwright/Cypress E2E tests, they are free keyboard-accessibility tests.

### Tier E — LLM reasoning

**3.14 VLM/LLM over screenshot + DOM + runtime trace.** Two data points on where this currently sits:

- ScreenAudit (CHI 2025): *"ScreenAudit achieves an average coverage of 69.2%, compared to only 31.3% with a widely-used accessibility checker."*
- Flow-A11y (2026), which instruments runtime evidence and gates LLM judgment on it, reports **fail precision 41.4%, fail recall 38.7%** on 765 scored rows — and notes the evidence layer *"trades recall for precision,"* dropping recall from 72.7% to 38.7% to lift precision from 23.5% to 41.4%.

`[INFERENCE]` LLMs currently win on *coverage* and lose badly on *precision* versus behavioral oracles (41.4% vs 93.24%). The defensible role for an LLM here is not the verdict — it is (a) generating interaction scenarios to drive Tier A, and (b) writing the human-readable explanation once a behavioral oracle has already confirmed the finding.

---

## 4. Options matrix

| # | Method | Answers | Reported precision | Cost | Blind to |
|---|---|---|---|---|---|
| 3.1 | AT-in-the-loop (NVDA) | Both | 93.24% P / 98.97% R | Very high | Non-AT keyboard users |
| 3.2 | Mouse-vs-keyboard diff | Both | **92% P / 100% R (KAFE, web)**; 86% (Groundhog, mobile) | High — 19.2 min/page | Side-effect-free handlers; obstructed elements |
| 3.3 | Real Tab traversal | Set T only | Exact | Low | Nothing (for T) |
| 3.4 | CDP `getEventListeners` | Set C | — | Low | Framework delegation |
| 3.5 | `addEventListener` shim | Set C | — | Low | Pre-injection registration |
| 3.6 | Framework props | Set C | — | Medium | Non-supported frameworks |
| 3.7 | Coverage-diff | Both | untested | Medium | Handlers with no JS execution |
| 3.8 | Visual affordance model | Set C guess | 90.2% P / 87.0% R | Medium | Invisible/off-screen elements |
| 3.9 | Hover-diff rendering | Set C signal | untested | Low | Sites without `:hover` styling |
| 3.10 | CSS/lexical heuristics | Set C guess | Low | Trivial | Everything unstyled |
| 3.11 | Source lint (jsx-a11y) | Both | High on JSX | Trivial | Non-JSX, compiled, vanilla |
| 3.12 | Production telemetry | Set C actual | Exact for observed | Low + privacy | Unclicked elements |
| 3.13 | Record-and-replay | Both | — | Medium | Untested flows |
| 3.14 | LLM/VLM judgment | Both | 41.4% (Flow-A11y) | High | — |

---

## 5. Recommended architecture

Five stages. Each stage is cheap relative to the next, so the funnel is what makes it affordable — recall Crawljax's 5.7% candidate hit rate.

**Stage 1 — Set T, exactly.** Real Tab traversal via CDP (§3.3), shadow-DOM-piercing. Output: ordered focus path. Free, exact, and immediately useful on its own.

**Stage 2 — Candidate generation, high recall.** Union of: `getEventListeners` (§3.4) ∪ `addEventListener` shim (§3.5) ∪ framework props (§3.6) ∪ `cursor:pointer`/role/class heuristics (§3.10) ∪ hover-diff (§3.9). Deliberately over-generate. Subtract Set T.

**Stage 3 — Behavioral confirmation.** For each surviving candidate, run the mouse-vs-keyboard differential (§3.2) with coverage-diff as the equivalence test (§3.7). This is where a candidate becomes a finding.

**Stage 4 — Equivalence dismissal.** For each confirmed finding, check whether any *other* keyboard-reachable element produces the same executed-function set. If yes, downgrade — the functionality is keyboard-available even if this element is not.

**Stage 5 — Report with provenance.** Every finding carries: selector, the handler's source file and line (from the §3.5 stack trace or §3.7 coverage), the mouse state-delta, the empty keyboard state-delta, and a screenshot. A finding without provenance cannot be triaged and will be ignored.

Stages 1–2 are a weekend. Stage 3 is the real work. Stages 4–5 are what make the difference between a tool people use and a tool people mute.

**Scope honestly.** Log what you did not cover — candidates skipped, elements whose side effects you refused to trigger, frames you could not reach. Silent truncation reads as "clean."

---

## 6. What already exists

| Tool | Detects `<div>` + `addEventListener`, no tabindex? | Notes |
|---|---|---|
| axe-core / Lighthouse / Pa11y(axe) | **No** | Empirically tested: zero violations, zero incomplete, on all four defect variants |
| axe DevTools Pro — Interactive Elements IGT | Partial, ML, human-confirmed | *"If Machine Learning is enabled (see settings page), it will detect any elements not marked up with interactive attributes (roles, tab index, etc) that may in fact be interactive."* |
| IBM Equal Access (`element_mouseevent_keyboard`) | **No** | Selector is inline-attribute-only; emits "Manual", not a violation; does not test focusability at all |
| HTML_CodeSniffer / Pa11y default | **No** | Only tool combining "has handler" + "not keyboard-navigable" — but inline attributes only, by its own source comment |
| WAVE (`event_handler`) | Likely no | Ships an *alert* "Device dependent event handler"; engine source not inspectable |
| Accessibility Insights (Tab stops) | **No — by design** | The first thing it tells a human tester to look for *is* this defect |
| Evinced | **Claimed yes** | Publishes issue type `NOT_FOCUSABLE`; vendor claim, uncorroborated |
| eslint-plugin-jsx-a11y | **Yes, in JSX source only** | `click-events-have-key-events`, `no-static-element-interactions` |
| **KAFE** (research prototype, 2021) | **Yes** | 92% P / 100% R; also detects keyboard traps, which no other tool tested scored above 0% on |

Measured head-to-head by the KAFE authors on 60 real pages (§7.10):

| Tool | IAF precision | IAF recall | IAF localization recall | KTF precision | KTF recall | Avg runtime |
|---|---|---|---|---|---|---|
| KAFE | 92% | 100% | 94% | 90% | 100% | 19.22 min |
| aria-check | 60% | 100% | n/a | 0% | 0% | 0.03 min |
| tabindex-counter | 93% | 39% | n/a | 0% | 0% | 0.03 min |
| QualWeb | 83% | 27% | 6% | 0% | 0% | 2 min |
| WAVE | 68% | 70% | 16% | 0% | 0% | 0.1 min |

`[INFERENCE]` Note the shape of the tabindex-counter row: 93% precision, 39% recall. That is the attribute-heuristic approach in a nutshell — when it fires it is usually right, and it misses three fifths of the defects. Note also that localization recall is where the gap is widest (94% vs 16% and 6%): the DOM scanners that *do* flag a page mostly cannot tell you which element is at fault, which is what makes their output unactionable.

`[INFERENCE]` The gap in shipping tools is real, not a search failure. Every general-purpose runtime scanner declines this defect class, and two of them say so in their own source code or docs. The commercial answer is either ML-with-a-human (Deque IGT) or an uncorroborated vendor claim (Evinced). The research answer — behavioral differential execution — has been demonstrated at 93% precision but exists only as academic prototypes.

---

## 7. Verified evidence

Quotes below are continuous strings intended for Ctrl+F against the cited source.

### 7.1 Automated coverage of SC 2.1.1 is ~2.5%

**Claim:** Deque's own audit data reports 97.51% of WCAG 2.1.1 Keyboard issues are found manually.
**Table 1, row 7 (2.1.1 Keyboard):** Total Issues 9,412 · Manual Issues 9,178 · Auto Issues 234 · Manual % 97.51% · Auto % 2.49%
**Verbatim Quote:** "On average across all the audits included in the sample data, we found that **57.38% of total issues were identified using Deque's automated tests**."
**Source:** Deque Systems, *Automated Accessibility Coverage Report* — https://www.deque.com/automated-accessibility-coverage-report/
*(The `**` are Markdown emphasis introduced by the extraction layer; the underlying page renders this as bold text.)*

**Verbatim Quote:** "With axe-core, you can find **on average 57% of WCAG issues automatically**."
**Source:** axe-core README — https://raw.githubusercontent.com/dequelabs/axe-core/develop/README.md

### 7.2 The structural reason DOM inspection fails

**Verbatim Quote:** "In this case, by examining the DOM element it is not possible to find information about the handler, since the event model (DOM Level 2 Events) maintaining the handler registration information is separated from the DOM core model itself."
**Verbatim Quote:** "We call all DOM elements that have event-listeners attached to them and can cause a state transition, clickable elements."
**Verbatim Quote:** "After firing an event on a candidate clickable, the algorithm compares the resulting DOM-tree with the DOM-tree as it was just before the event fired, in order to determine whether the event results in a state change"
**Verbatim Quote:** "In our implementation, all elements with a tag <A>, <BUTTON>, or <INPUT type='submit'> are considered as candidate clickables, by default."
**Verbatim Quote:** "The set of found states and the inferred state machine is not complete i.e., CRAWLJAX creates an instance of the state machine of the AJAX application but not necessarily the instance."
**Source:** Mesbah, van Deursen & Lenselink, *Crawling AJAX-based Web Applications through Dynamic Analysis of User Interface State Changes*, ACM Transactions on the Web — https://people.ece.ubc.ca/amesbah/resources/papers/tweb-final-old.pdf

### 7.3 A shipping checker concedes the limit in source

**Verbatim Quote:** "Cannot detect event listeners here so only onclick attributes are checked."
**Verbatim Quote:** "var keyboardTriggers = HTMLCS.util.getAllElements(top, '*[onclick], *[onkeyup], *[onkeydown], *[onkeypress], *[onfocus], *[onblur]');"
**Source:** HTML_CodeSniffer, WCAG2AAA Principle2 Guideline2_1 2_1_1.js — https://raw.githubusercontent.com/squizlabs/HTML_CodeSniffer/master/Standards/WCAG2AAA/Sniffs/Principle2/Guideline2_1/2_1_1.js

### 7.4 Visual clickability prediction and its ceiling

**Verbatim Quote:** "Our model achieved a mean precision and recall, across the 10 folds of the experiment, of 90.2% (SD: 0.3%) and 87.0% (SD: 1.6%)."
**Verbatim Quote:** "Tapping is an immensely important gesture in mobile touch-screen interfaces, yet people still frequently are required to learn which elements are tappable through trial and error."
**Verbatim Quote:** "We collected 20,174 unique interface elements from 3,470 app screens."
**Human agreement:** overall agreement "0.8343", "Fleiss' Kappa value of 0.520", characterized as "Moderate"
**Source:** Swearngin & Li, *Modeling Mobile Interface Tappability Using Crowdsourcing and Deep Learning*, CHI 2019 — https://arxiv.org/pdf/1902.11247

**Verbatim Quote:** "To predict Icon clickability, we trained a Gradient Boosted Regression Trees model with several features (i.e., location, size, Icon Recognition result)."
**Source:** Zhang et al., *Screen Recognition: Creating Accessibility Metadata for Mobile Applications from Pixels*, CHI 2021 — https://arxiv.org/pdf/2101.04893

**Verbatim Quote:** "Specifically, we curate a dataset of interactable icon detection dataset, containing 67k unique screenshot images, each labeled with bounding boxes of interactable icons derived from DOM tree."
**Source:** Lu, Yang, Shen & Awadallah, *OmniParser for Pure Vision Based GUI Agent* — https://arxiv.org/pdf/2408.00203

### 7.5 Behavioral oracles outperform everything else

**Verbatim Quote:** "Our empirical evaluation across 26 real websites shows that A11YNAVIGATOR can detect around 200 accessibility issues that remain undetected by existing accessibility testing tools with a precision of 93.24% and recall of 98.97%."
**Verbatim Quote:** "A11YNAVIGATOR, an automated accessibility testing tool that simulates screen reader navigation to detect UI elements that cannot be either (1) located or (2) activated via the screen reader."
**Source:** Jain, Huq, He & Malek, *Automated Detection of Web Application Navigation Barriers for Screen Reader Users*, ASE 2025 — https://seal.ics.uci.edu/publications/2025_ASE.pdf

**Verbatim Quote:** "If the UI hierarchy before and after the action execution is the same, and there is no corresponding AccessibilityEvent of the executed action, the oracle reports an actionability issue for a given User Proxy."
**Verbatim Quote:** "In total, Groundhog could detect 293 true accessibility issues with a precision of 86%."
**Verbatim Quote:** "Action Extractor performs further analysis on the dumped hierarchy of UI elements and searches for those that support action, e.g., have clickable=true in their attributes."
**Source:** Salehnamadi, Mehralian & Malek, *Groundhog: An Automated Accessibility Crawler for Mobile Apps*, ASE 2022 — https://ics.uci.edu/~seal/publications/2022_ASE_Groundhog.pdf

**Verbatim Quote:** "For each use case, Latte reports if it encountered an accessibility failure during its execution using assistive services. A use case has an accessibility failure if the GUI element of one of its steps cannot be located (focused)."
**Source:** Salehnamadi et al., *Latte: Use-Case and Assistive-Service Driven Automated Accessibility Testing Framework for Android*, CHI 2021 — https://seal.ics.uci.edu/publications/2021_CHI_Latte.pdf

### 7.6 LLM approaches: coverage up, precision down

**Verbatim Quote:** "ScreenAudit achieves an average coverage of 69.2%, compared to only 31.3% with a widely-used accessibility checker."
**Source:** Zhong, Chen, Chen, Fogarty & Wobbrock, *ScreenAudit*, CHI 2025 — https://arxiv.org/abs/2504.02110

**Reported metrics:** Fail precision 41.4% (12 true failures from 29 predictions); fail recall 38.7% (12 of 31 oracle failures); exact five-way status accuracy 45.6% on 765 scored rows.
**Verbatim Quote:** "trades recall for precision"
**Source:** Fliti, Kokorina, Tambon & Papadakis, *Flow-A11y: Flow-Aware Accessibility Testing* — https://arxiv.org/html/2607.03100

**Verbatim Quote:** "While automated accessibility evaluators were unable to reliably test the three WCAG criteria, often missing or only warning about issues, the LLM-based scripts successfully identified accessibility issues the tools missed, achieving overall 87.18% detection across the test cases."
**Source:** López-Gil & Pereira, *Turning manual web accessibility success criteria into automatic: an LLM-based approach*, Universal Access in the Information Society 24:837–852 (2025) — https://link.springer.com/article/10.1007/s10209-024-01108-z

### 7.7 Listener introspection API

**Verbatim Quote:** "Returns event listeners of the given object."
**Verbatim Quote:** "Whether or not iframes and shadow roots should be traversed when returning the subtree (default is false). Reports listeners for all contexts if pierce is enabled."
**Source:** Chrome DevTools Protocol, DOMDebugger domain — https://chromedevtools.github.io/devtools-protocol/tot/DOMDebugger/

### 7.8 Static lint rules that do target this

**Verbatim Quote:** "Enforce `onClick` is accompanied by at least one of the following: `onKeyUp`, `onKeyDown`, `onKeyPress`. Coding for the keyboard is important for users with physical disabilities who cannot use a mouse, AT compatibility, and screen reader users. This does not apply for interactive or hidden elements."
**Source:** eslint-plugin-jsx-a11y, click-events-have-key-events — https://raw.githubusercontent.com/jsx-eslint/eslint-plugin-jsx-a11y/main/docs/rules/click-events-have-key-events.md

**Verbatim Quote:** "In order to add interactivity such as a mouse or key event listener to a static element, that element must be given a role value as well."
**Source:** eslint-plugin-jsx-a11y, no-static-element-interactions — https://raw.githubusercontent.com/jsx-eslint/eslint-plugin-jsx-a11y/main/docs/rules/no-static-element-interactions.md

### 7.9 Commercial claims

**Verbatim Quote:** "If Machine Learning is enabled (see settings page), it will detect any elements not marked up with interactive attributes (roles, tab index, etc) that may in fact be interactive."
**Source:** Deque, axe DevTools for Web — Interactive Elements IGT — https://docs.deque.com/devtools-for-web/4/en/devtools-igt-interactive-elements/

**Verbatim Quote:** "Evinced renders pages and analyzes them like a sighted user would. It uses advanced rule-sets, computer vision, AI, and other algorithms to build a structural semantic model of a webpage. It identifies the intents and actions (input fields, drop-downs, etc.), and looks at the code to see if it has been implemented accessibly."
**Source:** Evinced — https://www.evinced.com/technology

**Verbatim Quote:** "An interactive element can't be reached using the Tab or arrow keys."
**Source:** Microsoft, Accessibility Insights for Web — Assessment — https://accessibilityinsights.io/docs/web/getstarted/assessment/

### 7.10 KAFE — the closest existing system to what you are describing

Chiou, Alotaibi & Halfond, *Detecting and Localizing Keyboard Accessibility Failures in Web Applications*, ESEC/FSE '21, August 23–28 2021, Athens, Greece. DOI 10.1145/3468264.3468581. Read from the PDF directly.

*Text-extraction note: the ACM PDF renders typographic quotes as `ł`/`ž` and math symbols as styled Unicode under `pdftotext`. Quotes below are normalized — curly apostrophes rendered as `'`, math variables written as plain letters in brackets. Every quote in this section was then re-checked by exact substring match (`grep -F`) against a whitespace-flattened extraction of the PDF; all passed. Because the paper is two-column, sentences break across lines in the raw extraction — a literal Ctrl+F in a PDF reader may need to target a single line fragment rather than a full sentence.*

**Scope — two failure types, not one.** Inaccessible Functionalities (IAF, SC 2.1.1) and Keyboard Traps (KTF, SC 2.1.2).

> "This type of KAF occurs when an interactive element is not included in the keyboard navigation flow of the UI or an element in the navigation flow does not have a keyboard event handler."

Note the two sub-cases, both of which your tool needs: **non-reachable** (cannot receive focus) and **non-actionable** (receives focus, but Enter/Space does nothing). Your `<span id="last-responses-btn">` is the first kind. A `<div tabindex="0" onclick>` with no key handler is the second — and it will pass any tab-order-only check.

**Why naive DOM inspection fails for actionability — quote this at anyone who proposes an attribute scanner:**

> "A naive way to detect this would be to simply examine the DOM and determine if [v_k] has either an explicit or implicit keyboard event handler associated with it. However, a keyboard event handler may be assigned through complex event delegation, which may not be visible via DOM inspection, or [v_k] may handle some key presses (e.g., Tab and Shift + Tab ) that simply change the browser focus without actually activating the element."

**Their solution — behavioral observation, not introspection:**

> "Our edge creation mechanism can capture a shift (or no shift) in focus that is caused by JavaScript event handlers since it simply observes the response of the page to the keyboard action, which would include any JavaScript actions."

**The state-change oracle:**

> "Lastly, if [φ] causes any sort of change in the DOM's attributes' values, then the [δ] flag is set to True, otherwise it is set to False."

**The differential:**

> "Note that WCAG only requires actionable as an accessibility criteria when the element can be triggered by the mouse. This is accounted for in our approach since [v_k] is the corresponding node of a node already in the PCNFG, and, by definition, a node is only in the PCNFG if it has an associated mouse event handler."

**Visibility heuristics — reusable directly:**

> "These are (1) non-disabled elements that do not exhibit a final computed DOM layout style of type="hidden", visibility:hidden, display:none, or inherit their ancestor's rendered hidden properties; (2) elements that are not rendered with a height or width of zero pixels; or (3) excluded from the PUT's visual flow (e.g., elements inside another tab-menu, or inside containers that are collapsed whose contents aren't shown)."

**Evaluation.** 40 pages containing at least one KAF, plus 20 clean pages as a false-positive control.

> "Overall, our subjects contained 168 IAFs and 28 KTFs."

Table 1 results are reproduced in §6 above. Runtime:

> "Specifically, the time spent on building the KNFG* and PCNFG* averaged 9.9 minutes and 9.2 minutes, respectively."

with detection at 0.8 seconds and localization at 3 seconds — i.e. **over 99% of the cost is model construction, and the analysis itself is free.** That is the argument for building the models once per page and running many checks against them.

**`[INFERENCE]` — read the precision number carefully.** The 92%/100% figures are *page-level*:

> "For each subject web page, we considered a detection to be correct (i.e., a true-positive) if KAFE indicated the page contained a KAF of a type and we had previously determined that the page contained a KAF of that type."

Detecting that a page has at least one defect is a much easier problem than element-level classification. The element-level quality is captured by localization recall (94%) and rank (median 5, mean 8.8 for IAFs). Do not quote 92%/100% as element-level accuracy.

**Why every DOM scanner scored 0% on keyboard traps:**

> "The keyboard traps were undetectable by the other tools because they focused on examining DOM based properties, but KTFs represent runtime behavior that is undetectable by examining the DOM."

**Root-cause frequencies — this is the most directly useful table in the paper for prioritizing your detector:**

> "We found that 37 out of 455 buttons and 22 out of 58 dropdown-lists across our subject pool were inaccessible due to their inability to receive keyboard focus."

> "Overall, a remarkably high 35 of 49 menus implemented to expand when a mouse hovered over them were inaccessible."

Also reported: 34 instances of `<a>` used to trigger JavaScript with no `href` (the extracted phrase contains an inline typographic quote around the attribute name); two instances of `tabindex="0"` applied without any keyboard handler — focusable but not actionable; and six cases of visually-hidden checkboxes operated via a styled `<label>`.

**Stated limitations — these are your engineering risks, verbatim:**

> "The primary cause of inaccuracy in our approach was when Selenium WebDriver was unable to interact with some elements that it considers "NotInteractable" [30] or when the DOM was considered "Stale" [4]. These situations occur when elements are obstructed by others, or when the DOM is spontaneously altered by AJAX calls that were not triggered via our automated interaction (e.g., events automatically loaded via a timer, a slider/carousel that constantly loads persistent streams, or asynchronous calls that implement infinite scrolling to load and populate data)."

*(The two bracketed terms appear in the source wrapped in typographic quotes; rendered here as straight quotes.)*

`[INFERENCE]` Both failure modes are Selenium-era artifacts that CDP largely dissolves. `Input.dispatchMouseEvent` at viewport coordinates does real hit-testing rather than refusing on "NotInteractable", and CDP `Emulation.setVirtualTimePolicy` plus network interception can freeze timers and stub AJAX — the exact source of their "Stale DOM" failures. Their own closing note anticipates this: *"We believe that further improvements in web page capture and replay techniques would allow for this behavior to be more reliably controlled for during analysis."*

**Implementation stack, for reference.** Java prototype, Selenium 3.141.5, Firefox 68.0, fixed 1920×1080 viewport, web proxy for page capture/replay. `[INFERENCE]` The fixed viewport matters: hover menus and responsive collapse behavior are viewport-dependent, so single-resolution results undercount.

**Follow-on work by the same group** — worth reading before building:
*Detecting Dialog-Related Keyboard Navigation Failures in Web Applications* (ICSE 2023) · *Automatically Detecting Reflow Accessibility Issues in Responsive Web Pages* (ICSE 2024) · *Lost in Navigation: Detecting Keyboard Navigation Accessibility Issues in Web Pages* (ICST 2026) · *Assessing the User Interaction Cost of Keyboard Navigation in Web Applications* (ICSME 2026).

---

## 8. Gaps and unverified items

**Resolved.** The ESEC/FSE 2021 paper previously listed here as unretrievable has been read in full; see §7.10. Its architecture is the mouse-vs-keyboard differential recommended in §2, which means that design is validated prior art rather than a proposal.

**Extraction-layer caveat.** Quotes marked from `raw.githubusercontent.com` were retrieved as raw source and are byte-exact. Quotes from vendor and publisher pages passed through a markdown-extraction layer; wording was re-verified on second fetch where load-bearing, but they are transcriptions rather than raw bytes.

**Not verified.** ARC Toolkit (TPGi) publishes no reachable per-rule reference; its coverage of this class is unknown. WAVE's engine source is not public, so whether `event_handler` inspects `addEventListener` could not be confirmed. Evinced's "19 times more" claim is vendor marketing with no independent corroboration found.

**Not found.** No published system combines LLM-driven scenario generation, behavioral mouse-vs-keyboard differential, and web-side WCAG judgment. Of my three proposals: the coverage-diff oracle (§3.7) is a narrower contribution than originally stated — KAFE owns the differential frame, and coverage-diff only improves the state-observation layer and the functional-equivalence check. The hover-diff affordance signal (§3.9) and production click telemetry (§3.12) remain without prior art I could find, though KAFE's mouse action set already includes `mouseover`/`mouseenter`, which captures the same defects behaviorally at higher cost.

**Revised recommendation.** Do not start from scratch. Start from KAFE's KNFG/PCNFG formulation, port the substrate from Selenium to CDP (which dissolves both of their stated failure modes), and add: coverage-based state observation instead of DOM-attribute-diff, framework-prop extraction for candidate generation, and hover-diff as a cheap prefilter to cut the 19-minute-per-page model-construction cost.
