# Architecture

## Circuit document and editing

`CircuitDocument` contains named junctions, intrinsic terminal nodes, components, wire segments, annotations, layout metadata, reference, analysis settings, and source text. Every element owns permanent terminal nodes (`P`/`N`, and also `INP`/`INN` for op amps). Their coordinates are derived from their owner's position and rotation on each parse and during drag previews; users cannot detach them or move them independently. Labels and references retain stable IDs through layout changes.

The parser produces either a validated document plus warnings or line-specific errors. The last valid document remains visible when the current text is invalid. Visual actions patch only the affected source declarations, retaining comments and unrelated formatting, then reparse. This keeps one electrical representation rather than two divergent editors. Undo/redo stores bounded text snapshots, grouping adjacent typing changes.

ELK layout is loaded on demand. For placement it maps attached terminals to their owning component vertices, rather than treating them as independent junctions. After placement, three coordinate-descent passes use the actual terminal positions to choose among quarter-turn orientations that face connected terminals toward their neighbors. Rotation never swaps terminal identities or current polarity. The renderer chooses orthogonal routes with outward terminal stubs and penalties for symbol-body intersections, wire crossings, and overlap. This is a heuristic, not a guarantee of crossing-free layout.

New declarations can omit the terminal tuple: `resistor R1 resistance=1kOhm` creates `R1.P` and `R1.N` without standalone junction declarations. The older `(a,b)` syntax remains supported: `bindings` records those declarations, while `nodes` holds the intrinsic terminal IDs and implicit leads connect each binding to its physical terminal. Both forms feed the same solver. Terminal labels may be declared with `node R1.P label="Input"`; terminal `at=` overrides are rejected.

The visual canvas has a resizable height and an expanded mode. Inspector headers/actions are separate from the scrolling content; their maximum height is bounded by the actual remaining canvas height. Touch scrolling is enabled on popup contents, and wheel events there do not zoom the canvas. Right-click dispatch uses the SVG object's selection identity and opens the same inspector. Theme colors use shared dark-mode tokens with existing light-color fallbacks; the choice is stored separately from project contents.

## Unified pointer interaction

The toolbar has Select (`1`) and Pan (`2`). Select dispatches a pointer gesture from its starting target: blank canvas draws a selection rectangle, a symbol moves, a node starts wiring, and a wire opens inspection. A small movement threshold distinguishes clicks from drags; double-click rotates symbols only in Select. Pan and middle-mouse dragging always move the camera regardless of the underlying object, preserving the selection. Input fields and open dialogs retain their ordinary keyboard behavior.

Bulk selection is an array of object identities, with an inspector only for a single selected object. `editor/selection.ts` selects fully enclosed symbols, standalone junctions, and routed wires in world coordinates; attached terminals and implicit leads highlight with their parent element. Shift extends a box selection or toggles an object, and Ctrl/⌘+A selects all outside text fields. Group movement applies a shared snapped delta to symbols and standalone nodes, preserving relative positions and electrical connectivity. Batch movement and deletion each commit one source revision so undo restores the complete group.

Pointer capture keeps drags reliable outside a target's SVG bounds. Drop hit testing projects onto actual routed wire segments and gives existing node hits priority, so a near-endpoint drop reuses the node instead of inserting a coincident junction. A release on empty canvas latches the wire preview; a later empty-space click commits a junction and segment and continues from the new node. Escape, pointer cancellation, and tool changes discard only the unfinished preview.

`language/connections.ts` builds each waypoint or wire tap as one validated source edit. An explicit wire tap retains the original wire ID/label on its first half, adds the second half, and adds the incoming branch. Tapping an implicit lead instead rebinds its component through the new junction and preserves the original junction connection with an explicit segment. Undo therefore never leaves half a split or an orphan waypoint. Automatic fitting does not respond to junction insertion, so the camera stays fixed while drawing.

## Solver

Explicit wires are unioned into electrical nets. The selected reference net's potential is omitted from the unknown vector. Other unknowns are net voltages and one output-branch current per component. Equations consist of Kirchhoff current balances and device constitutive relations; the additional current unknowns make dependent current controls and ideal op-amp outputs straightforward.

Row-scaled Gauss-Jordan elimination produces a particular solution and implicit free-variable dependencies. A measurement is returned only if its linear combination is independent of the free variables. This permits a floating resistor's voltage difference/current to be known even when neither absolute node potential is known. Inconsistent equations and large normalized residuals become errors. Individual indeterminate node voltages or currents become warnings.

DC capacitors impose zero current; inductors impose zero voltage. Explicit transient initialization instead imposes capacitor initial voltage and inductor initial current. Subsequent steps use backward-Euler companion equations:

```text
capacitor: i[n] = C / dt × (v[n] − v[n−1])
inductor:  v[n] = L / dt × (i[n] − i[n−1])
```

Wire currents are reconstructed per merged net by solving the original junction/segment incidence equations with component terminal currents as injections. Free circulations in ideal wire loops remain indeterminate. If a net's terminal injection is indeterminate, wire reconstruction conservatively marks its segments indeterminate as well; it does not guess correlations between those unknown currents.

The solver uses a dense matrix for educational-sized circuits. Limits prevent unbounded documents and time grids. It is not a replacement for a production SPICE simulator; sparse factorization, adaptive steps, nonlinear iteration, and AC analysis are future extensions.

## Worker and results

`SimulationRequest` carries a document and numeric revision. `WorkerResponse` reports progress or a `SimulationResult` containing samples indexed by stable IDs. Each sample includes node voltages, element voltage differences, element currents, signed powers, reconstructed wire currents, time, and residual.

Source changes terminate the active worker and make previous results stale. A request counter rejects late messages; a matching source snapshot guards display validity. This conservatively invalidates results for layout and annotation changes too. Stop terminates the worker; the UI remains responsive while numerical work runs.

Transient results retain at most approximately 2,001 display frames by decimation, including the final frame, while integrating every requested step. Measurements and plots share one selected sample; clicking a popup measurement changes the waveform probe.

## Persistence and extension points

Projects serialize as `{ format: "circuit-studio", version: 1, source: "..." }`. Source text includes all layout, annotations, and analysis settings. Import validates the version and parses the source before replacing the current project; local autosave also preserves incomplete text so work is not lost. No migration is needed for v1. Unsupported future versions fail explicitly.

Add a component by extending the component-kind union, metadata, parser parameter validation, SVG symbol, and equation contribution, then add analytical tests. A future solver backend can consume the existing document and emit the same result interface without changing the editor. Keep transient initial-condition and sign semantics consistent across backends.
