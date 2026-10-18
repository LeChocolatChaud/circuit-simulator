import {
  Activity,
  ArrowRight,
  Flag,
  Pin,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  componentInfo,
  outputNodes,
  terminalCurrent,
  terminalPort,
  type CircuitDocument,
  type Sample,
  type Selection,
} from '../model/types';
import { format } from '../model/format';
import {
  declaration,
  setAnnotation,
  setProperty,
  deleteSelection,
  getProperty,
} from '../language/edit';
import { splitComment } from '../language/parser';
export interface Probe {
  quantity: 'voltage' | 'current' | 'power';
  target: string;
}
export function readProbe(
  sample: Sample | undefined,
  probe: Probe,
  doc: CircuitDocument,
): number | null | undefined {
  if (!sample) return undefined;
  if (probe.quantity === 'power') return sample.powers[probe.target];
  if (probe.quantity === 'voltage')
    return doc.nodes.some((n) => n.id === probe.target)
      ? sample.voltages[probe.target]
      : sample.elementVoltages[probe.target];
  const [id, port] = probe.target.split('.');
  if (port !== undefined) {
    const c = doc.components.find((c) => c.id === id);
    return c
      ? terminalCurrent(c, terminalPort(c, port), sample.currents[id])
      : undefined;
  }
  return sample.currents[id] ?? sample.wireCurrents[id] ?? null;
}
interface Props {
  doc: CircuitDocument;
  selection: NonNullable<Selection>;
  sample?: Sample;
  stale: boolean;
  disabled: boolean;
  onChange: (source: string) => void;
  onClose: () => void;
  onProbe: (probe: Probe) => void;
}
export function Inspector({
  doc,
  selection,
  sample,
  stale,
  disabled,
  onChange,
  onClose,
  onProbe,
}: Props) {
  const c = doc.components.find((c) => c.id === selection.id.split('.')[0]);
  const node =
    selection.kind === 'node'
      ? doc.nodes.find((n) => n.id === selection.id)
      : undefined;
  const referenceDeclared = doc.source
    .split('\n')
    .some(
      (line) => splitComment(line)[0].trim() === `reference ${doc.reference}`,
    );
  const wire =
    selection.kind === 'wire'
      ? doc.wires.find((w) => w.id === selection.id)
      : undefined;
  const component = selection.kind === 'component' ? c : undefined;
  const object = component ?? node ?? wire;
  const port = Number(selection.id.split('.')[1]);
  const name = component
    ? componentInfo[component.kind].name
    : node
      ? 'Node'
      : wire
        ? 'Wire branch'
        : 'Terminal branch';
  const quantity = node ? 'voltage' : 'current';
  const annotation = doc.annotations.find(
    (a) => a.quantity === quantity && a.target === selection.id,
  );
  const rawProperty = (line: number, key: string, fallback: string) =>
    getProperty(doc.source, line, key, fallback);
  const edit = (key: string, value: string) => {
    if (node?.terminal && node.line === 0)
      onChange(`${doc.source.trimEnd()}\nnode ${node.id} ${key}=${value}\n`);
    else if (object) onChange(setProperty(doc.source, object.line, key, value));
  };
  const metric = (
    label: string,
    value: number | null | undefined,
    unit: string,
    probe: Probe,
  ) => (
    <button
      className="metric"
      onClick={() => onProbe(probe)}
      title={`Plot ${label}`}
    >
      <span>{label}</span>
      <strong>{stale || !sample ? '—' : format(value, unit)}</strong>
      <Activity size={12} />
    </button>
  );
  const field = (title: string, key: string, fallback: string) => (
    <label className="field" key={key}>
      <span>{title}</span>
      <input
        aria-label={title}
        key={rawProperty(component!.line, key, fallback)}
        defaultValue={rawProperty(component!.line, key, fallback)}
        disabled={disabled}
        onBlur={(e) => {
          if (e.target.value !== rawProperty(component!.line, key, fallback))
            edit(key, e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
  const current = component
    ? sample?.currents[component.id]
    : wire
      ? sample?.wireCurrents[wire.id]
      : c
        ? terminalCurrent(c, port, sample?.currents[c.id] ?? null)
        : null;
  return (
    <aside className="inspector" aria-label="Measurement inspector">
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">{name}</span>
          <h3>{selection.id}</h3>
        </div>
        <div className="inspector-top-actions">
          {(component || node?.terminal) && (
            <button
              className="rotate-button"
              disabled={disabled}
              onClick={() => {
                const owner = component ?? c;
                if (owner)
                  onChange(
                    setProperty(
                      doc.source,
                      owner.line,
                      'rotate',
                      String((owner.rotation + 90) % 360),
                    ),
                  );
              }}
            >
              <RotateCw size={14} />
              Rotate
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Close inspector"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
      </div>
      <div
        className="inspector-content"
        tabIndex={0}
        aria-label="Inspector details"
      >
        {stale && (
          <div className="inspector-notice">
            Run analysis to update measurements.
          </div>
        )}
        {object && (
          <label className="field">
            <span>Label</span>
            <input
              aria-label="Element or node label"
              key={`${object.id}-${object.label}`}
              defaultValue={object.label}
              disabled={disabled}
              onBlur={(e) => {
                if (e.target.value !== object.label)
                  edit('label', JSON.stringify(e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </label>
        )}
        {component &&
          component.kind !== 'opamp' &&
          field(
            componentInfo[component.kind].parameter,
            componentInfo[component.kind].parameter,
            String(component.value),
          )}
        <div className="metrics">
          {node ? (
            metric(
              `Voltage vs ${doc.reference}`,
              sample?.voltages[node.id],
              'V',
              { quantity: 'voltage', target: node.id },
            )
          ) : (
            <>
              {component &&
                metric(
                  component.kind === 'opamp'
                    ? 'Output voltage'
                    : 'Voltage drop',
                  sample?.elementVoltages[component.id],
                  'V',
                  { quantity: 'voltage', target: component.id },
                )}
              {metric('Current', current, 'A', {
                quantity: 'current',
                target: selection.id,
              })}
              {component &&
                metric(
                  component.kind === 'opamp'
                    ? 'Output-port power'
                    : 'Power absorbed',
                  sample?.powers[component.id],
                  'W',
                  { quantity: 'power', target: component.id },
                )}
            </>
          )}
        </div>
        {!node && (
          <div className="direction">
            <ArrowRight size={13} />
            <span>
              {component
                ? outputNodes(component).join(' → ')
                : wire
                  ? `${wire.from} → ${wire.to}`
                  : c
                    ? `${c.nodes[port]} → ${c.id} terminal ${port}`
                    : ''}
            </span>
          </div>
        )}
        {component?.kind === 'opamp' && (
          <p className="measurement-note">
            Supply consumption is not modeled. Input currents are 0 A; output
            power may be delivered or absorbed.
          </p>
        )}
        {component && component.kind !== 'opamp' && (
          <p className="measurement-note">
            Positive power is absorbed; negative power is delivered.
          </p>
        )}
        {!stale && sample && current === null && !node && (
          <p className="measurement-note">
            The circuit does not define a unique current for this branch.
          </p>
        )}
        <label className="field pin-field">
          <span>
            <Pin size={12} /> Pinned {quantity} label
          </span>
          <input
            aria-label="Pinned measurement label"
            key={annotation?.text ?? ''}
            placeholder={node ? 'e.g. Vout' : 'e.g. Iin'}
            defaultValue={annotation?.text ?? ''}
            disabled={disabled}
            onBlur={(e) => {
              if (e.target.value !== (annotation?.text ?? ''))
                onChange(
                  setAnnotation(doc, quantity, selection.id, e.target.value),
                );
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
        {component && (
          <details className="advanced">
            <summary>Terminals & model settings</summary>
            {component.nodes.map((n, i) => (
              <label className="field" key={i}>
                <span>
                  {component.kind === 'opamp'
                    ? ['+ input', '− input', 'Output', 'Return'][i]
                    : i === 0
                      ? 'Positive terminal'
                      : 'Negative terminal'}
                </span>
                <code className="terminal-name">{n}</code>
              </label>
            ))}
            {(component.kind === 'capacitor' ||
              component.kind === 'inductor') &&
              field(
                component.kind === 'capacitor'
                  ? 'Initial voltage'
                  : 'Initial current',
                component.kind === 'capacitor'
                  ? 'initial_voltage'
                  : 'initial_current',
                '0',
              )}
            {component.control &&
              field(
                'Control',
                'control',
                Array.isArray(component.control)
                  ? `(${component.control.join(',')})`
                  : component.control,
              )}
            {['voltage_source', 'current_source'].includes(component.kind) && (
              <>
                <label className="field">
                  <span>Waveform</span>
                  <select
                    aria-label="Source waveform"
                    value={component.waveform.kind}
                    disabled={disabled}
                    onChange={(e) => edit('wave', e.target.value)}
                  >
                    {['dc', 'step', 'pulse', 'sine'].map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </label>
                {component.waveform.kind !== 'dc' && (
                  <>
                    {field(
                      'Amplitude',
                      'amplitude',
                      String(component.waveform.amplitude),
                    )}
                    {field('Offset', 'offset', '0')}
                    {field('Delay', 'delay', '0s')}
                  </>
                )}
                {component.waveform.kind === 'sine' &&
                  field('Frequency', 'frequency', '50Hz')}
                {component.waveform.kind === 'pulse' && (
                  <>
                    {field('Width', 'width', '5ms')}
                    {field('Period', 'period', '10ms')}
                  </>
                )}
              </>
            )}
          </details>
        )}
      </div>
      <div className="inspector-actions">
        {node && (
          <button
            disabled={
              disabled || (referenceDeclared && doc.reference === node.id)
            }
            onClick={() =>
              onChange(
                declaration(doc.source, 'reference', `reference ${node.id}`),
              )
            }
          >
            <Flag size={13} />
            {referenceDeclared && doc.reference === node.id
              ? 'Reference node'
              : 'Set as reference'}
          </button>
        )}
        {selection.kind !== 'lead' && (
          <button
            className="danger-text"
            title={
              node ? 'Delete node and attached components' : 'Delete element'
            }
            disabled={disabled}
            onClick={() => {
              onChange(deleteSelection(doc, selection));
              onClose();
            }}
          >
            <Trash2 size={13} />
            Delete
          </button>
        )}
      </div>
    </aside>
  );
}
