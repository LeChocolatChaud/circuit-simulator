# Circuit Studio

A browser-based workbench for drawing, describing, and simulating ideal linear circuits. React and TypeScript render an SVG schematic; a Web Worker computes DC operating points and transient responses. No backend, account, external font, or API key is required.

## Run locally

Use Node.js **22.12 or later** and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Start with the voltage-divider example or choose an RC, RL, op-amp, dependent-source, or open-circuit example.

| Command             | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Start the development server                          |
| `npm run build`     | Type-check and build static assets into `dist/`       |
| `npm run preview`   | Serve the production build locally                    |
| `npm run typecheck` | Check TypeScript types                                |
| `npm run lint`      | Check code with ESLint                                |
| `npm run format`    | Format source, tests, and documentation with Prettier |
| `npm test`          | Run parser, storage, and numerical tests with Vitest  |
| `npm run test:e2e`  | Run browser workflows with Playwright                 |

For browser tests, first run `npx playwright install chromium`. To use an existing compatible Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Playwright starts and stops its own development server.

## Use the workbench

- Add components from the library. Each element has permanent **`Element.P` and `Element.N` nodes attached to its ends**. They follow the element when it moves or rotates; they cannot be moved independently. Op amps also have attached `INP` and `INN` inputs.
- **Select (`1`)** combines editing gestures: drag empty canvas to pan, drag a symbol to move it, and double-click a symbol to rotate it. Drag from a node to another node to connect them; a plain node click still opens its measurements.
- Release a wire over empty canvas to keep drawing. Each subsequent click on empty space creates a connected intermediate junction and starts the next segment from it. Click a node to finish, or press **Escape** to cancel the unfinished segment; completed segments remain.
- Drag or draw from a node onto an existing wire to insert a junction on that wire and connect the new branch. Both halves of the original wire remain connected. Crossings alone remain unconnected. Right-click empty canvas and choose **Add node here** for an independent junction.
- **Pan (`2`)** pans from anywhere, including over symbols and nodes, without editing them. Shortcuts are ignored while typing in form fields. Top rotation controls, scroll-to-zoom, **Fit circuit**, and **Arrange** remain available; Arrange can change positions and rotations.
- Right-click an element, terminal, or wire to open the website's inspector. Right-click empty canvas for canvas actions. Long popups scroll internally; their header and actions remain accessible. Enlarge the visual editor with **Expand editor**, or resize its bottom edge on desktop.
- Use the moon/sun button to choose dark or light mode. The app remembers this preference on your device and initially follows your system theme.
- Click a component for terminal voltage, signed current, and signed power. Click a node for voltage or to set the reference. Click a wire or terminal lead for branch current.
- Edit labels and values in the popup. Pin node-voltage or branch-current labels beside objects. Click a measurement to select it in the analysis panel.
- Choose **DC** or **Transient** and click **Run analysis**. In transient mode, set the timestep, stop time, and initialization mode. Move the time cursor or click the waveform to inspect that instant.
- Edit the adjacent circuit text directly. Syntax errors retain the last valid drawing and disable visual editing and simulation until fixed. Electrical edits mark old measurements stale until rerun.

Changes save automatically in this browser's local storage. Export a versioned `.circuit.json` file for a portable backup, or download `.cir` text. Import accepts either. Opening an example or creating a circuit can be undone. Browser storage is device/origin-specific and may be cleared by the browser; export important projects.

## Circuit language

```text
circuit "RC example"
voltage_source V1 dc=5V
resistor R1 resistance=1kOhm
capacitor C1 capacitance=10uF initial_voltage=0V
wire W1 V1.P R1.P
wire W2 R1.N C1.P
wire W3 C1.N V1.N
reference V1.N
node C1.P label="Output"

label voltage(C1.P) "Vout"
label current(R1) "Charge current"
analysis transient stop=50ms step=100us initialization=explicit
```

Use **Arrange** to lay out a circuit entered as text. See [the language reference](docs/language.md) for all elements, controls, source waveforms, labels, and layout metadata. This is a custom language borrowing SPICE concepts, not a SPICE-compatible netlist importer.

## Numerical model and limits

The solver uses modified nodal equations with an explicit current unknown for each component, row-scaled elimination, and free-variable tracking. It returns indeterminate measurements instead of silently adding ground paths. Capacitors are open in DC; inductors impose zero voltage. Transient analysis uses fixed-step backward Euler; reduce the timestep to check accuracy, particularly for oscillatory circuits.

Positive current flows from the first terminal to the second; positive power is absorbed and negative power is delivered. Ideal op amps have zero input current and equal input voltages where a finite solution exists. Their popup reports output-port power; supply consumption, saturation, bandwidth, and slew rate are not modeled.

Wire currents are reconstructed from junction-level Kirchhoff equations where unique. Ideal wire loops and identical parallel ideal sources can have indeterminate current splits. Floating node voltages can be indeterminate even when a component's voltage drop or current is known.

This first version supports up to 300 combined declared junctions/components (intrinsic terminal nodes are additional), 1,000 explicit wires, 500 KB circuit text, and 20,000 transient steps. Long runs retain approximately 2,001 display frames, including the final time. There are no AC sweeps, nonlinear semiconductor models, adaptive timesteps, cloud sync, or multi-user editing yet.

## Structure and validation

`src/model`, `src/language`, `src/editor`, `src/simulation`, `src/inspection`, and `src/storage` separate the circuit document, parser, schematic, numerical engine, measurement UI, and persistence. `tests/` contains analytical regression tests and `tests/e2e/` contains browser workflows. See [architecture notes](docs/architecture.md) for data flow and extension points.

Tests check reference invariance, source signs, Kirchhoff residuals, power balance, floating circuits, source conflicts, ideal op amps, analytical RC/RL responses, RLC convergence, text edits, import/export, and browser interactions. No coverage percentage is enforced; numerical behavior changes should include analytical or regression fixtures.

## References

The solver is implemented here; it is not a fork of ngspice or CircuitJS. The [ngspice manual](https://ngspice.sourceforge.io/docs.html) is a reference for conventional component and analysis concepts. [ELK.js](https://github.com/kieler/elkjs) provides automatic layout; [Lucide](https://lucide.dev/) supplies interface icons. Third-party packages retain their respective licenses.
