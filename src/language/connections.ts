import type { CircuitDocument, Point } from '../model/types';
import { replaceLine } from './edit';
import { splitComment } from './parser';

function identifiers(doc: CircuitDocument) {
  const used = new Set(
    [...doc.nodes, ...doc.components, ...doc.wires].map((item) => item.id),
  );
  return (prefix: string) => {
    let index = 1;
    while (used.has(`${prefix}${index}`)) index++;
    const id = `${prefix}${index}`;
    used.add(id);
    return id;
  };
}
function ensureNode(doc: CircuitDocument, id: string) {
  if (!doc.nodes.some((node) => node.id === id))
    throw new Error(`Node “${id}” no longer exists.`);
}
function coordinates(point: Point): string {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new Error('Junction position must be finite.');
  return `(${Math.round(point.x * 1e6) / 1e6},${Math.round(point.y * 1e6) / 1e6})`;
}
export function connectNodes(doc: CircuitDocument, from: string, to: string) {
  ensureNode(doc, from);
  ensureNode(doc, to);
  if (from === to) throw new Error('Choose another node to complete the wire.');
  const existing = doc.wires.find(
    (w) => (w.from === from && w.to === to) || (w.from === to && w.to === from),
  );
  if (existing) return { source: doc.source, wireId: existing.id };
  const wireId = identifiers(doc)('W');
  return {
    source: `${doc.source.trimEnd()}\nwire ${wireId} ${from} ${to}\n`,
    wireId,
  };
}

/** One source edit makes a connected waypoint and a new wire, so undo is atomic. */
export function continueWire(doc: CircuitDocument, from: string, point: Point) {
  ensureNode(doc, from);
  const next = identifiers(doc);
  const nodeId = next('n');
  const wireId = next('W');
  return {
    nodeId,
    wireId,
    source: `${doc.source.trimEnd()}\nnode ${nodeId} at=${coordinates(point)}\nwire ${wireId} ${from} ${nodeId}\n`,
  };
}

/** Preserve both halves of the tapped branch, then attach the incoming wire. */
export function connectToWire(
  doc: CircuitDocument,
  from: string,
  wireId: string,
  point: Point,
) {
  ensureNode(doc, from);
  const wire = doc.wires.find((w) => w.id === wireId);
  if (!wire) throw new Error(`Wire “${wireId}” no longer exists.`);
  const next = identifiers(doc);
  const nodeId = next('n');
  const continuationId = next('W');
  const branchId = next('W');
  let source = doc.source;
  if (wire.implicit) {
    const [componentId, index] = wire.id.split('.');
    const component = doc.components.find((c) => c.id === componentId)!;
    const bindings = [...component.bindings];
    bindings[Number(index)] = nodeId;
    const body = splitComment(source.split('\n')[component.line - 1])[0].trim();
    const pattern = new RegExp(
      `^(${component.kind}\\s+${component.id})(?:\\s*\\([^)]*\\))?(.*)$`,
    );
    source = replaceLine(
      source,
      component.line,
      body.replace(
        pattern,
        (_, head, tail) => `${head} (${bindings.join(',')})${tail}`,
      ),
    );
    source = `${source.trimEnd()}\nnode ${nodeId} at=${coordinates(point)}\nwire ${continuationId} ${wire.from} ${nodeId}\n`;
  } else {
    const body = splitComment(source.split('\n')[wire.line - 1])[0].trim();
    source = replaceLine(
      source,
      wire.line,
      body.replace(/^(wire\s+\S+\s+\S+\s+)\S+/, `$1${nodeId}`),
    );
    source = `${source.trimEnd()}\nnode ${nodeId} at=${coordinates(point)}\nwire ${continuationId} ${nodeId} ${wire.to}\n`;
  }
  source += `wire ${branchId} ${from} ${nodeId}\n`;
  return { source, nodeId, wireId: branchId };
}
