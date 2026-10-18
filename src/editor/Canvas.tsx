import {
  useCallback,
  useMemo,
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
  terminalPosition,
  terminalPort,
  type CircuitDocument,
  type Point,
  type Sample,
  type Selection,
} from '../model/types';
import { Symbol } from './Symbol';
import { format } from '../model/format';
import {
  attachedNodes,
  pathCenter,
  pathData,
  terminalNormal,
  wireRoutes,
} from './routing';

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
  onArrange: () => void;
}
const route = (from: Point, to: Point) =>
  `M${from.x},${from.y} H${(from.x + to.x) / 2} V${to.y} H${to.x}`;
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
  onArrange,
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
  const [contextPoint, setContextPoint] = useState<Point | null>(null);
  const [contextMenu, setContextMenu] = useState(false);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(false);
        setContextPoint(null);
        setWireStart(null);
      }
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, []);
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
  const geometry = useMemo(() => {
    const moved = (kind: 'node' | 'component', id: string, point: Point) =>
      drag?.selection.kind === kind && drag.selection.id === id
        ? drag.current
        : point;
    const components = doc.components.map((c) => ({
      ...c,
      position: moved('component', c.id, c.position),
    }));
    const nodes = attachedNodes(
      doc.nodes.map((n) => ({
        ...n,
        position: moved('node', n.id, n.position),
      })),
      components,
    );
    const routes = wireRoutes(nodes, components, doc.wires);
    return { components, nodes, routes };
  }, [doc, drag]);
  const { components, nodes, routes } = geometry;
  const select = (next: Selection) => {
    setContextPoint(null);
    setContextMenu(false);
    onSelect(next);
  };
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
    if (event.button !== 0 || tool === 'pan') return;
    event.stopPropagation();
    select(item);
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
  if (selection?.kind === 'wire' || selection?.kind === 'lead') {
    const w = doc.wires.find((w) => w.id === selection.id);
    if (w) {
      anchor = pathCenter(routes.get(w.id)!).point;
    }
  }
  if (selection?.kind === 'lead' && !anchor) {
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
        Math.min(
          size.width - Math.min(332, size.width - 24),
          contextPoint?.x ?? anchor.x * view.scale + view.x + 45,
        ),
      )
    : 0;
  const popupTop = anchor
    ? Math.max(
        12,
        Math.min(
          size.height - 450,
          contextPoint?.y ?? anchor.y * view.scale + view.y - 30,
        ),
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
        onContextMenu={(event) => {
          if ((event.target as Element).closest('.inspector-anchor')) return;
          event.preventDefault();
          setDrag(null);
          setPan(null);
          const target = (event.target as Element).closest(
            '[data-kind][data-id]',
          );
          if (target) {
            onSelect({
              kind: target.getAttribute(
                'data-kind',
              ) as NonNullable<Selection>['kind'],
              id: target.getAttribute('data-id')!,
            });
            setContextMenu(false);
          } else {
            onSelect(null);
            setContextMenu(true);
          }
          setContextPoint(screen(event));
        }}
        onWheel={(event) => {
          if (
            (event.target as Element).closest(
              '.inspector-anchor, .canvas-context-menu',
            )
          )
            return;
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
            if (event.button === 2) return;
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
              select(null);
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
              <circle
                cx="1"
                cy="1"
                r="0.8"
                className="grid-dot"
                opacity="0.55"
              />
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
              const path = routes.get(w.id)!;
              const { point: mid, horizontal, direction } = pathCenter(path);
              const kind = w.implicit ? 'lead' : 'wire';
              const isSelected = selected(kind, w.id);
              const current = sample?.wireCurrents[w.id];
              const sign = direction * ((current ?? 0) < 0 ? -1 : 1);
              return (
                <g
                  key={w.id}
                  data-kind={kind}
                  data-id={w.id}
                  className={`circuit-wire ${isSelected ? 'selected' : ''}`}
                  role="button"
                  aria-label={
                    w.implicit ? `Inspect branch ${w.id}` : `Wire ${w.id}`
                  }
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    select({ kind, id: w.id });
                  }}
                  onPointerDown={(e) => {
                    if (tool !== 'pan') e.stopPropagation();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') select({ kind, id: w.id });
                  }}
                >
                  <path className="wire-hit" d={pathData(path)} />
                  <rect
                    className="wire-pick-target"
                    x={mid.x - 8}
                    y={mid.y - 8}
                    width="16"
                    height="16"
                    fill="transparent"
                  />
                  <path className="wire-visible" d={pathData(path)} />
                  {w.label && w.label !== w.id && (
                    <text className="wire-label" x={mid.x + 12} y={mid.y - 12}>
                      {w.label}
                    </text>
                  )}
                  {isSelected && (
                    <path
                      className="wire-current-arrow"
                      d={
                        horizontal
                          ? `M${mid.x - 16 * sign},${mid.y - 16}h${32 * sign}`
                          : `M${mid.x + 16},${mid.y - 16 * sign}v${32 * sign}`
                      }
                      markerEnd="url(#current-arrow)"
                    />
                  )}
                </g>
              );
            })}
            {components.map((c) => (
              <g
                key={c.id}
                data-kind="component"
                data-id={c.id}
                className={`component ${selected('component', c.id) ? 'selected' : ''}`}
                transform={`translate(${c.position.x} ${c.position.y})`}
                role="button"
                tabIndex={0}
                aria-label={`Inspect ${c.id}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    select({ kind: 'component', id: c.id });
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
              </g>
            ))}
            {nodes.map((n) => (
              <g
                key={n.id}
                data-kind="node"
                data-id={n.id}
                className={`circuit-node ${n.terminal ? 'terminal-node' : ''} ${selected('node', n.id) || wireStart === n.id ? 'selected' : ''}`}
                transform={`translate(${n.position.x} ${n.position.y})`}
                role="button"
                aria-label={`Inspect node ${n.id}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') select({ kind: 'node', id: n.id });
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0 || tool === 'pan') return;
                  if (tool === 'wire') {
                    event.stopPropagation();
                    connect(n.id);
                  } else if (n.terminal) {
                    event.stopPropagation();
                    select({ kind: 'node', id: n.id });
                  } else
                    startDrag(event, { kind: 'node', id: n.id }, n.position);
                }}
              >
                <circle className="node-hit" r="14" />
                <circle className="node-dot" r="4" />
                <title>{n.id}</title>
                {(() => {
                  const c = n.terminal
                    ? components.find((c) => c.id === n.terminal!.component)
                    : undefined;
                  const normal = c
                    ? terminalNormal(c, n.terminal!.port)
                    : { x: 0, y: -1 };
                  return (
                    <text
                      x={normal.x * 12}
                      y={normal.y > 0 ? 19 : normal.y < 0 ? -13 : -8}
                      textAnchor={
                        normal.x < 0 ? 'end' : normal.x > 0 ? 'start' : 'middle'
                      }
                      className={`node-label ${n.terminal ? 'terminal-label' : ''}`}
                    >
                      {n.label}
                    </text>
                  );
                })()}
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
              if (a.quantity === 'current' && port !== undefined && c) {
                const current = sample?.currents[c.id];
                value =
                  c.kind === 'opamp' && terminalPort(c, port) < 2
                    ? 0
                    : current === undefined || current === null
                      ? current
                      : current * (terminalPort(c, port) % 2 ? -1 : 1);
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
            style={
              {
                left: popupLeft,
                top: popupTop,
                '--popup-max-height': `${Math.max(100, size.height - popupTop - 12)}px`,
              } as React.CSSProperties
            }
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
          >
            {inspector}
          </div>
        )}
        {contextMenu && contextPoint && (
          <div
            className="canvas-context-menu"
            role="menu"
            aria-label="Canvas actions"
            style={{
              left: Math.max(8, Math.min(size.width - 190, contextPoint.x)),
              top: Math.max(8, Math.min(size.height - 140, contextPoint.y)),
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                onNode(world(contextPoint));
                setContextMenu(false);
              }}
            >
              Add node here
            </button>
            <button
              role="menuitem"
              onClick={() => {
                fit();
                setContextMenu(false);
              }}
            >
              Fit circuit
            </button>
            <button
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                onArrange();
                setContextMenu(false);
              }}
            >
              Arrange circuit
            </button>
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
