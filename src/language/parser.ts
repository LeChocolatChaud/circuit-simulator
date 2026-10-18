import {
  componentInfo,
  type AnalysisSettings,
  type CircuitDocument,
  type Component,
  type ComponentKind,
  type Diagnostic,
  type ParseResult,
  type Point,
} from '../model/types';

const identifier = '[A-Za-z_][A-Za-z0-9_]*';
const quote = '"(?:\\\\.|[^"\\\\])*"';
const prefixes: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
};
export function quantity(text: string, expectedUnit?: string): number {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(.*)$/i.exec(
    text,
  );
  if (!match)
    throw new Error(
      `Invalid quantity “${text}”. Use a number with an optional SI unit.`,
    );
  let suffix = match[2];
  let multiplier = 1;
  if (suffix[0] in prefixes) {
    multiplier = prefixes[suffix[0]];
    suffix = suffix.slice(1);
  }
  if (suffix === 'Ω') suffix = 'Ohm';
  const units = ['V', 'A', 'Ohm', 'F', 'H', 's', 'Hz', 'S'];
  if (suffix && !units.includes(suffix))
    throw new Error(
      `Unknown unit in “${text}”. SI prefixes are case sensitive (m ≠ M).`,
    );
  if (expectedUnit !== undefined && suffix && suffix !== expectedUnit)
    throw new Error(
      `Expected ${expectedUnit || 'a dimensionless number'}, received “${text}”.`,
    );
  const value = Number(match[1]) * multiplier;
  if (!Number.isFinite(value))
    throw new Error(`Quantity “${text}” must be finite.`);
  return value;
}

export function splitComment(line: string): [string, string] {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && quoted) {
      i++;
      continue;
    }
    if (line[i] === '"') quoted = !quoted;
    if (!quoted && (line[i] === '#' || line.slice(i, i + 2) === '//'))
      return [line.slice(0, i).trimEnd(), line.slice(i)];
  }
  return [line, ''];
}
function parameters(text: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  const pattern = /([a-z_]+)\s*=\s*("(?:\\.|[^"\\])*"|\([^)]*\)|[^\s]+)/gy;
  let index = 0;
  while (index < text.length) {
    if (/\s/.test(text[index])) {
      index++;
      continue;
    }
    pattern.lastIndex = index;
    const match = pattern.exec(text);
    if (!match)
      throw new Error(`Expected name=value near “${text.slice(index)}”.`);
    if (result[match[1]] !== undefined)
      throw new Error(`Duplicate parameter “${match[1]}”.`);
    result[match[1]] = match[2];
    index = pattern.lastIndex;
  }
  return result;
}
function allowed(params: Record<string, string>, keys: string[]) {
  for (const key of Object.keys(params))
    if (!keys.includes(key))
      throw new Error(
        `Unknown parameter “${key}”. Expected: ${keys.join(', ')}.`,
      );
}
function label(params: Record<string, string>, fallback: string): string {
  if (!params.label) return fallback;
  if (!params.label.startsWith('"'))
    throw new Error('Labels must be quoted strings.');
  return JSON.parse(params.label);
}
function position(text: string | undefined, fallback: Point): Point {
  if (!text) return fallback;
  const match = /^\(\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*\)$/.exec(text);
  if (!match) throw new Error('Position must be at=(x,y).');
  const point = { x: Number(match[1]), y: Number(match[2]) };
  if (Math.abs(point.x) > 100000 || Math.abs(point.y) > 100000)
    throw new Error('Layout coordinates must be within ±100000.');
  return point;
}
const valueUnits: Record<ComponentKind, string> = {
  resistor: 'Ohm',
  capacitor: 'F',
  inductor: 'H',
  voltage_source: 'V',
  current_source: 'A',
  vcvs: '',
  vccs: 'S',
  ccvs: 'Ohm',
  cccs: '',
  opamp: '',
};

export function parse(source: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const doc: CircuitDocument = {
    name: 'Untitled circuit',
    source,
    nodes: [],
    components: [],
    wires: [],
    annotations: [],
    reference: '',
    analysis: { mode: 'dc', stop: 0.1, step: 0.0001, initialization: 'dc' },
  };
  const ids = new Set<string>();
  const unique = (id: string) => {
    if (ids.has(id)) throw new Error(`Duplicate identifier “${id}”.`);
    ids.add(id);
  };
  let hasCircuit = false;
  let hasReference = false;
  let hasAnalysis = false;
  if (source.length > 500000)
    return {
      diagnostics: [
        {
          severity: 'error',
          message: 'Circuit text exceeds the 500 KB limit.',
        },
      ],
    };
  source.split('\n').forEach((raw, index) => {
    const line = index + 1;
    const text = splitComment(raw)[0].trim();
    if (!text) return;
    try {
      let match: RegExpExecArray | null;
      if ((match = new RegExp(`^circuit\\s+(${quote})$`).exec(text))) {
        if (hasCircuit)
          throw new Error('Only one circuit declaration is allowed.');
        doc.name = JSON.parse(match[1]);
        hasCircuit = true;
      } else if (
        (match = new RegExp(`^node\\s+(${identifier})(.*)$`).exec(text))
      ) {
        unique(match[1]);
        const p = parameters(match[2]);
        allowed(p, ['label', 'at']);
        doc.nodes.push({
          id: match[1],
          label: label(p, match[1]),
          position: position(p.at, {
            x: 160 + (doc.nodes.length % 4) * 170,
            y: 140 + Math.floor(doc.nodes.length / 4) * 180,
          }),
          line,
          placed: !!p.at,
        });
      } else if (
        (match = new RegExp(
          `^wire\\s+(${identifier})\\s+(${identifier})\\s+(${identifier})(.*)$`,
        ).exec(text))
      ) {
        unique(match[1]);
        const p = parameters(match[4]);
        allowed(p, ['label']);
        doc.wires.push({
          id: match[1],
          from: match[2],
          to: match[3],
          label: label(p, match[1]),
          line,
        });
      } else if (
        (match = new RegExp(`^reference\\s+(${identifier})$`).exec(text))
      ) {
        if (hasReference)
          throw new Error('Only one reference declaration is allowed.');
        doc.reference = match[1];
        hasReference = true;
      } else if (
        (match = new RegExp(
          `^label\\s+(voltage|current)\\((${identifier}(?:\\.[0-3])?)\\)\\s+(${quote})$`,
        ).exec(text))
      ) {
        if (
          doc.annotations.some(
            (a) => a.quantity === match![1] && a.target === match![2],
          )
        )
          throw new Error('Duplicate measurement label.');
        doc.annotations.push({
          quantity: match[1] as 'voltage' | 'current',
          target: match[2],
          text: JSON.parse(match[3]),
          line,
        });
      } else if ((match = /^analysis\s+(dc|transient)(.*)$/.exec(text))) {
        if (hasAnalysis)
          throw new Error('Only one analysis declaration is allowed.');
        hasAnalysis = true;
        const p = parameters(match[2]);
        allowed(p, ['stop', 'step', 'initialization']);
        doc.analysis = {
          mode: match[1] as AnalysisSettings['mode'],
          stop: quantity(p.stop ?? '100ms', 's'),
          step: quantity(p.step ?? '100us', 's'),
          initialization: (p.initialization ??
            'dc') as AnalysisSettings['initialization'],
        };
        if (!['dc', 'explicit'].includes(doc.analysis.initialization))
          throw new Error('Initialization must be dc or explicit.');
        if (
          doc.analysis.stop <= 0 ||
          doc.analysis.step <= 0 ||
          doc.analysis.step > doc.analysis.stop
        )
          throw new Error('Require 0 < step ≤ stop.');
        if (Math.ceil(doc.analysis.stop / doc.analysis.step) > 20000)
          throw new Error(
            'Limit transient analysis to 20,000 timesteps. Increase step or reduce stop.',
          );
      } else if (
        (match = new RegExp(
          `^(${Object.keys(componentInfo).join('|')})\\s+(${identifier})\\s*\\(([^)]*)\\)(.*)$`,
        ).exec(text))
      ) {
        const kind = match[1] as ComponentKind;
        const nodes = match[3].split(',').map((n) => n.trim());
        const required = kind === 'opamp' ? 4 : 2;
        if (
          nodes.length !== required ||
          nodes.some((n) => !new RegExp(`^${identifier}$`).test(n))
        )
          throw new Error(
            `${kind} requires ${required} named terminals${kind === 'opamp' ? ' (in_plus, in_minus, output, return)' : ' (positive, negative)'}.`,
          );
        unique(match[2]);
        const p = parameters(match[4]);
        const info = componentInfo[kind];
        const sourceKind =
          kind === 'voltage_source' || kind === 'current_source';
        allowed(p, [
          'label',
          'at',
          'rotate',
          ...(info.parameter ? [info.parameter] : []),
          ...(['vcvs', 'vccs', 'ccvs', 'cccs'].includes(kind)
            ? ['control']
            : []),
          ...(kind === 'capacitor' ? ['initial_voltage'] : []),
          ...(kind === 'inductor' ? ['initial_current'] : []),
          ...(sourceKind
            ? [
                'wave',
                'amplitude',
                'offset',
                'frequency',
                'delay',
                'width',
                'period',
              ]
            : []),
        ]);
        if (info.parameter && p[info.parameter] === undefined && !sourceKind)
          throw new Error(`Missing ${info.parameter}.`);
        const value = quantity(p[info.parameter] ?? '0', valueUnits[kind]);
        if (['resistor', 'capacitor', 'inductor'].includes(kind) && value <= 0)
          throw new Error(`${info.parameter} must be positive.`);
        const rotation = quantity(p.rotate ?? '0', '');
        if (rotation % 90 !== 0)
          throw new Error('Rotation must be a multiple of 90 degrees.');
        const component: Component = {
          id: match[2],
          kind,
          nodes,
          value,
          label: label(p, match[2]),
          line,
          rotation,
          placed: !!p.at,
          position: position(p.at, {
            x: 230 + (doc.components.length % 3) * 190,
            y: 220 + Math.floor(doc.components.length / 3) * 150,
          }),
          initial: quantity(
            p.initial_voltage ?? p.initial_current ?? '0',
            kind === 'capacitor' ? 'V' : 'A',
          ),
          waveform: {
            kind: (p.wave ?? 'dc') as Component['waveform']['kind'],
            dc: value,
            amplitude: quantity(p.amplitude ?? p.dc ?? '1', valueUnits[kind]),
            offset: quantity(p.offset ?? '0', valueUnits[kind]),
            frequency: quantity(p.frequency ?? '50Hz', 'Hz'),
            delay: quantity(p.delay ?? '0s', 's'),
            width: quantity(p.width ?? '5ms', 's'),
            period: quantity(p.period ?? '10ms', 's'),
          },
        };
        if (!['dc', 'step', 'pulse', 'sine'].includes(component.waveform.kind))
          throw new Error('Wave must be dc, step, pulse, or sine.');
        if (
          component.waveform.frequency <= 0 ||
          component.waveform.delay < 0 ||
          component.waveform.period <= 0 ||
          component.waveform.width <= 0 ||
          component.waveform.width > component.waveform.period
        )
          throw new Error(
            'Invalid source timing: frequency/period/width must be positive, width ≤ period, delay ≥ 0.',
          );
        if (kind === 'vcvs' || kind === 'vccs') {
          const control = new RegExp(
            `^\\(\\s*(${identifier}),\\s*(${identifier})\\s*\\)$`,
          ).exec(p.control ?? '');
          if (!control)
            throw new Error(
              'Voltage control must be control=(positive_node,negative_node).',
            );
          component.control = [control[1], control[2]];
        } else if (kind === 'ccvs' || kind === 'cccs') {
          if (!new RegExp(`^${identifier}$`).test(p.control ?? ''))
            throw new Error(
              'Current control must name a component, e.g. control=V1.',
            );
          component.control = p.control;
        }
        doc.components.push(component);
      } else
        throw new Error(
          'Unknown declaration. Use circuit, node, wire, reference, label, analysis, or a component type.',
        );
    } catch (error) {
      diagnostics.push({
        severity: 'error',
        line,
        message: (error as Error).message,
      });
    }
  });
  const nodes = new Set(doc.nodes.map((n) => n.id));
  const checkNode = (node: string, line?: number) => {
    if (!nodes.has(node))
      diagnostics.push({
        severity: 'error',
        line,
        message: `Node “${node}” is not declared. Add node ${node}.`,
      });
  };
  for (const c of doc.components) {
    c.nodes.forEach((n) => checkNode(n, c.line));
    if (Array.isArray(c.control))
      c.control.forEach((n) => checkNode(n, c.line));
    else if (
      c.control &&
      !doc.components.some((other) => other.id === c.control)
    )
      diagnostics.push({
        severity: 'error',
        line: c.line,
        message: `Controlling component “${c.control}” does not exist.`,
      });
  }
  doc.wires.forEach((w) => {
    checkNode(w.from, w.line);
    checkNode(w.to, w.line);
  });
  if (doc.reference) checkNode(doc.reference);
  else if (doc.nodes.length) {
    doc.reference =
      doc.nodes.find((n) => n.id === 'gnd')?.id ?? doc.nodes[0].id;
    diagnostics.push({
      severity: 'warning',
      message: `Using ${doc.reference} as reference. Add an explicit reference declaration to choose another node.`,
    });
  }
  for (const a of doc.annotations) {
    const [id, port] = a.target.split('.');
    const component = doc.components.find((c) => c.id === id);
    const exists =
      a.quantity === 'voltage'
        ? nodes.has(id) && port === undefined
        : port !== undefined
          ? component && Number(port) < component.nodes.length
          : component || doc.wires.some((w) => w.id === id);
    if (!exists)
      diagnostics.push({
        severity: 'error',
        line: a.line,
        message: `Unknown ${a.quantity} label target “${a.target}”.`,
      });
  }
  if (doc.components.length + doc.nodes.length > 300)
    diagnostics.push({
      severity: 'error',
      message:
        'This educational solver supports up to 300 combined nodes and components.',
    });
  if (doc.wires.length > 1000)
    diagnostics.push({
      severity: 'error',
      message: 'Maximum 1,000 explicit wires.',
    });
  return {
    document: diagnostics.some((d) => d.severity === 'error') ? undefined : doc,
    diagnostics,
  };
}
