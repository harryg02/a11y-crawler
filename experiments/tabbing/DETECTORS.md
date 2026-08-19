# Twelve detectors

What each method asks, the rule it applies, the code that implements it, and what its score
means. Companion to [STUDY.md](STUDY.md).

Every detector answers the same question — *which elements should be reported as clickable
but not keyboard-operable?* — and returns a set of probe ids, scored against the same
60-probe corpus with the same 26 correct answers.

**Set T** is shared by all of them and is not itself a detector. It is the true tab order,
computed once per page by dispatching real `Tab` keypresses through CDP
([`taborder.ts`](taborder.ts)). Every candidate generator reports *candidates − T*.

| | detector | precision | recall |
|---|---|---|---|
| D0 | [Current crawler](#d0) | 33.3% | 3.8% |
| D1 | [axe-core](#d1) | — | 0.0% |
| D2 | [Inline-attribute scan](#d2) | 100% | 3.8% |
| D2b | [Handler-property scan](#d2b) | 100% | 11.5% |
| D3 | [tabindex-counter](#d3) | 100% | 3.8% |
| D4 | [CSS + lexical](#d4) | 71.0% | 84.6% |
| D5 | [CDP getEventListeners](#d5) | 80.0% | 76.9% |
| D6 | [addEventListener shim](#d6) | 77.3% | 65.4% |
| D7 | [React fiber props](#d7) | 100% | 7.7% |
| D8 | [Hover-diff rendering](#d8) | 72.0% | 69.2% |
| D9 | [Mouse-vs-keyboard differential](#d9) | 86.7% | 100% |
| D10 | [Coverage-diff](#d10) | 83.3% | 96.2% |
| +S4 | [Equivalence dismissal](#s4) | 96.3% | 100% |

---

# Baselines

## D0 — this repo's `collectClickables` <a id="d0"></a>

**Asks:** what is worth clicking during a crawl?
**Score:** 33.3% precision · 3.8% recall · 35 ms

```
button, [role="button"], [role="tab"], [role="menuitem"],
[role="switch"], [role="checkbox"], [role="radio"],
details > summary, [aria-expanded], [aria-haspopup],
select, [onclick]

then drop:
  el.closest('a')            // inside a link — the link is the control
  el.offsetParent === null   // not rendered
  TD / TR / TH               // table cells, to avoid grid explosions
```

**Implementation:** [`lib/crawler/scanner.ts`](../../lib/crawler/scanner.ts) →
`collectClickables()`, mirrored for scoring in [`candidates.ts`](candidates.ts) →
`d0CurrentCrawler()`. Pure page-script `querySelectorAll`; no CDP, no instrumentation.

**Result.** It found one of the 26 defects, and two of its three reports were wrong. This is
not a failure of the code — it was written to find things worth clicking during a crawl, and
it does that; it is measured here as a baseline, out of its intended scope. The reason it
cannot do this job is structural: every selector in its list is a marker an author *chose to
add*, and the defect is defined by those markers being absent.

Two findings do apply to it as it stands — ambiguous selectors (8 of 14 matched more than one
element) and the weakest click oracle measured. See [STUDY.md §7](STUDY.md#7-what-this-means-for-the-crawler).

## D1 — axe-core <a id="d1"></a>

**Asks:** does this page violate a machine-checkable WCAG rule?
**Score:** 0 reports · 0.0% recall · 4.3 s

**Implementation:** `new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()`
— the same call this repo already makes in `scanPage()`.

**Result.** Zero reports on any of the 60 probes. Not zero *correct* reports — zero reports.

Not a bug and not a criticism: axe-core is explicitly built to emit only findings that need no
human judgement, and this defect class cannot be settled without executing the page. Deque's
own published data puts automated coverage of SC 2.1.1 at 2.49%; this result is that number,
reproduced.

The practical consequence: **a clean axe run says nothing at all about keyboard operability.**
Any product reporting "no accessibility violations" on the strength of axe alone is making a
claim its evidence does not support.

---

# Attribute and property scanners

Read the markup, decide from what's written there. Free, and almost always right when they fire.

## D2 — inline-attribute scan <a id="d2"></a>

**Asks:** does the HTML literally say `onclick=`?
**Score:** 100% precision · 3.8% recall · 34 ms

```
report if
  el has any of [onclick, onkeyup, onkeydown, onkeypress,
                 onmousedown, onmouseup, onmouseover]   // as ATTRIBUTES
  and el is not natively focusable   // a[href], button, input, select…
  and el has no tabindex
```

**Implementation:** [`candidates.ts`](candidates.ts) → `pageDetector(page, 'attrScan')`.

This is what HTML_CodeSniffer — the engine behind Pa11y's default runner — does. Its own
source comment concedes the limit: *"Cannot detect event listeners here so only onclick
attributes are checked."*

**Result.** One defect found out of 26. Perfect precision, because an inline `onclick` on a
non-focusable element is unambiguous — it just almost never appears. Nobody has written
`onclick=` in production HTML since jQuery, and both canonical examples in the survey use
`addEventListener`. A scanner restricted to attributes is looking at the one place the defect
is not.

## D2b — handler-property scan <a id="d2b"></a>

**Asks:** is `el.onclick` a function?
**Score:** 100% precision · 11.5% recall · 35 ms

```
report if typeof el.onclick === 'function'
          // or onmousedown / onmouseup / onmouseover / ondblclick
```

The *property*, not the attribute — `el.onclick` can be assigned from JavaScript without ever
appearing in the markup.

**Implementation:** [`candidates.ts`](candidates.ts) → `pageDetector(page, 'handlerProp')`.
Three lines. Added *after* the first run, because the React result made no sense until I
checked what React was actually doing to the DOM.

**Result.** Low recall overall, but it caught **every React defect** — and it is the reason
one of the survey's claims had to be retracted. See
[STUDY.md §3.1](STUDY.md#31-react-19-handlers-are-directly-inspectable--12-36).

It finds nothing outside React because plain `addEventListener` code never touches the
property. Cheap enough to always run; never sufficient alone.

## D3 — tabindex-counter <a id="d3"></a>

**Asks:** does this element claim to be a control but carry no `tabindex`?
**Score:** 100% precision · 3.8% recall · 32 ms

```
report if
  el has an interactive ARIA role      // button, link, tab, menuitem, switch…
       or an inline handler attribute
       or aria-expanded / aria-haspopup
  and el is not natively focusable
  and el has no tabindex
```

**Implementation:** [`candidates.ts`](candidates.ts) → `pageDetector(page, 'tabindexCounter')`.

**Result.** The survey cites 93% precision / 39% recall for this approach. Measured here: 100%
precision, **3.8% recall** — an order of magnitude worse, on a corpus built from the survey's
own list of defects.

The reason is the same one that limits D2: it depends on the author having applied a marker. A
developer who writes `role="button"` and forgets `tabindex` is already thinking about
accessibility. The developer who writes a bare `<div>` and binds a click listener is not, and
leaves nothing to count.

**Attribute heuristics find the near-misses, not the blind spots.** That is the honest summary
of this whole family.

---

# Listener discovery

Find the handlers the markup doesn't mention — the "event listener sniffing" family.

## D5 — CDP `DOMDebugger.getEventListeners` <a id="d5"></a>

**Asks:** what listeners does the browser itself say are bound here?
**Score:** 80.0% precision · 76.9% recall · 292 ms

```
DOM.resolveNode({ nodeId })                                    → objectId
DOMDebugger.getEventListeners({ objectId, depth: 0, pierce: true })

report if any listener.type is a mouse event
   [click, mousedown, mouseup, mouseover, mouseenter,
    dblclick, pointerdown, pointerup]
```

The same data DevTools shows in its Event Listeners pane — authoritative, from the engine
rather than from guessing.

**Implementation:** [`candidates.ts`](candidates.ts) → `d5CdpListeners()`. Elements are
addressed through `DOM.getDocument({pierce:true})`, which walks the whole tree including
shadow roots and same-origin frames. That reached **60 of 60** probes, closed shadow roots
included.

**Result.** Best of the three listener routes and the best non-behavioural detector overall.
It still misses a quarter of the defects.

*Misses:* delegated listeners bound to `document` (nothing on the element to find); the
pure-CSS hover menu (no JavaScript exists); and structurally, the focusable-but-not-actionable
probes, which are in Set T and subtracted before scoring.

*Gets wrong:* five reports on elements nobody can operate — under a transparent overlay,
`pointer-events:none`, inside `inert`, and one whose handler body is empty. A listener
existing is not the same as a control existing.

## D6 — `addEventListener` shim at document-start <a id="d6"></a>

**Asks:** what did the page register while I was watching?
**Score:** 77.3% precision · 65.4% recall · 59 ms

```js
// injected BEFORE any page script runs
const raw = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (type, fn, opts) {
  listeners.push({ target: this, type, stack: new Error().stack });
  return raw.call(this, type, fn, opts);
};

report if a recorded registration has a mouse type
   and its target is an element (not document / window)
```

**Implementation:** [`instrument.ts`](instrument.ts) → `INIT_SCRIPT`, installed via
`page.addInitScript`.

**Result.** The *weakest* listener route, not the strongest, and the survey's description of
its blind spot is too narrow. See
[STUDY.md §3.2](STUDY.md#32-the-addeventlistener-shim-is-the-weakest-listener-route--35).

Keep it in the pipeline for **provenance**, not detection — a finding a developer can't locate
is a finding they'll mute.

## D7 — React fiber props <a id="d7"></a>

**Asks:** does React's internal state say this element has an `onClick`?
**Score:** 100% precision · 7.7% recall · 38 ms

```
for key of Object.keys(el):
  if key.startsWith('__reactProps$'):
    props = el[key]
    report if props.onClick || props.onMouseDown || props.onMouseOver
```

React hangs its fiber props off the DOM node under a randomised key — a private API with no
compatibility promise.

**Implementation:** [`candidates.ts`](candidates.ts) → `pageDetector(page, 'reactProps')`.

**Result.** Correct on everything it reported, and made redundant by a three-line property
check. 7.7% recall is not a defect — it only ever sees the React page, which holds three of the
26 defects, one of which Set T removes. Within its scope it was perfect.

The finding that matters is about *necessity*, not accuracy. The survey calls framework-prop
extraction "mandatory" and "version-fragile" in the same breath. D2b found the same React
handlers using a stable web-platform property. **Reach for fiber internals when you need to
know which prop was bound; not to find out whether one was.**

---

# Perceptual

Judge from appearance, not from code. High recall, and they cannot tell a control from a costume.

## D4 — CSS `cursor:pointer` + class lexicon <a id="d4"></a>

**Asks:** does this look like a button?
**Score:** 71.0% precision · 84.6% recall · 34 ms

```
report if element is visible and any of:
  getComputedStyle(el).cursor === 'pointer'
  el.className matches /btn|button|click|toggle|tab|selected|action|
                        menu|icon|link|card|switch|dropdown|expand|
                        close|open|nav/
  el has an interactive ARIA role
```

**Implementation:** [`candidates.ts`](candidates.ts) → `pageDetector(page, 'cssLexical')`.
Visibility uses KAFE's published heuristics: not `display:none`, not `visibility:hidden`,
non-zero box, not `disabled`.

**Result.** Best recall of anything that isn't the behavioural oracle — 22 of 26 — at the worst
precision of all 18 configurations. Nine false reports, all predictable: a `<div class="btn">`
with no handler, a styled toggle icon wired to nothing, a decorative span inside a real button.
`cursor:pointer` is applied decoratively constantly, and a class named `btn` is a statement
about CSS, not behaviour.

**Use it as a prefilter feeding a behavioural check; never emit its output.** As a funnel stage
it is excellent — 84.6% recall for 34 ms means the expensive oracle only runs on what it flags.

## D8 — hover-diff rendering <a id="d8"></a>

**Asks:** does the site's own CSS react when the pointer arrives?
**Score:** 72.0% precision · 69.2% recall · 15.4 s

```
mouse.move(far corner);   rest    = screenshot(clip)
mouse.move(centre of el); hovered = screenshot(clip)

report if rest.bytes !== hovered.bytes

// clip is the element's box + 8px margin + 200px below,
// because a hover often reveals a submenu OUTSIDE the box
```

**Implementation:** [`candidates.ts`](candidates.ts) → `d8HoverDiff()`. No model, no training
data, no source access — a raw buffer comparison of two PNGs.

**Result.** Middling on both axes, and by far the most expensive of the cheap detectors — 440×
the cost of the CSS heuristic for worse precision.

The idea is sound: a visual change on hover is the site *declaring* the element interactive, in
CSS rather than JS. In practice it fires on anything with a hover style, including a tooltip on
running text, and stays silent on any control the designer gave no hover state — which cost it
the icon span, the SVG, and both shadow-root probes.

**Its real contribution isn't as a standalone detector.** Folding hover into the behavioural
oracle's action set is what catches the pure-CSS menu, which nothing else could see.

---

# Behavioural

Stop asking what the element *is*. Operate it both ways and compare.

## D9 — mouse-vs-keyboard differential <a id="d9"></a>

**Asks:** does the mouse make something happen that the keyboard cannot?
**Score:** 86.7% precision · 100% recall · 1.20 s per probe

```
// MOUSE PASS
load page fresh
before = snapshot()
move pointer to element centre; wait      // hover counts as mouse input
click at those coordinates                // TRUSTED CDP input, not el.click()
mouseDelta = channels that changed

// RESET — full reload, not an undo

// KEYBOARD PASS
load page fresh
before = snapshot()
if element is in Set T:
    press Tab exactly index(el) times     // land on it, nothing else
    press Enter, Space, ArrowDown
else:
    do nothing                            // unreachable = no action possible
keyboardDelta = channels that changed

report if mouseDelta is non-empty and keyboardDelta is empty
```

**Observation.** "Something happened" is measured across eight channels, in every frame, not
just the top document:

| channel | mechanism |
|---|---|
| `dom` | `innerHTML` hash |
| `geometry` | every element's box + `display`/`visibility`/`opacity` |
| `mutations` | MutationObserver record count |
| `net` | patched `fetch` + `XMLHttpRequest` |
| `storage` | patched `Storage.prototype.setItem` / `removeItem` / `clear` |
| `console` | patched `console.log` / `warn` / `error` … |
| `canvas` | patched `CanvasRenderingContext2D` methods |
| `nav` | `location.href`, `history.pushState`, `hashchange` |

Geometry is recorded in *document* coordinates, not viewport ones — otherwise pressing Space
scrolls the page and the oracle mistakes scrolling for the keyboard working.

**Implementation:** [`differential.ts`](differential.ts) → `runDifferential()`;
[`instrument.ts`](instrument.ts) → `INIT_SCRIPT` for the channel patches.

**Result. Found all 26. Missed nothing.** Four false reports, three of which are the same
problem and get cleared by Stage 4.

### Channel ablation

| Channels observed | precision | recall | What it loses |
|---|---|---|---|
| `dom` only | 91.3% | 80.8% | fetch, storage, canvas, console handlers; the CSS-only menu |
| `dom` + `geometry` | 88.0% | 84.6% | all four no-DOM-trace handlers |
| **all eight** | 86.7% | **100.0%** | nothing |
| all eight, pointer parked first | 89.3% | 96.2% | the pure-CSS hover menu |

The first row is the oracle this repo's crawler uses today. Widening observation is worth
**+19.2 points of recall** for a few patched prototypes and one extra `getComputedStyle` pass.

### Two details that turned out to be load-bearing

**Trusted input, not `element.click()`.** Real CDP input does hit-testing, so an element under
a transparent overlay correctly registers as not operable. `element.click()` fires it anyway —
and also fires elements with `pointer-events:none` and `visibility:hidden`. Three probes
separated on exactly this.

**There is no such thing as clicking without hovering.** CDP dispatches a `mousemove` to the
target before `mousePressed`. See
[STUDY.md §3.3](STUDY.md#33-there-is-no-such-thing-as-clicking-without-hovering--39).

## D10 — coverage-diff <a id="d10"></a>

**Asks:** which JavaScript functions ran under the mouse that didn't run under the keyboard?
**Score:** 83.3% precision · 96.2% recall · 1.20 s per probe

```
Profiler.startPreciseCoverage({ callCount: true, detailed: true })
Profiler.takePreciseCoverage()   // discard — this also RESETS the counters
…perform the action…
Profiler.takePreciseCoverage()   // exactly what ran during the action

// keep only functions from fixture scripts, as url:name:offset

D10a  report if mouse ran something and keyboard ran nothing
D10b  report if mouse ran something the keyboard never reached
```

**Implementation:** [`differential.ts`](differential.ts) → `takeCoverage()`,
`coverageVerdict()`, `coverageDiffVerdict()`. A per-page **baseline** is subtracted first:
click a handler-free target, record what ran, remove those functions from every subsequent
set. On the React page that strips 28 functions per click.

**Result.** Slightly worse than the channel-based oracle on both axes, at the same cost. The
survey proposed this as an improvement; measured, it is a lateral move.

*Wins:* the set-difference form (D10b) catches the focusable-but-not-actionable case the strict
form misses — an element the keyboard *reaches*, running focus code, while never running the
handler.

*Loses:* cannot see the pure-CSS hover menu (no JavaScript executes at all), and fires on a
handler whose body is empty — a function running is not an effect happening.

Its lasting value is elsewhere: **the executed-function set is what makes Stage 4 possible.**

## +S4 — Stage-4 equivalence dismissal <a id="s4"></a>

**Asks:** is this functionality already available from the keyboard somewhere else?
**Score:** 96.3% precision · 100% recall · free

Not a detector — a filter over D9's confirmed findings, reusing data already collected. WCAG
requires equivalent *functionality*, not equivalent elements.

```
for each confirmed finding f:
  for each element k that IS keyboard-reachable:
    if k's keyboard effect touches the same channels as f's mouse effect
       and k's executed functions == f's executed functions   // EXACTLY
    then dismiss f — the functionality is keyboard-available
```

**Implementation:** [`tests/tabbing-experiment.spec.ts`](../../tests/tabbing-experiment.spec.ts)
→ `stage4(threshold)`. No extra page loads.

**Result.** Precision **86.7% → 96.3%**, recall unchanged at 100%. The single highest-value
stage in the pipeline, and it is free.

It cleared three of D9's four false reports, all the same class: a clickable card wrapping a
real link, a `<label>` driving a focusable checkbox, a decorative span inside a real button.
Each is genuinely mouse-operable and genuinely not focusable — and none is a defect, because
the functionality is one Tab away. **No per-element check can ever reach that conclusion.**

The threshold is not a soft knob; see
[STUDY.md §5](STUDY.md#5-the-stage-4-threshold-decides-the-design).

---

# The shape of it

Read down the families and the same pattern repeats. **Everything cheap is either precise or
complete, never both.** The attribute scanners are right when they fire and fire almost never.
The perceptual detectors find most things and are wrong a third of the time. The listener
routes sit in the middle and each has a structural blind spot the others cover.

Only the behavioural oracle escapes that trade, and not because it is cleverer. It asks a
different question. Every other detector asks *what is this element?* — a question about
markup, appearance, or registration, all of which are proxies. The differential asks *what does
it do, and can the keyboard do it too?* — which is what the success criterion actually says.

It costs 1.20 s per probe against 34 ms for the whole corpus, and the cheap detectors earn
their place as the funnel that keeps that affordable.
