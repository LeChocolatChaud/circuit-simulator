import type { CircuitNode, Point, Wire } from '../model/types';

export function projectOntoPath(
  point: Point,
  path: Point[],
): { point: Point; distance: number } {
  let best = { point: path[0] ?? point, distance: Infinity };
  for (let index = 0; index < Math.max(1, path.length - 1); index++) {
    const a = path[index];
    const b = path[index + 1] ?? a;
    if (!a) break;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared
      ? Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
          ),
        )
      : 0;
    const projected = { x: a.x + ratio * dx, y: a.y + ratio * dy };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distance < best.distance) best = { point: projected, distance };
  }
  return best;
}
export type ConnectionTarget = {
  kind: 'node' | 'wire';
  id: string;
  point: Point;
};
/** Screen-sized hit tolerances keep terminals usable when the circuit is zoomed out. */
export function connectionTarget(
  point: Point,
  nodes: CircuitNode[],
  wires: Wire[],
  routes: Map<string, Point[]>,
  scale: number,
  preferredWire?: string,
): ConnectionTarget | null {
  let node: CircuitNode | undefined;
  let nearest = Infinity;
  for (const candidate of nodes) {
    const distance =
      Math.hypot(
        candidate.position.x - point.x,
        candidate.position.y - point.y,
      ) * scale;
    if (distance <= Math.max(10, 7 * scale) && distance < nearest) {
      node = candidate;
      nearest = distance;
    }
  }
  if (node) return { kind: 'node', id: node.id, point: node.position };
  let wire: ConnectionTarget | null = null;
  nearest = Infinity;
  for (const candidate of wires) {
    const projected = projectOntoPath(point, routes.get(candidate.id) ?? []);
    const distance = projected.distance * scale;
    if (
      distance <= (candidate.id === preferredWire ? 24 : 9) &&
      (candidate.id === preferredWire || distance < nearest)
    ) {
      wire = { kind: 'wire', id: candidate.id, point: projected.point };
      nearest = distance;
      if (candidate.id === preferredWire) break;
    }
  }
  return wire;
}
