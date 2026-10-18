import {
  outputNodes,
  terminalCurrent,
  type CircuitDocument,
  type Component,
  type Diagnostic,
  type Sample,
  type SimulationResult,
} from '../model/types';
import { solveLinear } from './matrix';

export function sourceValue(c: Component, time: number, dc = false): number {
  const w = c.waveform;
  if (dc || w.kind === 'dc') return w.dc;
  if (time < w.delay) return w.offset;
  const t = time - w.delay;
  if (w.kind === 'step') return w.offset + w.amplitude;
  if (w.kind === 'sine')
    return w.offset + w.amplitude * Math.sin(2 * Math.PI * w.frequency * t);
  // A small relative tolerance avoids a floating point remainder shifting pulse edges by a step.
  const phase = (t + 1e-12 * w.period) % w.period;
  return w.offset + (phase < w.width ? w.amplitude : 0);
}

export function connectivity(doc: CircuitDocument) {
  const parents = new Map(doc.nodes.map((n) => [n.id, n.id]));
  const root = (id: string): string => {
    const parent = parents.get(id)!;
    if (parent === id) return id;
    const result = root(parent);
    parents.set(id, result);
    return result;
  };
  doc.wires.forEach((w) => {
    parents.set(root(w.from), root(w.to));
  });
  const roots = [...new Set(doc.nodes.map((n) => root(n.id)))];
  return { root, roots, reference: doc.reference ? root(doc.reference) : '' };
}

function inferWireCurrents(
  doc: CircuitDocument,
  currents: Record<string, number | null>,
  net: ReturnType<typeof connectivity>,
): Record<string, number | null> {
  const values: Record<string, number | null> = Object.create(null);
  for (const group of net.roots) {
    const wires = doc.wires.filter((w) => net.root(w.from) === group);
    if (!wires.length) continue;
    const nodes = doc.nodes.filter((n) => net.root(n.id) === group);
    const injection = new Map<string, number | null>(
      nodes.map((n) => [n.id, 0]),
    );
    doc.components.forEach((c) =>
      c.nodes.forEach((node, port) => {
        if (!injection.has(node)) return;
        const value = terminalCurrent(c, port, currents[c.id]);
        const previous = injection.get(node)!;
        injection.set(
          node,
          value === null || previous === null ? null : previous + value,
        );
      }),
    );
    if ([...injection.values()].some((i) => i === null)) {
      wires.forEach((w) => {
        values[w.id] = null;
      });
      continue;
    }
    const matrix = nodes.map((n) =>
      wires.map((w) => (w.from === n.id ? 1 : 0) - (w.to === n.id ? 1 : 0)),
    );
    const result = solveLinear(
      matrix,
      nodes.map((n) => -injection.get(n.id)!),
      wires.length,
    );
    wires.forEach((w, index) => {
      values[w.id] = result.inconsistent
        ? null
        : result.evaluate(wires.map((_, i) => (i === index ? 1 : 0)));
    });
  }
  return values;
}

type State = Record<string, { voltage: number | null; current: number | null }>;
type StepMode = 'dc' | 'initial' | 'transient';
function solveStep(
  doc: CircuitDocument,
  mode: StepMode,
  time: number,
  dt: number,
  previous: State,
) {
  const net = connectivity(doc);
  const unknownNodes = net.roots.filter((id) => id !== net.reference);
  const nodeIndexes = new Map(unknownNodes.map((id, i) => [id, i]));
  const componentIndexes = new Map(
    doc.components.map((c, i) => [c.id, unknownNodes.length + i]),
  );
  const size = unknownNodes.length + doc.components.length;
  const matrix = Array.from({ length: size }, () =>
    new Array<number>(size).fill(0),
  );
  const rhs = new Array<number>(size).fill(0);
  const voltage = (
    row: number[],
    positive: string,
    negative: string,
    coefficient = 1,
  ) => {
    const p = nodeIndexes.get(net.root(positive));
    const n = nodeIndexes.get(net.root(negative));
    if (p !== undefined) row[p] += coefficient;
    if (n !== undefined) row[n] -= coefficient;
  };
  const voltageVector = (p: string, n: string) => {
    const row = new Array<number>(size).fill(0);
    voltage(row, p, n);
    return row;
  };
  for (const c of doc.components) {
    const index = componentIndexes.get(c.id)!;
    const [positive, negative] = outputNodes(c);
    const p = nodeIndexes.get(net.root(positive));
    const n = nodeIndexes.get(net.root(negative));
    if (p !== undefined) matrix[p][index] += 1;
    if (n !== undefined) matrix[n][index] -= 1;
    const row = matrix[index];
    switch (c.kind) {
      case 'resistor':
        voltage(row, positive, negative);
        row[index] = -c.value;
        break;
      case 'voltage_source':
        voltage(row, positive, negative);
        rhs[index] = sourceValue(c, time, mode === 'dc');
        break;
      case 'current_source':
        row[index] = 1;
        rhs[index] = sourceValue(c, time, mode === 'dc');
        break;
      case 'capacitor':
        if (mode === 'dc') row[index] = 1;
        else if (mode === 'initial') {
          voltage(row, positive, negative);
          rhs[index] = c.initial;
        } else {
          const old = previous[c.id]?.voltage;
          if (old === null || old === undefined)
            throw new Error(
              `Cannot advance ${c.id}: its initial capacitor voltage is indeterminate.`,
            );
          voltage(row, positive, negative, c.value / dt);
          row[index] = -1;
          rhs[index] = (c.value / dt) * old;
        }
        break;
      case 'inductor':
        if (mode === 'dc') voltage(row, positive, negative);
        else if (mode === 'initial') {
          row[index] = 1;
          rhs[index] = c.initial;
        } else {
          const old = previous[c.id]?.current;
          if (old === null || old === undefined)
            throw new Error(
              `Cannot advance ${c.id}: its initial inductor current is indeterminate.`,
            );
          voltage(row, positive, negative);
          row[index] = -c.value / dt;
          rhs[index] = (-c.value / dt) * old;
        }
        break;
      case 'vcvs':
      case 'vccs': {
        const control = c.control as [string, string];
        if (c.kind === 'vcvs') voltage(row, positive, negative);
        else row[index] = 1;
        voltage(row, control[0], control[1], -c.value);
        break;
      }
      case 'ccvs':
      case 'cccs':
        if (c.kind === 'ccvs') voltage(row, positive, negative);
        else row[index] = 1;
        row[componentIndexes.get(c.control as string)!] -= c.value;
        break;
      case 'opamp':
        voltage(row, c.nodes[0], c.nodes[1]);
        break;
    }
  }
  const solution = solveLinear(matrix, rhs, size);
  if (solution.inconsistent)
    throw new Error(
      mode === 'initial'
        ? 'Initial conditions contradict circuit constraints. Check capacitor voltages, inductor currents, and ideal sources.'
        : `No consistent finite solution at ${time.toPrecision(4)} s. Check ideal-source conflicts, open current sources, and op-amp feedback.`,
    );
  const voltages: Sample['voltages'] = Object.create(null);
  const elementVoltages: Sample['elementVoltages'] = Object.create(null);
  const currents: Sample['currents'] = Object.create(null);
  const powers: Sample['powers'] = Object.create(null);
  const state: State = Object.create(null);
  for (const node of doc.nodes)
    voltages[node.id] = solution.evaluate(
      voltageVector(node.id, doc.reference),
    );
  for (const c of doc.components) {
    const [p, n] = outputNodes(c);
    const voltageValue = solution.evaluate(voltageVector(p, n));
    elementVoltages[c.id] = voltageValue;
    const currentVector = new Array<number>(size).fill(0);
    currentVector[componentIndexes.get(c.id)!] = 1;
    const current = solution.evaluate(currentVector);
    currents[c.id] = current;
    state[c.id] = { voltage: voltageValue, current };
    powers[c.id] =
      current === 0 || voltageValue === 0
        ? 0
        : current === null || voltageValue === null
          ? null
          : voltageValue * current;
  }
  const sample: Sample = {
    time,
    voltages,
    elementVoltages,
    currents,
    powers,
    wireCurrents: inferWireCurrents(doc, currents, net),
    residual: solution.residual,
  };
  return { sample, state };
}

export function simulate(
  doc: CircuitDocument,
  revision = 0,
  onProgress?: (progress: number) => void,
): SimulationResult {
  const result: SimulationResult = {
    revision,
    mode: doc.analysis.mode,
    samples: [],
    diagnostics: [],
  };
  if (!doc.components.length) {
    result.diagnostics.push({
      severity: 'warning',
      message: 'Add a component to simulate this circuit.',
    });
    return result;
  }
  try {
    const transient = doc.analysis.mode === 'transient';
    const count = transient
      ? Math.ceil(doc.analysis.stop / doc.analysis.step - 1e-10)
      : 0;
    const stride = Math.max(1, Math.ceil(count / 2000));
    let { sample, state } = solveStep(
      doc,
      transient && doc.analysis.initialization === 'explicit'
        ? 'initial'
        : 'dc',
      0,
      0,
      {},
    );
    result.samples.push(sample);
    const warnings = new Map<string, Diagnostic>();
    const check = (s: Sample) => {
      const floating = Object.entries(s.voltages)
        .filter(([, v]) => v === null)
        .map(([id]) => id);
      if (floating.length)
        warnings.set('floating', {
          severity: 'warning',
          message: `Indeterminate node voltage: ${floating.join(', ')}. Check connectivity, reference, and circuit constraints.`,
        });
      const ambiguous = Object.entries({ ...s.currents, ...s.wireCurrents })
        .filter(([, i]) => i === null)
        .map(([id]) => id);
      if (ambiguous.length)
        warnings.set('current', {
          severity: 'warning',
          message: `Indeterminate current: ${ambiguous.join(', ')}. Ideal parallel paths may not define a unique current split.`,
        });
    };
    check(sample);
    for (let step = 1; step <= count; step++) {
      const time = Math.min(step * doc.analysis.step, doc.analysis.stop);
      const dt = time - sample.time;
      ({ sample, state } = solveStep(doc, 'transient', time, dt, state));
      check(sample);
      if (step % stride === 0 || step === count) result.samples.push(sample);
      if (step % Math.max(1, Math.floor(count / 50)) === 0)
        onProgress?.(step / count);
    }
    if (stride > 1)
      warnings.set('sampling', {
        severity: 'warning',
        message: `Integrated ${count} steps; displaying ${result.samples.length} sampled frames.`,
      });
    result.diagnostics.push(...warnings.values());
  } catch (error) {
    result.diagnostics.push({
      severity: 'error',
      message: (error as Error).message,
    });
    result.samples = [];
  }
  return result;
}
