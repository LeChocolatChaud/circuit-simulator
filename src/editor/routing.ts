import {
  terminalPosition,
  type CircuitNode,
  type Component,
  type Point,
  type Wire,
} from '../model/types';

export function terminalNormal(
  c: Pick<Component, 'kind' | 'position' | 'rotation'>,
  port: number,
): Point {
  const local =
    c.kind === 'opamp' && port === 3
      ? { x: 0, y: 1 }
      : {
          x: c.kind === 'opamp' ? (port === 2 ? 1 : -1) : port === 0 ? -1 : 1,
          y: 0,
        };
  const angle = (c.rotation * Math.PI) / 180;
  return {
    x: Math.round(local.x * Math.cos(angle) - local.y * Math.sin(angle)),
    y: Math.round(local.x * Math.sin(angle) + local.y * Math.cos(angle)),
  };
}
type Box = { left: number; right: number; top: number; bottom: number };
export function componentBox(c: Component): Box {
  const points = (
    c.kind === 'opamp'
      ? [
          { x: -34, y: -42 },
          { x: 34, y: 42 },
        ]
      : [
          { x: -30, y: -25 },
          { x: 30, y: 25 },
        ]
  ).map((p) => {
    const a = (c.rotation * Math.PI) / 180;
    return {
      x: c.position.x + p.x * Math.cos(a) - p.y * Math.sin(a),
      y: c.position.y + p.x * Math.sin(a) + p.y * Math.cos(a),
    };
  });
  return {
    left: Math.min(...points.map((p) => p.x)) - 6,
    right: Math.max(...points.map((p) => p.x)) + 6,
    top: Math.min(...points.map((p) => p.y)) - 6,
    bottom: Math.max(...points.map((p) => p.y)) + 6,
  };
}
export function crossesBox(a: Point, b: Point, box: Box): boolean {
  return a.y === b.y
    ? a.y > box.top &&
        a.y < box.bottom &&
        Math.max(a.x, b.x) > box.left &&
        Math.min(a.x, b.x) < box.right
    : a.x > box.left &&
        a.x < box.right &&
        Math.max(a.y, b.y) > box.top &&
        Math.min(a.y, b.y) < box.bottom;
}
function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const p of points) {
    if (result.at(-1)?.x === p.x && result.at(-1)?.y === p.y) continue;
    const a = result.at(-2);
    const b = result.at(-1);
    if (
      a &&
      b &&
      ((a.x === b.x && b.x === p.x && (b.y - a.y) * (p.y - b.y) >= 0) ||
        (a.y === b.y && b.y === p.y && (b.x - a.x) * (p.x - b.x) >= 0))
    )
      result.pop();
    result.push(p);
  }
  return result;
}
function intersectionCost(a: Point, b: Point, c: Point, d: Point): number {
  if (a.y === b.y && c.x === d.x)
    return c.x > Math.min(a.x, b.x) &&
      c.x < Math.max(a.x, b.x) &&
      a.y > Math.min(c.y, d.y) &&
      a.y < Math.max(c.y, d.y)
      ? 28
      : 0;
  if (a.x === b.x && c.y === d.y) return intersectionCost(c, d, a, b);
  if (a.y === b.y && c.y === d.y && a.y === c.y)
    return (
      Math.max(
        0,
        Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
          Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)),
      ) * 2
    );
  if (a.x === b.x && c.x === d.x && a.x === c.x)
    return (
      Math.max(
        0,
        Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
          Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)),
      ) * 2
    );
  return 0;
}
/** Select an orthogonal path with outward terminal stubs, avoiding symbol bodies. */
export function wireRoutes(
  nodes: CircuitNode[],
  components: Component[],
  wires: Wire[],
): Map<string, Point[]> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const componentMap = new Map(components.map((c) => [c.id, c]));
  const boxes = components.map(componentBox);
  const routed: Point[][] = [];
  const routes = new Map<string, Point[]>();
  const stub = (n: CircuitNode): Point => {
    if (!n.terminal) return n.position;
    const normal = terminalNormal(
      componentMap.get(n.terminal.component)!,
      n.terminal.port,
    );
    return { x: n.position.x + normal.x * 22, y: n.position.y + normal.y * 22 };
  };
  for (const wire of wires) {
    const from = nodeMap.get(wire.from)!;
    const to = nodeMap.get(wire.to)!;
    if (
      from.position.x === to.position.x &&
      from.position.y === to.position.y
    ) {
      routes.set(wire.id, [from.position]);
      continue;
    }
    const a = stub(from);
    const b = stub(to);
    const candidates: Point[][] = [
      [a, { x: b.x, y: a.y }, b],
      [a, { x: a.x, y: b.y }, b],
    ];
    const xs = new Set([
      (a.x + b.x) / 2,
      ...boxes.flatMap((box) => [box.left - 18, box.right + 18]),
    ]);
    const ys = new Set([
      (a.y + b.y) / 2,
      ...boxes.flatMap((box) => [box.top - 18, box.bottom + 18]),
    ]);
    for (const x of xs) candidates.push([a, { x, y: a.y }, { x, y: b.y }, b]);
    for (const y of ys) candidates.push([a, { x: a.x, y }, { x: b.x, y }, b]);
    let best: Point[] = [];
    let bestScore = Infinity;
    for (const candidate of candidates) {
      const path = simplify([from.position, ...candidate, to.position]);
      let score = path.length * 12;
      for (let i = 1; i < path.length; i++) {
        const p = path[i - 1];
        const q = path[i];
        score += Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
        for (const box of boxes) if (crossesBox(p, q, box)) score += 10000;
        for (const old of routed)
          for (let j = 1; j < old.length; j++)
            score += intersectionCost(p, q, old[j - 1], old[j]);
      }
      if (score < bestScore) {
        best = path;
        bestScore = score;
      }
    }
    routes.set(wire.id, best);
    routed.push(best);
  }
  return routes;
}
export function pathData(points: Point[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
}
export function pathCenter(points: Point[]): {
  point: Point;
  horizontal: boolean;
  direction: number;
} {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y));
  let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i] > 0) {
      const a = points[i];
      const b = points[i + 1];
      const ratio = remaining / lengths[i];
      return {
        point: { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio },
        horizontal: a.y === b.y,
        direction: Math.sign(b.x - a.x || b.y - a.y),
      };
    }
    remaining -= lengths[i];
  }
  return { point: points[0] ?? { x: 0, y: 0 }, horizontal: true, direction: 1 };
}
export function attachedNodes(
  nodes: CircuitNode[],
  components: Component[],
): CircuitNode[] {
  const map = new Map(components.map((c) => [c.id, c]));
  return nodes.map((n) =>
    n.terminal
      ? {
          ...n,
          position: terminalPosition(
            map.get(n.terminal.component)!,
            n.terminal.port,
          ),
        }
      : n,
  );
}
