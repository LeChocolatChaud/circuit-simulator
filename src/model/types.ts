export type Point = { x: number; y: number };
export type ComponentKind =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'voltage_source'
  | 'current_source'
  | 'vcvs'
  | 'vccs'
  | 'ccvs'
  | 'cccs'
  | 'opamp';
export type Waveform = {
  kind: 'dc' | 'step' | 'pulse' | 'sine';
  dc: number;
  amplitude: number;
  offset: number;
  frequency: number;
  delay: number;
  width: number;
  period: number;
};
export interface CircuitNode {
  id: string;
  label: string;
  position: Point;
  line: number;
  placed: boolean;
  terminal?: { component: string; port: number };
}
export interface Component {
  id: string;
  kind: ComponentKind;
  nodes: string[];
  /** Declared junction bindings; nodes contains the attached terminal node IDs. */
  bindings: string[];
  value: number;
  label: string;
  position: Point;
  rotation: number;
  line: number;
  placed: boolean;
  control?: string | [string, string];
  initial: number;
  waveform: Waveform;
}
export interface Wire {
  id: string;
  from: string;
  to: string;
  label: string;
  line: number;
  implicit?: boolean;
}
export interface Annotation {
  quantity: 'voltage' | 'current';
  target: string;
  text: string;
  line: number;
}
export interface AnalysisSettings {
  mode: 'dc' | 'transient';
  stop: number;
  step: number;
  initialization: 'dc' | 'explicit';
}
export interface CircuitDocument {
  name: string;
  nodes: CircuitNode[];
  components: Component[];
  wires: Wire[];
  annotations: Annotation[];
  reference: string;
  analysis: AnalysisSettings;
  source: string;
}
export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  line?: number;
}
export interface ParseResult {
  document?: CircuitDocument;
  diagnostics: Diagnostic[];
}
export type Measurement = number | null;
export interface Sample {
  time: number;
  voltages: Record<string, Measurement>;
  elementVoltages: Record<string, Measurement>;
  currents: Record<string, Measurement>;
  powers: Record<string, Measurement>;
  wireCurrents: Record<string, Measurement>;
  residual: number;
}
export interface SimulationResult {
  revision: number;
  mode: 'dc' | 'transient';
  samples: Sample[];
  diagnostics: Diagnostic[];
}
export interface SimulationRequest {
  revision: number;
  document: CircuitDocument;
}
export type WorkerResponse =
  | { type: 'result'; result: SimulationResult }
  | { type: 'progress'; revision: number; progress: number };
export type SelectionItem = {
  kind: 'node' | 'component' | 'wire' | 'lead';
  id: string;
};
export type Selection = SelectionItem | null;

export const componentInfo: Record<
  ComponentKind,
  {
    name: string;
    prefix: string;
    parameter: string;
    unit: string;
    defaultValue: string;
  }
> = {
  resistor: {
    name: 'Resistor',
    prefix: 'R',
    parameter: 'resistance',
    unit: 'Ω',
    defaultValue: '1kOhm',
  },
  capacitor: {
    name: 'Capacitor',
    prefix: 'C',
    parameter: 'capacitance',
    unit: 'F',
    defaultValue: '10uF',
  },
  inductor: {
    name: 'Inductor',
    prefix: 'L',
    parameter: 'inductance',
    unit: 'H',
    defaultValue: '10mH',
  },
  voltage_source: {
    name: 'Voltage source',
    prefix: 'V',
    parameter: 'dc',
    unit: 'V',
    defaultValue: '5V',
  },
  current_source: {
    name: 'Current source',
    prefix: 'I',
    parameter: 'dc',
    unit: 'A',
    defaultValue: '1mA',
  },
  vcvs: {
    name: 'Voltage-controlled V',
    prefix: 'E',
    parameter: 'gain',
    unit: '',
    defaultValue: '2',
  },
  vccs: {
    name: 'Voltage-controlled I',
    prefix: 'G',
    parameter: 'gain',
    unit: 'S',
    defaultValue: '1mS',
  },
  ccvs: {
    name: 'Current-controlled V',
    prefix: 'H',
    parameter: 'gain',
    unit: 'Ω',
    defaultValue: '1kOhm',
  },
  cccs: {
    name: 'Current-controlled I',
    prefix: 'F',
    parameter: 'gain',
    unit: '',
    defaultValue: '2',
  },
  opamp: {
    name: 'Ideal op amp',
    prefix: 'U',
    parameter: '',
    unit: '',
    defaultValue: '0',
  },
};

export function outputNodes(c: Component): [string, string] {
  return c.kind === 'opamp'
    ? [c.nodes[2], c.nodes[3]]
    : [c.nodes[0], c.nodes[1]];
}
export function terminalCurrent(
  c: Component,
  port: number,
  current: Measurement,
): Measurement {
  if (c.kind === 'opamp' && port < 2) return 0;
  return current === null ? null : current * (port % 2 === 0 ? 1 : -1);
}
export function terminalSuffixes(kind: ComponentKind): string[] {
  return kind === 'opamp' ? ['INP', 'INN', 'P', 'N'] : ['P', 'N'];
}
export function terminalId(
  c: Pick<Component, 'id' | 'kind'>,
  port: number,
): string {
  return `${c.id}.${terminalSuffixes(c.kind)[port]}`;
}
export function terminalPort(
  c: Pick<Component, 'kind'>,
  suffix: string,
): number {
  return /^\d$/.test(suffix)
    ? Number(suffix)
    : terminalSuffixes(c.kind).indexOf(suffix);
}
export function terminalPosition(
  c: Pick<Component, 'kind' | 'position' | 'rotation'>,
  port: number,
): Point {
  const local =
    c.kind === 'opamp'
      ? [
          { x: -48, y: -23 },
          { x: -48, y: 23 },
          { x: 48, y: 0 },
          { x: 0, y: 40 },
        ][port]
      : { x: port === 0 ? -48 : 48, y: 0 };
  const angle = (c.rotation * Math.PI) / 180;
  return {
    x:
      Math.round(
        (c.position.x + local.x * Math.cos(angle) - local.y * Math.sin(angle)) *
          1e6,
      ) / 1e6,
    y:
      Math.round(
        (c.position.y + local.x * Math.sin(angle) + local.y * Math.cos(angle)) *
          1e6,
      ) / 1e6,
  };
}
