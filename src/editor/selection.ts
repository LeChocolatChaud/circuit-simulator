import type { CircuitDocument, Point, SelectionItem } from '../model/types';

export function selectionExists(doc: CircuitDocument, item: SelectionItem) {
  if (item.kind === 'component')
    return doc.components.some((c) => c.id === item.id);
  if (item.kind === 'node') return doc.nodes.some((n) => n.id === item.id);
  return doc.wires.some((w) => w.id === item.id);
}

/** Attached terminals and implicit leads belong to their element in bulk selection. */
export function allSelectable(doc: CircuitDocument): SelectionItem[] {
  return [
    ...doc.components.map((c) => ({ kind: 'component' as const, id: c.id })),
    ...doc.nodes
      .filter((n) => !n.terminal)
      .map((n) => ({ kind: 'node' as const, id: n.id })),
    ...doc.wires
      .filter((w) => !w.implicit)
      .map((w) => ({ kind: 'wire' as const, id: w.id })),
  ];
}

export function mergeSelection(base: SelectionItem[], added: SelectionItem[]) {
  const items = new Map(base.map((item) => [`${item.kind}:${item.id}`, item]));
  for (const item of added) items.set(`${item.kind}:${item.id}`, item);
  return [...items.values()];
}

/** Enclose the whole symbol or routed wire; direction of the drag is irrelevant. */
export function selectionInBox(
  doc: CircuitDocument,
  routes: Map<string, Point[]>,
  start: Point,
  end: Point,
): SelectionItem[] {
  const contains = (point: Point) =>
    point.x >= Math.min(start.x, end.x) &&
    point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) &&
    point.y <= Math.max(start.y, end.y);
  return allSelectable(doc).filter((item) => {
    if (item.kind === 'component') {
      const { position } = doc.components.find((c) => c.id === item.id)!;
      return (
        contains({ x: position.x - 58, y: position.y - 49 }) &&
        contains({ x: position.x + 58, y: position.y + 49 })
      );
    }
    if (item.kind === 'node')
      return contains(doc.nodes.find((n) => n.id === item.id)!.position);
    const path = routes.get(item.id);
    return !!path?.length && path.every(contains);
  });
}
