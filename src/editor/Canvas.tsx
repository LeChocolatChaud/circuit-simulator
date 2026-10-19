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
  type SelectionItem,
} from '../model/types';
import { Symbol } from './Symbol';
import { format } from '../model/format';
import { connectionTarget, type ConnectionTarget } from './hitTesting';
import { allSelectable, mergeSelection, selectionInBox } from './selection';
import {
  attachedNodes,
  pathCenter,
  pathData,
  terminalNormal,
  wireRoutes,
} from './routing';

export type Tool = 'select' | 'pan';
type Gesture =
  | {
      kind: 'pan';
      pointerId: number;
      start: Point;
      origin: Point;
      moved: boolean;
    }
  | {
      kind: 'move';
      pointerId: number;
      start: Point;
      worldStart: Point;
      origin: Point;
      items: SelectionItem[];
      moved: boolean;
    }
  | {
      kind: 'box';
      pointerId: number;
      start: Point;
      worldStart: Point;
      base: SelectionItem[];
      moved: boolean;
    }
  | {
      kind: 'node';
      pointerId: number;
      start: Point;
      node: string;
      moved: boolean;
    }
  | { kind: 'drawing'; pointerId: number; start: Point; moved: boolean }
  | {
      kind: 'inspect';
      pointerId: number;
      start: Point;
      selection: NonNullable<Selection>;
      moved: boolean;
    };
interface Props {
  doc: CircuitDocument;
  selection: Selection;
  selectedItems: SelectionItem[];
  onSelect: (selection: Selection) => void;
  onSelectMany: (items: SelectionItem[]) => void;
  onMove: (items: SelectionItem[], delta: Point) => void;
  onNode: (position: Point) => void;
  onWire: (from: string, to: string) => boolean;
  onWirePoint: (from: string, position: Point) => string | null;
  onJoinWire: (from: string, wireId: string, position: Point) => boolean;
  onRotate: (id: string) => void;
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
  selectedItems,
  onSelect,
  onSelectMany,
  onMove,
  onNode,
  onWire,
  onWirePoint,
  onJoinWire,
  onRotate,
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
  const drawing = useRef<string | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [pressed, setPressed] = useState(false);
  const setDrawing = useCallback((id: string | null) => {
    drawing.current = id;
    setWireStart(id);
  }, []);
  const [drag, setDrag] = useState<{
    items: SelectionItem[];
    delta: Point;
  } | null>(null);
  const [marquee, setMarquee] = useState<{
    start: Point;
    end: Point;
    base: SelectionItem[];
  } | null>(null);
  const [pan, setPan] = useState<{ start: Point; x: number; y: number } | null>(
    null,
  );
  const [cursor, setCursor] = useState<Point | null>(null);
  const [contextPoint, setContextPoint] = useState<Point | null>(null);
  const [contextMenu, setContextMenu] = useState(false);
  const cancelInteraction = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    if (current && container.current?.hasPointerCapture(current.pointerId))
      container.current.releasePointerCapture(current.pointerId);
    setDrawing(null);
    setDrag(null);
    setPan(null);
    setMarquee(null);
    setPressed(false);
  }, [setDrawing]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancelInteraction();
        setContextMenu(false);
        setContextPoint(null);
        return;
      }
      const target = event.target;
      if (
        document.querySelector('dialog[open]') ||
        (target instanceof Element &&
          target.closest('input, textarea, select, [contenteditable="true"]'))
      )
        return;
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'a'
      ) {
        event.preventDefault();
        cancelInteraction();
        setContextMenu(false);
        onSelectMany(allSelectable(doc));
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return;
      if (event.key === '1' || event.key === '2') {
        event.preventDefault();
        cancelInteraction();
        setTool(event.key === '1' ? 'select' : 'pan');
        setContextMenu(false);
      }
    };
    window.addEventListener('keydown', keyboard);
    window.addEventListener('blur', cancelInteraction);
    return () => {
      window.removeEventListener('keydown', keyboard);
      window.removeEventListener('blur', cancelInteraction);
    };
  }, [cancelInteraction, doc, onSelectMany]);
  useEffect(() => {
    if (disabled || (wireStart && !doc.nodes.some((n) => n.id === wireStart)))
      cancelInteraction();
  }, [disabled, doc.nodes, wireStart, cancelInteraction]);
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
    const structure = `${doc.name}:${doc.components.length}`;
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
      drag?.items.some((item) => item.kind === kind && item.id === id)
        ? { x: point.x + drag.delta.x, y: point.y + drag.delta.y }
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
  const highlightedItems = marquee
    ? mergeSelection(
        marquee.base,
        selectionInBox(doc, routes, marquee.start, marquee.end),
      )
    : selectedItems;
  const selected = (kind: string, id: string) =>
    highlightedItems.some((item) => item.kind === kind && item.id === id);
  const targetAt = (event: {
    clientX: number;
    clientY: number;
  }):
    | ConnectionTarget
    | { kind: 'component'; id: string; point: Point }
    | null => {
    const point = world(screen(event));
    const hit = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-kind][data-id]');
    const kind = hit?.getAttribute('data-kind');
    const id = hit?.getAttribute('data-id');
    const target = connectionTarget(
      point,
      nodes,
      doc.wires,
      routes,
      view.scale,
      kind === 'wire' || kind === 'lead' ? (id ?? undefined) : undefined,
    );
    if (target?.kind === 'node') return target;
    if (kind === 'node' && id) {
      const n = nodes.find((n) => n.id === id);
      if (n) return { kind: 'node', id, point: n.position };
    }
    if (kind === 'component' && id) return { kind: 'component', id, point };
    return target;
  };
  const beginPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    setContextMenu(false);
    setContextPoint(null);
    const point = screen(event);
    const target = targetAt(event);
    const base = { pointerId: event.pointerId, start: point, moved: false };
    if (event.button === 1 || tool === 'pan') {
      event.preventDefault();
      gesture.current = {
        ...base,
        kind: 'pan',
        origin: { x: view.x, y: view.y },
      };
      setPan({ start: point, x: view.x, y: view.y });
    } else if (drawing.current && target?.kind !== 'component') {
      gesture.current = { ...base, kind: 'drawing' };
      onSelect(null);
    } else if (event.shiftKey && target) {
      const wire =
        target.kind === 'wire'
          ? doc.wires.find((w) => w.id === target.id)
          : undefined;
      const parent =
        target.kind === 'node'
          ? nodes.find((n) => n.id === target.id)?.terminal?.component
          : wire?.implicit
            ? wire.id.split('.')[0]
            : undefined;
      const item: SelectionItem = parent
        ? { kind: 'component', id: parent }
        : { kind: target.kind, id: target.id };
      onSelectMany(
        selected(item.kind, item.id)
          ? selectedItems.filter(
              (other) => other.kind !== item.kind || other.id !== item.id,
            )
          : mergeSelection(selectedItems, [item]),
      );
      event.preventDefault();
      return;
    } else if (target?.kind === 'node') {
      if (disabled) {
        select({ kind: 'node', id: target.id });
        return;
      }
      setDrawing(target.id);
      onSelect(null);
      gesture.current = { ...base, kind: 'node', node: target.id };
      setCursor(target.point);
    } else if (target?.kind === 'component') {
      setDrawing(null);
      const items = selectedItems.some(
        (item) => item.kind === 'component' && item.id === target.id,
      )
        ? selectedItems
        : [{ kind: 'component' as const, id: target.id }];
      onSelectMany(items);
      if (disabled) return;
      const c = components.find((c) => c.id === target.id)!;
      gesture.current = {
        ...base,
        kind: 'move',
        items,
        origin: c.position,
        worldStart: world(point),
      };
      setDrag({
        items,
        delta: { x: 0, y: 0 },
      });
    } else if (target?.kind === 'wire') {
      const w = doc.wires.find((w) => w.id === target.id)!;
      const item = {
        kind: w.implicit ? ('lead' as const) : ('wire' as const),
        id: w.id,
      };
      gesture.current = { ...base, kind: 'inspect', selection: item };
      select(item);
    } else {
      event.preventDefault();
      const baseItems = event.shiftKey ? selectedItems : [];
      onSelectMany(baseItems);
      gesture.current = {
        ...base,
        kind: 'box',
        worldStart: world(point),
        base: baseItems,
      };
    }
    setPressed(true);
    container.current?.setPointerCapture(event.pointerId);
  };
  const movedDelta = (
    g: Extract<Gesture, { kind: 'move' }>,
    point: Point,
  ): Point => {
    const pos = world(point);
    return {
      x:
        Math.round((g.origin.x + pos.x - g.worldStart.x) / 10) * 10 -
        g.origin.x,
      y:
        Math.round((g.origin.y + pos.y - g.worldStart.y) / 10) * 10 -
        g.origin.y,
    };
  };
  const finishConnection = (
    event: React.PointerEvent,
    addWaypoint: boolean,
  ) => {
    const from = drawing.current;
    if (!from || disabled) {
      setDrawing(null);
      return;
    }
    const point = screen(event);
    const target = targetAt(event);
    if (target?.kind === 'node') {
      if (target.id === from) {
        setDrawing(null);
        select({ kind: 'node', id: from });
      } else if (onWire(from, target.id)) setDrawing(null);
    } else if (target?.kind === 'wire') {
      if (onJoinWire(from, target.id, target.point)) setDrawing(null);
    } else if (
      addWaypoint &&
      !target &&
      point.x >= 0 &&
      point.x <= size.width &&
      point.y >= 0 &&
      point.y <= size.height
    ) {
      const pos = world(point);
      const next = onWirePoint(from, {
        x: Math.round(pos.x / 10) * 10,
        y: Math.round(pos.y / 10) * 10,
      });
      if (next) setDrawing(next);
    }
    setCursor(world(point));
  };
  const endPointer = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    const point = screen(event);
    const moved =
      g.moved || Math.hypot(point.x - g.start.x, point.y - g.start.y) >= 4;
    gesture.current = null;
    setPressed(false);
    setDrag(null);
    setPan(null);
    setMarquee(null);
    if (g.kind === 'move') {
      const delta = movedDelta(g, point);
      if (moved && (delta.x !== 0 || delta.y !== 0)) onMove(g.items, delta);
    } else if (g.kind === 'box') {
      if (moved)
        onSelectMany(
          mergeSelection(
            g.base,
            selectionInBox(doc, routes, g.worldStart, world(point)),
          ),
        );
    } else if (g.kind === 'node') {
      if (moved) finishConnection(event, false);
      else {
        setDrawing(null);
        select({ kind: 'node', id: g.node });
      }
    } else if (g.kind === 'drawing') finishConnection(event, true);
    else if (g.kind === 'pan')
      setView((v) => ({
        ...v,
        x: g.origin.x + point.x - g.start.x,
        y: g.origin.y + point.y - g.start.y,
      }));
    if (container.current?.hasPointerCapture(event.pointerId))
      container.current.releasePointerCapture(event.pointerId);
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
  const previewTarget =
    wireStart && cursor
      ? connectionTarget(cursor, nodes, doc.wires, routes, view.scale)
      : null;
  const previewEnd = previewTarget?.point ?? cursor;
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
              {
                key: 'select',
                title: 'Select',
                keycap: '1',
                icon: MousePointer2,
              },
              { key: 'pan', title: 'Pan', keycap: '2', icon: Hand },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              title={`${t.title} (${t.keycap})`}
              aria-label={t.title}
              aria-pressed={tool === t.key}
              className={tool === t.key ? 'active' : ''}
              onClick={() => {
                cancelInteraction();
                setTool(t.key);
              }}
            >
              <t.icon size={17} />
              <kbd>{t.keycap}</kbd>
            </button>
          ))}
        </div>
        <span className="canvas-caption">
          {wireStart
            ? `From ${wireStart} · click a node or wire to finish, empty space for a junction`
            : tool === 'pan'
              ? 'PAN · drag anywhere'
              : selectedItems.length > 1
                ? `${selectedItems.length} selected · drag a selected element to move · Delete to remove`
                : 'SELECT · drag empty canvas to box-select · middle-drag to pan'}
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
        className={`canvas tool-${tool} ${wireStart ? 'drawing-wire' : ''}`}
        ref={container}
        onDoubleClick={(event) => {
          if (
            tool !== 'select' ||
            disabled ||
            event.shiftKey ||
            (event.target as Element).closest(
              '.inspector-anchor, .canvas-context-menu',
            )
          )
            return;
          // Pointer capture sends click events to the canvas, so resolve the
          // component from the cursor rather than the event's captured target.
          const target = targetAt(event);
          if (target?.kind === 'component') {
            cancelInteraction();
            select({ kind: 'component', id: target.id });
            onRotate(target.id);
          }
        }}
        onContextMenu={(event) => {
          if ((event.target as Element).closest('.inspector-anchor')) return;
          event.preventDefault();
          cancelInteraction();
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
          const g = gesture.current;
          if (!g || g.pointerId !== event.pointerId) return;
          if (Math.hypot(point.x - g.start.x, point.y - g.start.y) >= 4)
            g.moved = true;
          if (g.kind === 'move' && g.moved)
            setDrag({
              items: g.items,
              delta: movedDelta(g, point),
            });
          if (g.kind === 'box' && g.moved)
            setMarquee({
              start: g.worldStart,
              end: world(point),
              base: g.base,
            });
          if (g.kind === 'pan')
            setView((v) => ({
              ...v,
              x: g.origin.x + point.x - g.start.x,
              y: g.origin.y + point.y - g.start.y,
            }));
        }}
        onPointerUp={endPointer}
        onPointerCancel={cancelInteraction}
        onLostPointerCapture={() => {
          if (gesture.current) cancelInteraction();
        }}
      >
        <svg
          className="schematic"
          role="img"
          aria-label={`${doc.name} schematic`}
          width={size.width}
          height={size.height}
          onPointerDown={beginPointer}
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
              const isSelected =
                selected(kind, w.id) ||
                (w.implicit && selected('component', w.id.split('.')[0]));
              const isTarget =
                previewTarget?.kind === 'wire' && previewTarget.id === w.id;
              const current = sample?.wireCurrents[w.id];
              const sign = direction * ((current ?? 0) < 0 ? -1 : 1);
              return (
                <g
                  key={w.id}
                  data-kind={kind}
                  data-id={w.id}
                  className={`circuit-wire ${isSelected ? 'selected' : ''} ${isTarget ? 'connection-target' : ''}`}
                  role="button"
                  aria-pressed={!!isSelected}
                  aria-label={
                    w.implicit ? `Inspect branch ${w.id}` : `Wire ${w.id}`
                  }
                  tabIndex={0}
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
                aria-pressed={selected('component', c.id)}
                tabIndex={0}
                aria-label={`Inspect ${c.id}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    select({ kind: 'component', id: c.id });
                }}
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
                className={`circuit-node ${n.terminal ? 'terminal-node' : ''} ${selected('node', n.id) || (n.terminal && selected('component', n.terminal.component)) || wireStart === n.id || (previewTarget?.kind === 'node' && previewTarget.id === n.id) ? 'selected' : ''}`}
                transform={`translate(${n.position.x} ${n.position.y})`}
                role="button"
                aria-pressed={
                  selected('node', n.id) ||
                  !!(n.terminal && selected('component', n.terminal.component))
                }
                aria-label={`Inspect node ${n.id}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') select({ kind: 'node', id: n.id });
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
            {wireStart &&
              previewEnd &&
              nodes.some((n) => n.id === wireStart) && (
                <g className="connection-preview" aria-label="Wire in progress">
                  <path
                    className="wire-preview"
                    d={route(getNode(wireStart), previewEnd)}
                  />
                  <circle
                    className="wire-preview-end"
                    cx={previewEnd.x}
                    cy={previewEnd.y}
                    r={5 / view.scale}
                  />
                </g>
              )}
            {marquee && (
              <rect
                className="selection-marquee"
                aria-label="Selection box"
                x={Math.min(marquee.start.x, marquee.end.x)}
                y={Math.min(marquee.start.y, marquee.end.y)}
                width={Math.abs(marquee.end.x - marquee.start.x)}
                height={Math.abs(marquee.end.y - marquee.start.y)}
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
        {anchor && !drag && !pan && !pressed && !wireStart && (
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
            {tool === 'pan'
              ? 'Drag anywhere to pan · 1: Select'
              : 'Box-select · Ctrl/⌘+A: all · Middle-drag: pan'}
          </span>
        </div>
      </div>
    </section>
  );
}
