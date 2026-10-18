import type { CircuitDocument } from '../model/types';
import { setProperty } from '../language/edit';

export async function autoLayout(doc: CircuitDocument): Promise<string> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();
  const graph = await elk.layout({
    id: 'circuit',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: [
      ...doc.nodes.map((n) => ({ id: `node:${n.id}`, width: 20, height: 20 })),
      ...doc.components.map((c) => ({
        id: `component:${c.id}`,
        width: 110,
        height: 90,
      })),
    ],
    edges: [
      ...doc.components.flatMap((c) =>
        c.nodes.map((n, i) => ({
          id: `${c.id}.${i}`,
          sources: [i % 2 ? `component:${c.id}` : `node:${n}`],
          targets: [i % 2 ? `node:${n}` : `component:${c.id}`],
        })),
      ),
      ...doc.wires.map((w) => ({
        id: w.id,
        sources: [`node:${w.from}`],
        targets: [`node:${w.to}`],
      })),
    ],
  });
  let source = doc.source;
  for (const child of graph.children ?? []) {
    const [kind, id] = child.id.split(':');
    const item =
      kind === 'node'
        ? doc.nodes.find((n) => n.id === id)
        : doc.components.find((c) => c.id === id);
    if (item)
      source = setProperty(
        source,
        item.line,
        'at',
        `(${Math.round((child.x ?? 0) + (child.width ?? 0) / 2 + 80)},${Math.round((child.y ?? 0) + (child.height ?? 0) / 2 + 80)})`,
      );
  }
  return source;
}
