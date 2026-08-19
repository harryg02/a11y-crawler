# Tabbing experiment — results

Corpus: 60 labelled probes across 9 pages (26 violations, 34 negatives).
Chromium chromium, viewport 1280×900.

## Detector scores

| detector | TP | FP | FN | precision | recall | F1 | runtime |
|---|---|---|---|---|---|---|---|
| D9 + Stage-4 @ exact coverage equality | 26 | 1 | 0 | 96.3% | 100.0% | 98.1% | 71.7s |
| D9 differential — all channels | 26 | 4 | 0 | 86.7% | 100.0% | 92.9% | 71.7s |
| D9 differential — click only, all channels | 25 | 3 | 1 | 89.3% | 96.2% | 92.6% | 76.9s |
| D9 + Stage-4 equivalence dismissal | 23 | 1 | 3 | 95.8% | 88.5% | 92.0% | 71.7s |
| D10b coverage-diff (set difference) | 25 | 5 | 1 | 83.3% | 96.2% | 89.3% | 71.7s |
| D10a coverage-diff (keyboard ran nothing) | 23 | 4 | 3 | 85.2% | 88.5% | 86.8% | 71.7s |
| D9 differential — dom+geometry | 22 | 3 | 4 | 88.0% | 84.6% | 86.3% | 71.7s |
| D9 differential — dom only | 21 | 2 | 5 | 91.3% | 80.8% | 85.7% | 71.7s |
| D5 CDP getEventListeners | 20 | 5 | 6 | 80.0% | 76.9% | 78.4% | 292ms |
| D4 CSS+lexical | 22 | 9 | 4 | 71.0% | 84.6% | 77.2% | 34ms |
| D6 addEventListener shim | 17 | 5 | 9 | 77.3% | 65.4% | 70.8% | 59ms |
| D8 hover-diff | 18 | 7 | 8 | 72.0% | 69.2% | 70.6% | 15.4s |
| D2b handler-property scan | 3 | 0 | 23 | 100.0% | 11.5% | 20.7% | 35ms |
| D7 React fiber props | 2 | 0 | 24 | 100.0% | 7.7% | 14.3% | 38ms |
| D2 inline-attr scan | 1 | 0 | 25 | 100.0% | 3.8% | 7.4% | 34ms |
| D3 tabindex-counter | 1 | 0 | 25 | 100.0% | 3.8% | 7.4% | 32ms |
| D0 current crawler | 1 | 2 | 25 | 33.3% | 3.8% | 6.9% | 35ms |
| D1 axe-core | 0 | 0 | 26 | 0.0% | 0.0% | 0.0% | 4.3s |

## What each detector got wrong

- **D9 + Stage-4 @ exact coverage equality** — FP: p33 (decoy); FN: —
- **D9 differential — all channels** — FP: p23 (decoy), p25 (ok), p27 (decoy), p33 (decoy); FN: —
- **D9 differential — click only, all channels** — FP: p23 (decoy), p25 (ok), p27 (decoy); FN: p30
- **D9 + Stage-4 equivalence dismissal** — FP: p33 (decoy); FN: p50, p53, p54
- **D10b coverage-diff (set difference)** — FP: p22 (decoy), p23 (decoy), p25 (ok), p27 (decoy), p52 (ok); FN: p30
- **D10a coverage-diff (keyboard ran nothing)** — FP: p22 (decoy), p23 (decoy), p25 (ok), p27 (decoy); FN: p10, p30, p54
- **D9 differential — dom+geometry** — FP: p25 (ok), p27 (decoy), p33 (decoy); FN: p60, p61, p62, p63
- **D9 differential — dom only** — FP: p25 (ok), p27 (decoy); FN: p30, p60, p61, p62, p63
- **D5 CDP getEventListeners** — FP: p22 (decoy), p23 (decoy), p70 (decoy), p72 (decoy), p82 (excluded); FN: p10, p26, p30, p40, p41, p54
- **D4 CSS+lexical** — FP: p20 (decoy), p21 (decoy), p22 (decoy), p23 (decoy), p27 (decoy), p70 (decoy), p72 (decoy), p82 (excluded), p55 (decoy); FN: p10, p12, p26, p54
- **D6 addEventListener shim** — FP: p22 (decoy), p23 (decoy), p70 (decoy), p72 (decoy), p82 (excluded); FN: p10, p11, p26, p30, p40, p41, p50, p53, p54
- **D8 hover-diff** — FP: p20 (decoy), p21 (decoy), p22 (decoy), p23 (decoy), p27 (decoy), p33 (decoy), p55 (decoy); FN: p02, p06, p10, p12, p26, p90, p91, p54
- **D2b handler-property scan** — FP: —; FN: p01, p02, p03, p04, p05, p06, p10, p12, p26, p30, p31, p40, p41, p60, p61, p62, p63, p71, p81, p90, p91, p92, p54
- **D7 React fiber props** — FP: —; FN: p01, p02, p03, p04, p05, p06, p10, p11, p12, p26, p30, p31, p40, p41, p60, p61, p62, p63, p71, p81, p90, p91, p92, p54
- **D2 inline-attr scan** — FP: —; FN: p01, p02, p03, p04, p05, p06, p10, p12, p26, p30, p31, p40, p41, p60, p61, p62, p63, p71, p81, p90, p91, p92, p50, p53, p54
- **D3 tabindex-counter** — FP: —; FN: p01, p02, p03, p04, p05, p06, p10, p12, p26, p30, p31, p40, p41, p60, p61, p62, p63, p71, p81, p90, p91, p92, p50, p53, p54
- **D0 current crawler** — FP: p82 (excluded), p85 (excluded); FN: p01, p02, p03, p04, p05, p06, p10, p12, p26, p30, p31, p40, p41, p60, p61, p62, p63, p71, p81, p90, p91, p92, p50, p53, p54
- **D1 axe-core** — FP: —; FN: p01, p02, p03, p04, p05, p06, p10, p11, p12, p26, p30, p31, p40, p41, p60, p61, p62, p63, p71, p81, p90, p91, p92, p50, p53, p54

## Set T — real Tab traversal (§3.3)

| page | tab order | focusable but NOT a tab stop |
|---|---|---|
| a-vanilla.html | p07 → p08 → p09 → p10 | — |
| b-decoys.html | p23a → p25i → p27b | — |
| c-hover.html | p32 | — |
| d-delegation.html | p42 | — |
| e-nodom.html | p64 | — |
| f-occlusion.html | (none) | — |
| g-taborder.html | p80 → p84 → p86 | p81 |
| h-shadow.html | p93 → p94 | — |
| react/index.html | p51 → p52 → p54 | — |

## Per-probe differential

| probe | truth | in Set T | mouse channels | keyboard channels | mouse cov | kbd cov |
|---|---|---|---|---|---|---|
| p01 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p02 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p03 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p04 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p05 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p06 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p07 | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 2 | 2 |
| p08 | ok | yes | nav | nav | 2 | 2 |
| p09 | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 2 | 3 |
| p10 | violation | yes | dom, geometry, mutations | — | 2 | 1 |
| p11 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p12 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p20 | decoy | no | — | not in Set T | 0 | 0 |
| p21 | decoy | no | — | not in Set T | 0 | 0 |
| p22 | decoy | no | — | not in Set T | 1 | 0 |
| p23 | decoy | no | nav | not in Set T | 2 | 0 |
| p23a | ok | yes | nav | nav | 2 | 2 |
| p24 | decoy | no | — | not in Set T | 0 | 0 |
| p25 | ok | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p25i | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 2 | 2 |
| p26 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p26i | excluded | no | no rendered box (display:none / zero-size) | not in Set T | 0 | 0 |
| p27 | decoy | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p27b | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 2 | 2 |
| p30 | violation | no | geometry | not in Set T | 0 | 0 |
| p31 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p32 | ok | yes | nav | nav | 0 | 0 |
| p33 | decoy | no | geometry | not in Set T | 0 | 0 |
| p40 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p41 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p42 | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 2 | 2 |
| p60 | violation | no | net | not in Set T | 2 | 0 |
| p61 | violation | no | storage | not in Set T | 2 | 0 |
| p62 | violation | no | canvas | not in Set T | 2 | 0 |
| p63 | violation | no | console | not in Set T | 2 | 0 |
| p64 | ok | yes | net | net | 2 | 2 |
| p70 | decoy | no | — | not in Set T | 0 | 0 |
| p71 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p72 | decoy | no | — | not in Set T | 0 | 0 |
| p73 | excluded | no | no rendered box (display:none / zero-size) | not in Set T | 0 | 0 |
| p74 | excluded | no | no rendered box (display:none / zero-size) | not in Set T | 0 | 0 |
| p75 | excluded | no | — | not in Set T | 0 | 0 |
| p80 | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 2 | 2 |
| p81 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p82 | excluded | no | — | not in Set T | 0 | 0 |
| p83 | excluded | no | — | not in Set T | 0 | 0 |
| p84 | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 2 | 2 |
| p85 | excluded | no | — | not in Set T | 0 | 0 |
| p86 | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 2 | 2 |
| p90 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p91 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p92 | violation | no | dom, geometry, mutations | not in Set T | 2 | 0 |
| p93 | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 2 | 2 |
| p94 | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 2 | 2 |
| p50 | violation | no | dom, geometry, mutations | not in Set T | 125 | 0 |
| p51 | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 125 | 129 |
| p52 | ok | yes | dom, geometry, mutations | dom, geometry, mutations | 125 | 132 |
| p53 | violation | no | dom, geometry, mutations | not in Set T | 125 | 0 |
| p54 | violation | yes | dom, geometry, mutations | — | 125 | 9 |
| p55 | decoy | no | — | not in Set T | 0 | 0 |

## E2 — trusted CDP input vs element.click() (§1.3)

| probe | truth | trusted mouse channels | untrusted mouse channels |
|---|---|---|---|
| p70 | decoy | — | dom, geometry, mutations |
| p71 | violation | dom, geometry, mutations | dom, geometry, mutations |
| p72 | decoy | — | dom, geometry, mutations |
| p73 | excluded | — | — |
| p74 | excluded | — | — |
| p75 | excluded | — | dom, geometry, mutations |

## E3 — Stage-4 equivalence dismissals (§5)

- `p23` (decoy) dismissed — `p23a` is keyboard-reachable and produces the same effect (coverage Jaccard 1.00).
- `p25` (ok) dismissed — `p25i` is keyboard-reachable and produces the same effect (coverage Jaccard 1.00).
- `p27` (decoy) dismissed — `p27b` is keyboard-reachable and produces the same effect (coverage Jaccard 1.00).
- `p50` (violation) dismissed — `p51` is keyboard-reachable and produces the same effect (coverage Jaccard 0.95).
- `p53` (violation) dismissed — `p51` is keyboard-reachable and produces the same effect (coverage Jaccard 0.95).
- `p54` (violation) dismissed — `p51` is keyboard-reachable and produces the same effect (coverage Jaccard 0.95).

## Stage-4 dismissal as a function of the coverage-similarity threshold

| Jaccard threshold | TP | FP | FN | precision | recall | F1 |
|---|---|---|---|---|---|---|
| ≥ 0.5 | 23 | 1 | 3 | 95.8% | 88.5% | 92.0% |
| ≥ 0.8 | 23 | 1 | 3 | 95.8% | 88.5% | 92.0% |
| ≥ 0.95 | 23 | 1 | 3 | 95.8% | 88.5% | 92.0% |
| ≥ 1 | 26 | 1 | 0 | 96.3% | 100.0% | 98.1% |

Best on this corpus: Jaccard ≥ 1 (F1 98.1%).

## Coverage baselines (functions that run on any click on the page)

| page | baseline functions subtracted |
|---|---|
| a-vanilla.html | 0 |
| b-decoys.html | 0 |
| c-hover.html | 0 |
| d-delegation.html | 1 |
| e-nodom.html | 0 |
| f-occlusion.html | 0 |
| g-taborder.html | 0 |
| h-shadow.html | 0 |
| react/index.html | 28 |

## Where React 19 binds click handling

- Root container carries **139** listeners, of which **3** are `click` — the delegation the survey describes.
- But each element with an `onClick` prop also gets `element.onclick` assigned directly:

| probe | `el.onclick` is a function | has `onclick` attribute | React `onClick` prop |
|---|---|---|---|
| p50 | yes | no | yes |
| p51 | yes | no | yes |
| p52 | yes | no | yes |
| p53 | yes | no | yes |
| p54 | yes | no | yes |
| p55 | no | no | no |

- The `addEventListener` shim saw click registrations on these elements: DIV#root[], DIV#root[] — property assignment never calls `addEventListener`.

## Selector uniqueness in the shipped crawler

8 of 14 selectors emitted by `collectClickables` match more than one element (57%). The crawler clicks `.first()`, so each collision is a control it never reaches.

- `div.btnish → 4 matches`
- `div.btnish → 4 matches`
- `button.btn → 5 matches`
- `button.btn → 5 matches`
- `div.btnish → 4 matches`

## E4 — element addressing surfaces

- CDP `DOM.getDocument({pierce:true})` reached 60 of 60 probes.
- Needed the document-start `attachShadow` shim instead: none.

## Provenance available from the §3.5 shim

| probe | registering frame |
|---|---|
| p01 | `    at on (http://127.0.0.1:44901/a-vanilla.html:53:57) \|     at http://127.0.0.1:44901/a-vanilla.html:67:3` |
| p02 | `    at on (http://127.0.0.1:44901/a-vanilla.html:53:57) \|     at http://127.0.0.1:44901/a-vanilla.html:68:3` |
| p03 | `    at on (http://127.0.0.1:44901/a-vanilla.html:53:57) \|     at http://127.0.0.1:44901/a-vanilla.html:69:3` |
| p04 | `    at on (http://127.0.0.1:44901/a-vanilla.html:53:57) \|     at http://127.0.0.1:44901/a-vanilla.html:70:3` |
| p05 | `    at on (http://127.0.0.1:44901/a-vanilla.html:53:57) \|     at http://127.0.0.1:44901/a-vanilla.html:71:3` |
| p06 | `    at on (http://127.0.0.1:44901/a-vanilla.html:53:57) \|     at http://127.0.0.1:44901/a-vanilla.html:72:3` |
| p07 | `    at on (http://127.0.0.1:44901/a-vanilla.html:53:57) \|     at http://127.0.0.1:44901/a-vanilla.html:73:3` |
| p08 | `    at on (http://127.0.0.1:44901/a-vanilla.html:53:57) \|     at http://127.0.0.1:44901/a-vanilla.html:74:3` |

## axe-core detail

axe-core reported no violation on any labelled probe.