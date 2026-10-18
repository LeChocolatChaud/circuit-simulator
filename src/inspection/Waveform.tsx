import type { CircuitDocument, SimulationResult } from '../model/types';
import { format } from '../model/format';
import { readProbe, type Probe } from './Inspector';
interface Props {
  doc: CircuitDocument;
  result: SimulationResult | null;
  stale: boolean;
  index: number;
  onIndex: (index: number) => void;
  probe: Probe;
  onProbe: (probe: Probe) => void;
}
export function Waveform({
  doc,
  result,
  stale,
  index,
  onIndex,
  probe,
  onProbe,
}: Props) {
  const samples = result?.samples ?? [];
  const unit =
    probe.quantity === 'voltage'
      ? 'V'
      : probe.quantity === 'current'
        ? 'A'
        : 'W';
  const values = samples.map((s) => readProbe(s, probe, doc));
  const finite = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const padding = Math.max((max - min) * 0.12, Math.abs(max) * 0.05, 1e-6);
  const low = min - padding;
  const high = max + padding;
  const width = 900;
  const height = 152;
  const left = 74;
  const right = 18;
  const top = 15;
  const bottom = 30;
  const maxTime = samples.at(-1)?.time || 1;
  const x = (time: number) => left + ((width - left - right) * time) / maxTime;
  const y = (value: number) =>
    top + ((height - top - bottom) * (high - value)) / (high - low);
  let path = '';
  let continuing = false;
  samples.forEach((sample, i) => {
    const v = values[i];
    if (typeof v !== 'number') {
      continuing = false;
      return;
    }
    path += `${continuing ? 'L' : 'M'}${x(sample.time).toFixed(2)},${y(v).toFixed(2)} `;
    continuing = true;
  });
  const targets =
    probe.quantity === 'voltage'
      ? [
          ...doc.nodes.map((n) => ({ id: n.id, text: `${n.id} · node` })),
          ...doc.components.map((c) => ({ id: c.id, text: `${c.id} · drop` })),
        ]
      : [
          ...doc.components.map((c) => ({ id: c.id, text: c.id })),
          ...(probe.quantity === 'current'
            ? doc.wires.map((w) => ({ id: w.id, text: w.id }))
            : []),
        ];
  if (!targets.some((t) => t.id === probe.target) && probe.target.includes('.'))
    targets.push({ id: probe.target, text: `${probe.target} · terminal` });
  return (
    <section
      className={`waveform-panel ${stale ? 'stale' : ''}`}
      aria-label="Waveform viewer"
    >
      <div className="waveform-heading">
        <div>
          <span className="section-number">02</span>
          <h2>Analysis</h2>
          <span className="analysis-mode">
            {doc.analysis.mode === 'dc' ? 'Operating point' : 'Time domain'}
          </span>
        </div>
        <div className="probe-controls">
          <select
            aria-label="Plot quantity"
            value={probe.quantity}
            onChange={(e) => {
              const quantity = e.target.value as Probe['quantity'];
              onProbe({
                quantity,
                target:
                  quantity === 'voltage'
                    ? (doc.nodes[0]?.id ?? '')
                    : (doc.components[0]?.id ?? ''),
              });
            }}
          >
            <option value="voltage">Voltage</option>
            <option value="current">Current</option>
            <option value="power">Power</option>
          </select>
          <select
            aria-label="Plot target"
            value={probe.target}
            onChange={(e) => onProbe({ ...probe, target: e.target.value })}
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.text}
              </option>
            ))}
          </select>
        </div>
      </div>
      {doc.analysis.mode === 'dc' ? (
        <div className="dc-summary">
          <div className="dc-value">
            <span>
              {probe.quantity} · {probe.target || 'select a target'}
            </span>
            <strong>
              {stale || !samples.length ? '—' : format(values[0], unit)}
            </strong>
          </div>
          <p>
            {stale
              ? 'The circuit has changed. Run analysis to refresh the results.'
              : samples.length
                ? 'DC operating point. Select a node, branch, or component to inspect its measurements.'
                : 'Run an analysis to explore voltages, currents, and power.'}
          </p>
          <div className="dc-mini-bars" aria-hidden="true">
            {[32, 55, 43, 70, 95, 64, 78, 48, 35, 53, 40, 64].map((h, i) => (
              <i style={{ height: h }} key={i} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="plot-wrapper">
            {!samples.length || !finite.length || stale ? (
              <div className="plot-empty">
                {stale
                  ? 'Run analysis to update this waveform.'
                  : samples.length
                    ? 'This measurement is indeterminate.'
                    : 'Run transient analysis to see a waveform.'}
              </div>
            ) : (
              <svg
                className="plot"
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                aria-label="Transient waveform"
                onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  const time = Math.max(
                    0,
                    Math.min(
                      maxTime,
                      ((((event.clientX - box.left) / box.width) * width -
                        left) /
                        (width - left - right)) *
                        maxTime,
                    ),
                  );
                  let nearest = 0;
                  samples.forEach((s, i) => {
                    if (
                      Math.abs(s.time - time) <
                      Math.abs(samples[nearest].time - time)
                    )
                      nearest = i;
                  });
                  onIndex(nearest);
                }}
              >
                {[0, 0.5, 1].map((ratio) => {
                  const value = low + (high - low) * ratio;
                  return (
                    <g key={ratio}>
                      <line
                        x1={left}
                        x2={width - right}
                        y1={y(value)}
                        y2={y(value)}
                        className="plot-grid"
                      />
                      <text x={left - 12} y={y(value) + 4} textAnchor="end">
                        {format(value, unit, 3)}
                      </text>
                    </g>
                  );
                })}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                  <g key={ratio}>
                    <line
                      x1={x(maxTime * ratio)}
                      x2={x(maxTime * ratio)}
                      y1={top}
                      y2={height - bottom}
                      className="plot-grid"
                    />
                    <text
                      x={x(maxTime * ratio)}
                      y={height - 8}
                      textAnchor="middle"
                    >
                      {format(maxTime * ratio, 's', 3)}
                    </text>
                  </g>
                ))}
                <path d={path} className="plot-line" />
                <line
                  x1={x(samples[index]?.time ?? 0)}
                  x2={x(samples[index]?.time ?? 0)}
                  y1={top}
                  y2={height - bottom}
                  className="plot-cursor"
                />
                {typeof values[index] === 'number' && (
                  <circle
                    cx={x(samples[index].time)}
                    cy={y(values[index] as number)}
                    r="4"
                    fill="#23775e"
                  />
                )}
              </svg>
            )}
          </div>
          <div className="time-controls">
            <span>t = {format(samples[index]?.time ?? 0, 's')}</span>
            <input
              aria-label="Time cursor"
              type="range"
              min={0}
              max={Math.max(0, samples.length - 1)}
              value={Math.min(index, Math.max(0, samples.length - 1))}
              disabled={stale || !samples.length}
              onChange={(e) => onIndex(Number(e.target.value))}
            />
            <strong>{stale ? '—' : format(values[index], unit)}</strong>
          </div>
        </>
      )}
    </section>
  );
}
