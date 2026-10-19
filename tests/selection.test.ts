import { describe, expect, it } from 'vitest';
import { allSelectable, selectionInBox } from '../src/editor/selection';
import { wireRoutes } from '../src/editor/routing';
import { deleteSelections, moveSelections } from '../src/language/edit';
import { parse } from '../src/language/parser';
import { terminalPosition } from '../src/model/types';

const source = `circuit "Bulk selection"
resistor R1 resistance=1kOhm at=(200,200)
resistor R2 resistance=2kOhm at=(400,200)
resistor R3 resistance=3kOhm at=(650,400)
node tap at=(300,200)
wire W1 R1.N tap
wire W2 tap R2.P
wire W3 R2.N R3.P
reference R3.N
label current(R1) "Branch current"
`;
function document(text: string) {
  const result = parse(text);
  if (!result.document) throw new Error(JSON.stringify(result.diagnostics));
  return result.document;
}
const doc = document(source);
const routes = wireRoutes(doc.nodes, doc.components, doc.wires);
const start = { x: 120, y: 120 };
const end = { x: 480, y: 280 };

describe('bulk selection', () => {
  it('selects enclosed elements, standalone nodes, and whole routed wires in either drag direction', () => {
    const items = selectionInBox(doc, routes, start, end);
    expect(items).toEqual([
      { kind: 'component', id: 'R1' },
      { kind: 'component', id: 'R2' },
      { kind: 'node', id: 'tap' },
      { kind: 'wire', id: 'W1' },
      { kind: 'wire', id: 'W2' },
    ]);
    expect(selectionInBox(doc, routes, end, start)).toEqual(items);
    expect(
      selectionInBox(doc, routes, { x: 190, y: 190 }, { x: 210, y: 210 }),
    ).toEqual([]);
  });
  it('selects attached terminals and legacy leads through their parent without duplicate identities', () => {
    const legacy = document(
      'node gnd\nresistor R1 (gnd,gnd) resistance=1kOhm\nreference gnd',
    );
    expect(allSelectable(legacy)).toEqual([
      { kind: 'component', id: 'R1' },
      { kind: 'node', id: 'gnd' },
    ]);
  });
  it('moves a group by a shared delta, preserves wiring, and never detaches a terminal', () => {
    const items = selectionInBox(doc, routes, start, end);
    const next = document(
      moveSelections(doc, [...items, { kind: 'node', id: 'R1.N' }], {
        x: 40,
        y: 30,
      }),
    );
    expect(next.components.map((c) => c.position)).toEqual([
      { x: 240, y: 230 },
      { x: 440, y: 230 },
      { x: 650, y: 400 },
    ]);
    expect(next.nodes.find((n) => n.id === 'tap')?.position).toEqual({
      x: 340,
      y: 230,
    });
    expect(next.nodes.find((n) => n.id === 'R1.N')?.position).toEqual(
      terminalPosition(next.components[0], 1),
    );
    expect(next.wires).toEqual(doc.wires);
    expect(next.annotations).toEqual(doc.annotations);
  });
  it('deletes a group with connected wires and annotations while preserving the remaining circuit', () => {
    const next = document(
      deleteSelections(doc, selectionInBox(doc, routes, start, end)),
    );
    expect(next.components.map((c) => c.id)).toEqual(['R3']);
    expect(next.nodes.map((n) => n.id)).toEqual(['R3.P', 'R3.N']);
    expect(next.wires).toEqual([]);
    expect(next.annotations).toEqual([]);
    expect(next.reference).toBe('R3.N');
    const empty = document(deleteSelections(doc, allSelectable(doc)));
    expect(empty.components).toEqual([]);
    expect(empty.nodes).toEqual([]);
    expect(empty.wires).toEqual([]);
  });
});
