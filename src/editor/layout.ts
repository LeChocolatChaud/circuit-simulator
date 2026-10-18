import type { CircuitDocument, Component } from '../model/types';
import { terminalPosition } from '../model/types';
import { setProperty } from '../language/edit';
import { attachedNodes, terminalNormal } from './routing';

/** Choose terminal-facing orientations without swapping the electrical P/N identities. */
export function orientComponents(
  doc: CircuitDocument,
  components: Component[],
  junctions = doc.nodes,
): Component[] {
  const result = components.map((c) => ({ ...c }));
  for (let pass = 0; pass < 3; pass++) {
    for (let index = 0; index < result.length; index++) {
      const component = result[index];
      const nodes = new Map(
        attachedNodes(junctions, result).map((n) => [n.id, n]),
      );
      const links = doc.wires.filter(
        (w) =>
          component.nodes.includes(w.from) || component.nodes.includes(w.to),
      );
      if (!links.length) continue;
      let best = component.rotation;
      let bestCost = Infinity;
      for (const rotation of [component.rotation, 0, 90, 180, 270]) {
        const candidate = { ...component, rotation };
        let cost = rotation === component.rotation ? -0.01 : 0;
        for (const wire of links) {
          const port = component.nodes.indexOf(
            component.nodes.includes(wire.from) ? wire.from : wire.to,
          );
          const other = nodes.get(
            wire.from === component.nodes[port] ? wire.to : wire.from,
          )!;
          const point = terminalPosition(candidate, port);
          const normal = terminalNormal(candidate, port);
          const dx = other.position.x - point.x;
          const dy = other.position.y - point.y;
          cost +=
            Math.abs(dx) +
            Math.abs(dy) +
            Math.max(0, -(dx * normal.x + dy * normal.y)) * 3;
          if (other.terminal && other.terminal.component !== component.id) {
            const peer = result.find(
              (c) => c.id === other.terminal!.component,
            )!;
            const peerNormal = terminalNormal(peer, other.terminal.port);
            cost += Math.max(0, dx * peerNormal.x + dy * peerNormal.y) * 2;
          }
        }
        if (cost < bestCost) {
          bestCost = cost;
          best = rotation;
        }
      }
      result[index] = { ...component, rotation: best };
    }
  }
  return result;
}

export async function autoLayout(doc: CircuitDocument): Promise<string> {
  if (!doc.nodes.length && !doc.components.length) return doc.source;
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();
  const endpoint = (id: string) => {
    const terminal = doc.nodes.find((n) => n.id === id)?.terminal;
    return terminal ? `component:${terminal.component}` : `node:${id}`;
  };
  const graph = await elk.layout({
    id: 'circuit',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '70',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.randomSeed': '1',
    },
    children: [
      ...doc.nodes
        .filter((n) => !n.terminal)
        .map((n) => ({ id: `node:${n.id}`, width: 20, height: 20 })),
      ...doc.components.map((c) => ({
        id: `component:${c.id}`,
        width: 160,
        height: 160,
      })),
    ],
    edges: doc.wires.map((w) => ({
      id: w.id,
      sources: [endpoint(w.from)],
      targets: [endpoint(w.to)],
    })),
  });
  const placements = new Map(
    (graph.children ?? []).map((child) => [
      child.id,
      {
        x: Math.round((child.x ?? 0) + (child.width ?? 0) / 2 + 60),
        y: Math.round((child.y ?? 0) + (child.height ?? 0) / 2 + 60),
      },
    ]),
  );
  const junctions = doc.nodes.map((n) =>
    n.terminal
      ? n
      : { ...n, position: placements.get(`node:${n.id}`) ?? n.position },
  );
  const components = orientComponents(
    doc,
    doc.components.map((c) => ({
      ...c,
      position: placements.get(`component:${c.id}`) ?? c.position,
    })),
    junctions,
  );
  let source = doc.source;
  for (const node of junctions)
    if (!node.terminal && node.line > 0)
      source = setProperty(
        source,
        node.line,
        'at',
        `(${node.position.x},${node.position.y})`,
      );
  for (const c of components) {
    source = setProperty(
      source,
      c.line,
      'at',
      `(${c.position.x},${c.position.y})`,
    );
    source = setProperty(source, c.line, 'rotate', String(c.rotation));
  }
  return source;
}
