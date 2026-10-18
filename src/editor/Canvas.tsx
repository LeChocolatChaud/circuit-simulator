import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Crosshair,
  Minus,
  Plus,
  Maximize2,
  MousePointer2,
  Cable,
  CirclePlus,
  Hand,
} from 'lucide-react';
import {
  componentInfo,
  terminalCurrent,
  terminalPosition,
  type CircuitDocument,
  type Point,
  type Sample,
  type Selection,
} from '../model/types';
import { Symbol } from './Symbol';
import { format } from '../model/format';

export type Tool = 'select' | 'wire' | 'node' | 'pan';
interface Props {
  doc: CircuitDocument;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMove: (selection: NonNullable<Selection>, position: Point) => void;
  onNode: (position: Point) => void;
  onWire: (from: string, to: string) => void;
  sample?: Sample;
  stale: boolean;
  disabled: boolean;
  inspector: ReactNode;
}
const route = (from: Point, to: Point) =>
  `M${from.x},${from.y} H${(from.x + to.x) / 2} V${to.y} H${to.x}`;
const currentArrow = (
  from: Point,
  to: Point,
  current: number | null | undefined,
) => {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const direction =
    ((current ?? 0) < 0 ? -1 : 1) *
    (Math.sign(from.y === to.y ? to.x - from.x : to.y - from.y) || 1);
  return from.y === to.y
    ? `M${mid.x - 16 * direction},${mid.y - 17}h${32 * direction}`
    : `M${mid.x + 17},${mid.y - 16 * direction}v${32 * direction}`;
};
export function Canvas({
  doc,
  selection,
  onSelect,
  onMove,
  onNode,
  onWire,
  sample,
  stale,
  disabled,
  inspector,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [tool, setTool] = useState<Tool>('select');
  const [wireStart, setWireStart] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    selection: NonNullable<Selection>;
    origin: Point;
    start: Point;
    current: Point;
  } | null>(null);
  const [pan, setPan] = useState<{ start: Point; x: number; y: number } | null>(
    null,
  );
  const [cursor, setCursor] = useState<Point | null>(null);
  const name = useRef('');
  const lastSize = useRef({ width: 0, height: 0 });
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const fit = useCallback(() => {
    const points = [...doc.nodes, ...doc.components].map((x) => x.position);
    if (!points.length) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    const minX = Math.min(...points.map((p) => p.x)) - 100;
    const maxX = Math.max(...points.map((p) => p.x)) + 100;
    const minY = Math.min(...points.map((p) => p.y)) - 95;
    const maxY = Math.max(...points.map((p) => p.y)) + 95;
    const scale = Math.min(
      1.4,
      (size.width - 40) / (maxX - minX),
      (size.height - 40) / (maxY - minY),
    );
    setView({
      scale: Math.max(0.1, scale),
      x: (size.width - (minX + maxX) * scale) / 2,
      y: (size.height - (minY + maxY) * scale) / 2,
    });
  }, [doc.nodes, doc.components, size]);
  useEffect(() => {
    const structure = `${doc.name}:${doc.nodes.length}:${doc.components.length}`;
    if (
      size.width > 100 &&
      (structure !== name.current ||
        size.width !== lastSize.current.width ||
        size.height !== lastSize.current.height)
    ) {
      name.current = structure;
      lastSize.current = size;
      fit();
    }
  }, [doc.name, doc.nodes.length, doc.components.length, fit, size]);
  const screen = (event: { clientX: number; clientY: number }) => {
    const rect = container.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const world = (point: Point) => ({
    x: (point.x - view.x) / view.scale,
    y: (point.y - view.y) / view.scale,
  });
  const moved = (kind: 'node' | 'component', id: string, point: Point) =>
    drag?.selection.kind === kind && drag.selection.id === id
      ? drag.current
      : point;
  const nodes = doc.nodes.map((n) => ({
    ...n,
    position: moved('node', n.id, n.position),
  }));
  const components = doc.components.map((c) => ({
    ...c,
    position: moved('component', c.id, c.position),
  }));
  const getNode = (id: string) => nodes.find((n) => n.id === id)!.position;
  const selected = (kind: string, id: string) =>
    selection?.kind === kind && selection.id === id;
  const connect = (id: string) => {
    if (disabled) return;
    if (wireStart && wireStart !== id) {
      onWire(wireStart, id);
      setWireStart(null);
    } else setWireStart(id);
  };
  const startDrag = (
    event: React.PointerEvent,
    item: NonNullable<Selection>,
    origin: Point,
  ) => {
    event.stopPropagation();
    if (tool === 'pan') return;
    onSelect(item);
    if (disabled || tool !== 'select') return;
    container.current?.setPointerCapture(event.pointerId);
    setDrag({
      selection: item,
      origin,
      start: world(screen(event)),
      current: origin,
    });
  };
  const zoom = (
    factor: number,
    center = { x: size.width / 2, y: size.height / 2 },
  ) =>
    setView((v) => {
      const scale = Math.max(0.15, Math.min(3, v.scale * factor));
      return {
        scale,
        x: center.x - ((center.x - v.x) * scale) / v.scale,
        y: center.y - ((center.y - v.y) * scale) / v.scale,
      };
    });
  let anchor: Point | undefined;
  if (selection?.kind === 'node')
    anchor = nodes.find((n) => n.id === selection.id)?.position;
  if (selection?.kind === 'component')
    anchor = components.find((c) => c.id === selection.id)?.position;
  if (selection?.kind === 'wire') {
    const w = doc.wires.find((w) => w.id === selection.id);
    if (w) {
      const a = getNode(w.from);
      const b = getNode(w.to);
      anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  if (selection?.kind === 'lead') {
    const [id, port] = selection.id.split('.');
    const c = components.find((c) => c.id === id);
    if (c) {
      const a = getNode(c.nodes[Number(port)]);
      const b = terminalPosition(c, Number(port));
      anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  const popupLeft = anchor
    ? Math.max(
        12,
        Math.min(size.width - 286, anchor.x * view.scale + view.x + 52),
      )
    : 0;
  const popupTop = anchor
    ? Math.max(
        12,
        Math.min(size.height - 340, anchor.y * view.scale + view.y - 30),
      )
    : 0;
  return (
    <section className="schematic-section">
      <div className="canvas-toolbar">
        <div className="tool-group" aria-label="Schematic tools">
          {(
            [
              { key: 'select', title: 'Select and move', icon: MousePointer2 },
              { key: 'wire', title: 'Connect nodes', icon: Cable },
              { key: 'node', title: 'Add node', icon: CirclePlus },
              { key: 'pan', title: 'Pan canvas', icon: Hand },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              title={t.title}
              aria-label={t.title}
              aria-pressed={tool === t.key}
              className={tool === t.key ? 'active' : ''}
              onClick={() => {
                setTool(t.key);
                setWireStart(null);
              }}
            >
              <t.icon size={17} />
            </button>
          ))}
        </div>
        <span className="canvas-caption">
          {tool === 'wire'
            ? wireStart
              ? `Connect ${wireStart} to another node`
              : 'Select two nodes or terminals to connect'
            : tool === 'node'
              ? 'Click the canvas to place a junction'
              : 'SCHEMATIC'}{' '}
        </span>
        <div className="tool-group zoom-controls">
          <button
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => zoom(0.8)}
          >
            <Minus size={15} />
          </button>
          <span>{Math.round(view.scale * 100)}%</span>
          <button
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => zoom(1.25)}
          >
            <Plus size={15} />
          </button>
          <button title="Fit circuit" aria-label="Fit circuit" onClick={fit}>
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      <div
        className={`canvas tool-${tool}`}
        ref={container}
        onWheel={(event) => {
          zoom(event.deltaY < 0 ? 1.08 : 0.925, screen(event));
        }}
        onPointerMove={(event) => {
          const point = screen(event);
          setCursor(world(point));
          if (drag) {
            const pos = world(point);
            setDrag({
              ...drag,
              current: {
                x: Math.round((drag.origin.x + pos.x - drag.start.x) / 10) * 10,
                y: Math.round((drag.origin.y + pos.y - drag.start.y) / 10) * 10,
              },
            });
          }
          if (pan)
            setView((v) => ({
              ...v,
              x: pan.x + point.x - pan.start.x,
              y: pan.y + point.y - pan.start.y,
            }));
        }}
        onPointerUp={(event) => {
          if (
            drag &&
            (drag.current.x !== drag.origin.x ||
              drag.current.y !== drag.origin.y)
          )
            onMove(drag.selection, drag.current);
          setDrag(null);
          setPan(null);
          if (container.current?.hasPointerCapture(event.pointerId))
            container.current.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          setDrag(null);
          setPan(null);
        }}
      >
        <svg
          className="schematic"
          role="img"
          aria-label={`${doc.name} schematic`}
          width={size.width}
          height={size.height}
          onPointerDown={(event) => {
            if (event.button === 1 || tool === 'pan') {
              event.preventDefault();
              const start = screen(event);
              setPan({ start, x: view.x, y: view.y });
              container.current?.setPointerCapture(event.pointerId);
            } else if (tool === 'node' && !disabled) {
              const p = world(screen(event));
              onNode({
                x: Math.round(p.x / 10) * 10,
                y: Math.round(p.y / 10) * 10,
              });
            } else {
              onSelect(null);
              setWireStart(null);
            }
          }}
        >
          <defs>
            <pattern
              id="grid"
              width={20 * view.scale}
              height={20 * view.scale}
              patternUnits="userSpaceOnUse"
              x={view.x}
              y={view.y}
            >
              <circle cx="1" cy="1" r="0.8" fill="#b8c7c0" opacity="0.55" />
            </pattern>
            <marker
              id="current-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0L10 5 0 10Z" fill="#27896f" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {doc.wires.map((w) => {
              const a = getNode(w.from);
              const b = getNode(w.to);
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              return (
                <g
                  key={w.id}
                  className={`circuit-wire ${selected('wire', w.id) ? 'selected' : ''}`}
                  role="button"
                  aria-label={`Wire ${w.id}`}
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect({ kind: 'wire', id: w.id });
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSelect({ kind: 'wire', id: w.id });
                  }}
                >
                  <path className="wire-hit" d={route(a, b)} />
                  <rect
                    x={mid.x - 9}
                    y={mid.y - 9}
                    width="18"
                    height="18"
                    fill="transparent"
                  />
                  <path className="wire-visible" d={route(a, b)} />
                  {w.label !== w.id && (
                    <text className="wire-label" x={mid.x + 12} y={mid.y - 12}>
                      {w.label}
                    </text>
                  )}
                  {selected('wire', w.id) && (
                    <path
                      className="wire-current-arrow"
                      d={currentArrow(a, b, sample?.wireCurrents[w.id])}
                      markerEnd="url(#current-arrow)"
                    />
                  )}
                </g>
              );
            })}
            {components.flatMap((c) =>
              c.nodes.map((node, port) => {
                const id = `${c.id}.${port}`;
                return (
                  <g
                    key={id}
                    className={`circuit-wire ${selected('lead', id) ? 'selected' : ''}`}
                    role="button"
                    aria-label={`Inspect branch ${id}`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSelect({ kind: 'lead', id });
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tool === 'wire') connect(node);
                      else onSelect({ kind: 'lead', id });
                    }}
                  >
                    <path
                      className="wire-hit"
                      d={route(getNode(node), terminalPosition(c, port))}
                    />
                    <path
                      className="wire-visible"
                      d={route(getNode(node), terminalPosition(c, port))}
                    />
                    {selected('lead', id) && (
                      <path
                        className="wire-current-arrow"
                        d={currentArrow(
                          getNode(node),
                          terminalPosition(c, port),
                          sample
                            ? terminalCurrent(c, port, sample.currents[c.id])
                            : undefined,
                        )}
                        markerEnd="url(#current-arrow)"
                      />
                    )}
                  </g>
                );
              }),
            )}
            {components.map((c) => (
              <g
                key={c.id}
                className={`component ${selected('component', c.id) ? 'selected' : ''}`}
                transform={`translate(${c.position.x} ${c.position.y})`}
                role="button"
                tabIndex={0}
                aria-label={`Inspect ${c.id}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    onSelect({ kind: 'component', id: c.id });
                }}
                onPointerDown={(event) =>
                  startDrag(event, { kind: 'component', id: c.id }, c.position)
                }
              >
                <rect
                  className="component-hit"
                  x="-58"
                  y="-49"
                  width="116"
                  height="98"
                  rx="14"
                />
                <g
                  transform={`rotate(${c.rotation})`}
                  className="component-symbol"
                >
                  <Symbol kind={c.kind} />
                </g>
                <g
                  className="component-text"
                  transform={
                    c.rotation % 180 ? 'translate(49,-8)' : 'translate(0,-42)'
                  }
                  textAnchor={c.rotation % 180 ? 'start' : 'middle'}
                >
                  <text className="component-id">{c.id}</text>
                  <text y="17" className="component-value">
                    {c.kind === 'opamp'
                      ? 'ideal'
                      : format(c.value, componentInfo[c.kind].unit)}
                  </text>
                  {c.label !== c.id && (
                    <text y="32" className="component-label">
                      {c.label}
                    </text>
                  )}
                </g>
                {selected('component', c.id) && (
                  <g className="polarity" transform={`rotate(${c.rotation})`}>
                    <text x="-42" y="-11">
                      +
                    </text>
                    <text x="37" y="-11">
                      −
                    </text>
                    <path
                      d={
                        sample?.currents[c.id] !== null &&
                        (sample?.currents[c.id] ?? 0) < 0
                          ? 'M20 40H-20'
                          : 'M-20 40H20'
                      }
                      markerEnd="url(#current-arrow)"
                    />
                  </g>
                )}
                {tool === 'wire' &&
                  c.nodes.map((node, port) => {
                    const p = terminalPosition(
                      { ...c, position: { x: 0, y: 0 } },
                      port,
                    );
                    return (
                      <circle
                        key={port}
                        className="terminal-handle"
                        cx={p.x}
                        cy={p.y}
                        r="7"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          connect(node);
                        }}
                      />
                    );
                  })}
              </g>
            ))}
            {nodes.map((n) => (
              <g
                key={n.id}
                className={`circuit-node ${selected('node', n.id) || wireStart === n.id ? 'selected' : ''}`}
                transform={`translate(${n.position.x} ${n.position.y})`}
                role="button"
                aria-label={`Inspect node ${n.id}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelect({ kind: 'node', id: n.id });
                }}
                onPointerDown={(event) => {
                  if (tool === 'wire') {
                    event.stopPropagation();
                    connect(n.id);
                  } else
                    startDrag(event, { kind: 'node', id: n.id }, n.position);
                }}
              >
                <circle className="node-hit" r="14" />
                <circle className="node-dot" r="4" />
                <text y="-17" textAnchor="middle" className="node-label">
                  {n.label}
                </text>
                {doc.reference === n.id && (
                  <g className="ground" transform="translate(0,6)">
                    <path d="M0 0V12M-12 12H12M-8 17H8M-3 22H3" />
                    <text y="38" textAnchor="middle">
                      0 V · REF
                    </text>
                  </g>
                )}
              </g>
            ))}
            {doc.annotations.map((a) => {
              const node = nodes.find((n) => n.id === a.target);
              const c = components.find((c) => c.id === a.target.split('.')[0]);
              const wire = doc.wires.find((w) => w.id === a.target);
              const point =
                node?.position ??
                c?.position ??
                (wire
                  ? {
                      x: (getNode(wire.from).x + getNode(wire.to).x) / 2,
                      y: (getNode(wire.from).y + getNode(wire.to).y) / 2,
                    }
                  : null);
              if (!point) return null;
              const port = a.target.split('.')[1];
              let value =
                a.quantity === 'voltage'
                  ? sample?.voltages[a.target]
                  : (sample?.currents[a.target] ??
                    sample?.wireCurrents[a.target]);
              if (port !== undefined && c) {
                const current = sample?.currents[c.id];
                value =
                  c.kind === 'opamp' && Number(port) < 2
                    ? 0
                    : current === undefined || current === null
                      ? current
                      : current * (Number(port) % 2 ? -1 : 1);
              }
              return (
                <g
                  key={`${a.quantity}.${a.target}`}
                  transform={`translate(${point.x + ((c?.rotation ?? 0) % 180 ? 48 : 0)} ${point.y + (node ? -40 : 64)})`}
                  className={`measurement-tag ${stale ? 'stale' : ''}`}
                >
                  <text
                    textAnchor={(c?.rotation ?? 0) % 180 ? 'start' : 'middle'}
                  >
                    {a.text}{' '}
                    <tspan>
                      {stale
                        ? '—'
                        : format(value, a.quantity === 'voltage' ? 'V' : 'A')}
                    </tspan>
                  </text>
                </g>
              );
            })}
            {wireStart && cursor && nodes.some((n) => n.id === wireStart) && (
              <path
                className="wire-preview"
                d={route(getNode(wireStart), cursor)}
              />
            )}
          </g>
        </svg>
        {!doc.components.length && (
          <div className="empty-canvas">
            <Crosshair size={30} />
            <h3>Your next circuit starts here</h3>
            <p>
              Add a component from the library or write a circuit description.
            </p>
          </div>
        )}
        {anchor && !drag && !pan && (
          <div
            className="inspector-anchor"
            style={{ left: popupLeft, top: popupTop }}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            {inspector}
          </div>
        )}
        <div className="canvas-legend">
          <span>
            <i /> Node
          </span>
          <span>
            <i className="legend-wire" /> Branch
          </span>
          <span>
            {tool === 'pan' ? 'Drag to pan' : 'Scroll to zoom · Drag to move'}
          </span>
        </div>
      </div>
    </section>
  );
}
