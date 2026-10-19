# Circuit description language

Declarations occupy one line each. Blank lines and `#` or `//` comments are accepted; comment characters inside quoted strings remain text. Element, wire, and standalone junction identifiers match `[A-Za-z_][A-Za-z0-9_]*` and are case sensitive.

## Attached terminal nodes

Every element automatically creates **permanently attached `Element.P` and `Element.N` nodes**. They are physical endpoints: they move and rotate with their element and cannot be dragged independently. Op amps also have `Element.INP` and `Element.INN` input nodes; P/N are their output/return nodes. Terminal IDs remain stable through rotation, so rotating a symbol does not reverse its electrical polarity.

```text
circuit "RC filter"
voltage_source V1 dc=5V at=(190,310) rotate=90
resistor R1 resistance=1kOhm at=(395,165)
capacitor C1 capacitance=10uF initial_voltage=0V at=(600,310) rotate=90
wire W1 V1.P R1.P
wire W2 R1.N C1.P
wire W3 C1.N V1.N
reference V1.N
node C1.P label="Output"
label voltage(C1.P) "Vout"
analysis transient stop=50ms step=100us initialization=explicit
```

Attached terminals do not need separate node declarations. `node C1.P label="Output"` changes a terminal label. Setting `at=` on a terminal node is rejected: set the owner element's `at=` instead. Use `node bus at=(x,y)` when an extra standalone junction is useful.

A wire connects any two terminals or standalone junctions. It merges their electrical potential while retaining the segment for current inspection. W1's positive current direction above is `V1.P → R1.P`. Crossings do not create electrical connections. Open terminals and unused standalone nodes are valid.

In Select (`1`), drag from one node to another to create a wire. Releasing over empty canvas keeps drawing active: each following empty-space click adds a `node n... at=(x,y)` declaration and an incoming wire, then continues from that junction. Dropping or clicking onto a wire splits that wire at the projected hit point and attaches the incoming branch. The original ID and label stay on the first half; the continuation and new branch receive fresh wire IDs. Each intermediate junction or split is one undoable edit. Pan (`2`) moves the view from any target; double-clicking a symbol in Select rotates it.

`reference` selects the zero-voltage node, including an attached terminal such as `V1.N`. If omitted, `gnd` or the first node is used with a warning. An island without a defined reference can have indeterminate absolute voltages even when some element voltage differences or currents are known.

## Quantities and units

Numbers accept signs, decimals, scientific notation, and SI prefixes `p`, `n`, `u`/`µ`, `m`, `k`, `M`, `G`. Units are `V`, `A`, `Ohm`/`Ω`, `F`, `H`, `s`, `Hz`, `S`. Bare numbers use the relevant SI base unit. Explicit units must match the parameter: `1kOhm` and `1000` are equivalent resistances; `1kA` is rejected. Lowercase `m` and uppercase `M` differ by a factor of a billion.

## Components

| Declaration                            | Model                                               |
| -------------------------------------- | --------------------------------------------------- |
| `resistor R1 resistance=1kOhm`         | Positive resistance                                 |
| `capacitor C1 capacitance=10uF`        | Positive capacitance; optional `initial_voltage=0V` |
| `inductor L1 inductance=1H`            | Positive inductance; optional `initial_current=0A`  |
| `voltage_source V1 dc=5V`              | `V(P) − V(N) = source value`                        |
| `current_source I1 dc=1mA`             | Positive current flows P → N                        |
| `vcvs E1 control=(V1.P,V1.N) gain=2`   | `V(P,N) = gain × control voltage`                   |
| `vccs G1 control=(V1.P,V1.N) gain=1mS` | `I(P→N) = gain × control voltage`                   |
| `ccvs H1 control=V1 gain=1kOhm`        | `V(P,N) = gain × I(V1)`                             |
| `cccs F1 control=V1 gain=2`            | `I(P→N) = gain × I(V1)`                             |
| `opamp U1`                             | Zero input currents; `V(INP) = V(INN)`              |

All elements accept `label="Display name"`, `at=(x,y)`, and `rotate=90` (any multiple of 90 degrees). Layout metadata has no electrical effect. **Arrange** can change both position and rotation, choosing orientations that face connected terminals toward each other; it does not swap terminal identities. Wires are routed around symbol bodies where possible.

CCVS/CCCS controls use a component's oriented current; no extra current-sense element is required. Op-amp current and power refer to P → N. Supply consumption is outside the ideal model. An op amp without suitable feedback may have an indeterminate output or contradict its equal-input constraint; the app reports the resulting linear-system outcome.

### Explicit junction bindings

The older syntax `resistor R1 (input,output) resistance=1kOhm` remains supported. Declare `node input` and `node output`, or bind to another element's terminal. This creates implicit leads from those junctions to R1's permanent P/N nodes. Two elements bound to the same named junction are connected. Lead IDs use zero-based ports (`R1.0`, `R1.1`); positive lead current flows from the bound junction into the component. New visual elements omit the tuple and connect directly through their attached terminals.

## Independent source waveforms

```text
voltage_source V1 dc=0V wave=step amplitude=5V offset=0V delay=1ms
current_source I1 dc=0A wave=pulse amplitude=2mA width=1ms period=4ms
voltage_source V2 dc=0V wave=sine amplitude=1V offset=2V frequency=50Hz
```

`wave` defaults to `dc`. Before `delay` (default zero), a time-varying source produces `offset` (default zero). After the delay:

- `step`: `offset + amplitude`.
- `pulse`: `offset + amplitude` during each pulse width, otherwise `offset`.
- `sine`: `offset + amplitude × sin(2π × frequency × (time − delay))`.

Amplitude defaults to the declared `dc` value, or one base unit if `dc` is absent. Frequency defaults to 50 Hz, width to 5 ms, and period to 10 ms. Timing values must be positive, delay nonnegative, and width no longer than period. Ideal edges are sampled on the fixed integration grid; choose a timestep small enough to resolve them.

## Analyses and initialization

Use one analysis declaration: `analysis dc` or `analysis transient stop=100ms step=100us initialization=explicit`. DC is the default. Transient defaults are 100 ms stop, 100 µs step, and `initialization=dc`. Require `0 < step ≤ stop`, with at most 20,000 steps. A shorter final step reaches the exact stop time.

- `dc`: compute the operating point at the sources' `dc` values and initialize energy-storage states from it. The first frame represents that point, even if a waveform switches at time zero.
- `explicit`: constrain capacitor voltage and inductor current to their declared initial values (default zero), with sources evaluated at time zero. Conflicting constraints are errors; no impulse is invented to reconcile them.

## Labels and inspection

```text
label voltage(R1.P) "Input voltage"
label current(R1) "Load current"
label current(W1) "Return current"
label current(R1.P) "Positive terminal current"
```

Measurement labels are unique per quantity/target and show the selected simulation frame beside their target. `current(R1.N)` is current entering the negative terminal, the negative of `current(R1)`; op-amp INP/INN currents are zero. Numeric lead aliases such as `current(R1.0)` remain accepted. Names and labels are separate: changing a label does not reconnect an identifier.

For two-terminal elements, voltage is `V(P) − V(N)`, current is P → N, and power is voltage × current. Positive power is absorbed; negative is delivered. Floating/underdetermined measurements show `Indeterminate`, never a fabricated zero. Right-click a symbol, terminal, or wire for its inspector, or focus it and press Enter; click a measurement to plot it. Left-click selects without opening a popup. Rotate controls remain at the top, and long inspector contents scroll independently from the canvas.
