# Repository Guidelines

## Project Structure & Module Organization

This circuit-simulator workspace currently contains no source files, tests, assets, or build configuration. Use the following proposed layout when adding the initial implementation:

- `src/`: circuit models, simulation logic, and application code; keep numerical logic separate from presentation code.
- `tests/`: automated tests and small circuit fixtures.
- `assets/`: static images and other application resources, if needed.
- `docs/`: architecture notes, circuit examples, and numerical assumptions.

Keep build configuration at the repository root and document the actual layout in `README.md` as it develops.

## Build, Test, and Development Commands

No build, test, or local development commands are configured yet. When introducing the toolchain, add reproducible commands for dependency installation, local execution, production builds, and tests. Record exact commands and required runtime versions in `README.md`; ensure each command works from the repository root. Do not document commands such as `npm test` or `make build` until their configuration exists.

## Coding Style & Naming Conventions

Use descriptive names that distinguish electrical quantities and units, such as `voltage_volts` or the equivalent language convention. Use spaces for indentation, two spaces for JSON/YAML, and the selected language's formatter for source code. Introduce formatter and linter configuration with the first implementation. Keep modules focused and explain numerical approximations in comments.

## Testing Guidelines

No test framework or coverage threshold is established. Select a framework alongside the implementation and document test discovery conventions. Cover circuit validation, solver convergence, invalid inputs, and known analytical results. Compare floating-point results using explicit tolerances. Include regression tests for simulation defects and run the relevant suite before submitting changes.

## Commit & Pull Request Guidelines

Git history is unavailable, so no existing commit convention can be inferred. Use short, imperative subjects, for example `Add resistor network validation`. Keep commits focused. Pull requests should describe the problem, resulting behavior, and validation performed; link related issues and include screenshots for visual changes. Call out changes to numerical methods, dependencies, or setup requirements.
