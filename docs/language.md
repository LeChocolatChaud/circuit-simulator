# Circuit description language (CDL v1)

Declarations occupy one line each. Blank lines and `#` or `//` comments are accepted; comment characters inside quoted strings remain text. Identifiers match `[A-Za-z_][A-Za-z0-9_]*`, are case sensitive, and are unique across nodes, components, and wires. Declare every referenced node explicitly; an unused node or dangling terminal is permitted.

## Quantities and units

Numbers accept signs, decimals, scientific notation, and SI prefixes `p`, `n`, `u`/`µ`, `m`, `k`, `M`, `G`. Units are `V`, `A`, `Ohm`/`Ω`, `F`, `H`, `s`, `Hz`, `S`. Bare numbers use the relevant SI base unit. Units, when present, must match the parameter. Thus `1kOhm` and `1000` are equivalent resistances; `1kA` is rejected for a resistance. Lowercase `m` and uppercase `M` differ by a factor of a billion.

## Project, nodes, and wires

```text
circuit "Filter experiment"
node gnd label="Ground" at=(100,350)
node input at=(100,100)
node output at=(400,100)
reference gnd
wire W1 input output label="Signal connection"
```

`reference` chooses the zero-voltage node. If omitted, `gnd` or the first node is used with a warning. A wire is an ideal connection between two named junctions; it merges their electrical potential while retaining the segment for current inspection. Its positive current direction is `input → output` in the example. Drawing crossings do not create electrical connections.

Two or more components attached to the same named node are connected, even without explicit wires. Each automatically drawn terminal lead has the component's terminal current. Its ID is `component.port`, with zero-based ports; positive lead current points from the junction into the component. For example, `R1.0` is the current into the positive terminal of R1, and `R1.1` is its negative.

## Components

| Declaration                            | Required model parameters                           |
| -------------------------------------- | --------------------------------------------------- |
| `resistor R1 (a,b) resistance=1kOhm`   | Positive resistance                                 |
| `capacitor C1 (a,b) capacitance=10uF`  | Positive capacitance; optional `initial_voltage=0V` |
| `inductor L1 (a,b) inductance=1H`      | Positive inductance; optional `initial_current=0A`  |
| `voltage_source V1 (a,b) dc=5V`        | Optional `dc` (defaults to zero), waveform settings |
| `current_source I1 (a,b) dc=1mA`       | Optional `dc` (defaults to zero), waveform settings |
| `vcvs E1 (a,b) control=(c,d) gain=2`   | `V(a,b) = gain × V(c,d)`                            |
| `vccs G1 (a,b) control=(c,d) gain=1mS` | `I(a→b) = gain × V(c,d)`                            |
| `ccvs H1 (a,b) control=V1 gain=1kOhm`  | `V(a,b) = gain × I(V1)`                             |
| `cccs F1 (a,b) control=V1 gain=2`      | `I(a→b) = gain × I(V1)`                             |
| `opamp U1 (plus,minus,out,return)`     | Ideal, zero input currents; `V(plus) = V(minus)`    |

All components accept `label="Display name"`, `at=(x,y)`, and `rotate=90` (any multiple of 90 degrees). Layout metadata has no electrical effect. Use the toolbar's **Arrange** action for automatic layout. The named current controlling a CCVS/CCCS is the component's current in its declared orientation; no extra current-sense component is required.

Op-amp current and power refer to the `out → return` port. Supply current is outside the ideal model. An op amp without suitable feedback may have an indeterminate output or contradict the equal-input-voltage constraint; the app reports the actual linear-system outcome.

## Independent source waveforms

```text
voltage_source V1 (input,gnd) dc=0V wave=step amplitude=5V offset=0V delay=1ms
current_source I1 (input,gnd) dc=0A wave=pulse amplitude=2mA width=1ms period=4ms
voltage_source V2 (output,gnd) dc=0V wave=sine amplitude=1V offset=2V frequency=50Hz
```

`wave` defaults to `dc`. Before `delay` (default zero), a time-varying source produces `offset` (default zero). After the delay:

- `step`: `offset + amplitude`.
- `pulse`: `offset + amplitude` during each pulse width, otherwise `offset`.
- `sine`: `offset + amplitude × sin(2π × frequency × (time − delay))`.

Amplitude defaults to the declared `dc` value, or one base unit if `dc` is absent. Frequency defaults to 50 Hz, width to 5 ms, and period to 10 ms. Timings must be positive, delay nonnegative, and width no longer than period. The edges are ideal; the fixed integration grid samples them without adaptive event alignment. Choose a timestep small enough to resolve them.

## Analyses and initialization

```text
analysis dc
analysis transient stop=100ms step=100us initialization=explicit
```

Use only one analysis declaration. DC is the default. Transient defaults are 100 ms stop, 100 µs step, and `initialization=dc`. Require `0 < step ≤ stop`, with at most 20,000 integration steps. A shorter final step reaches the exact stop time.

- `dc`: compute the operating point with sources at their `dc` values; initialize capacitor voltages and inductor currents from that solution. The first transient frame represents this operating point, even if a waveform switches at time zero.
- `explicit`: constrain capacitor voltage and inductor current to their declared initial values (default zero), with sources evaluated at time zero. Conflicting constraints are errors; no impulse is invented to reconcile them.

## Labels and inspection

```text
label voltage(output) "Vout"
label current(R1) "Load current"
label current(W1) "Return current"
label current(R1.0) "Input lead"
```

Measurement labels are optional and unique per quantity/target. They display the chosen simulation frame beside their target. Names and labels are separate: changing a label does not rename or reconnect an identifier. For two-terminal elements, voltage is `V(a) − V(b)`, current is `a → b`, and power is `voltage × current`. Positive power is absorbed; negative is delivered. Floating/underdetermined measurements show `Indeterminate`, never a fabricated zero.
