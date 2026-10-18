import { describe, expect, it } from 'vitest';
import { parse } from '../src/language/parser';
import { deleteSelection, setProperty } from '../src/language/edit';
import { terminalPosition } from '../src/model/types';
import { autoLayout, orientComponents } from '../src/editor/layout';
import { componentBox, crossesBox, wireRoutes } from '../src/editor/routing';
import { examples } from '../src/model/examples';
import { simulate } from '../src/simulation/solver';

describe('permanently attached terminal nodes', () => {
  it('creates exactly P/N nodes without extra junctions or leads', () => {
    const parsed = parse(
      'resistor R1 resistance=1kOhm at=(200,300)\nreference R1.N',
    );
    expect(parsed.diagnostics).toEqual([]);
    const doc = parsed.document!;
    expect(doc.nodes.map((n) => n.id)).toEqual(['R1.P', 'R1.N']);
    expect(doc.nodes.map((n) => n.position)).toEqual([
      { x: 152, y: 300 },
      { x: 248, y: 300 },
    ]);
    expect(doc.wires).toEqual([]);
  });
  it('moves and rotates endpoint nodes with their owner while keeping their IDs and wires', () => {
    let source =
      'resistor R1 resistance=1kOhm at=(200,300)\nresistor R2 resistance=2kOhm\nwire W1 R1.P R2.N\nnode R1.P label="Input"\nreference R1.N';
    const c = parse(source).document!.components[0];
    source = setProperty(source, c.line, 'at', '(450,500)');
    source = setProperty(source, c.line, 'rotate', '90');
    const doc = parse(source).document!;
    expect(doc.nodes.find((n) => n.id === 'R1.P')?.position).toEqual({
      x: 450,
      y: 452,
    });
    expect(doc.nodes.find((n) => n.id === 'R1.N')?.position).toEqual({
      x: 450,
      y: 548,
    });
    expect(doc.nodes.find((n) => n.id === 'R1.P')?.label).toBe('Input');
    expect(doc.wires[0].from).toBe('R1.P');
  });
  it('supports terminal nodes in controls, reference selection, and voltage/current labels', () => {
    const parsed = parse(
      'voltage_source V1 dc=3V\nvcvs E1 control=(V1.P,V1.N) gain=2\nresistor R1 resistance=1kOhm\nwire W1 V1.N E1.N\nwire W2 E1.P R1.P\nwire W3 R1.N E1.N\nreference V1.N\nlabel voltage(E1.P) "Output"\nlabel current(R1.P) "Load"',
    );
    expect(parsed.diagnostics).toEqual([]);
    const result = simulate(parsed.document!);
    expect(result.samples[0].voltages['E1.P']).toBeCloseTo(6);
    expect(result.samples[0].currents.R1).toBeCloseTo(0.006);
  });
  it('rejects unknown terminal names and exposes attached op-amp input and output nodes', () => {
    expect(
      parse('resistor R1 resistance=1kOhm\nnode R1.P at=(0,0)\nreference R1.N')
        .document,
    ).toBeUndefined();
    expect(
      parse('resistor R1 resistance=1kOhm\nreference R1.Q').document,
    ).toBeUndefined();
    expect(
      parse('opamp U1\nreference U1.N').document?.nodes.map((n) => n.id),
    ).toEqual(['U1.INP', 'U1.INN', 'U1.P', 'U1.N']);
  });
  it('removes attached terminals, wires, and labels with a deleted element', () => {
    const doc = parse(examples.divider).document!;
    const next = parse(deleteSelection(doc, { kind: 'component', id: 'V1' }));
    expect(next.document).toBeDefined();
    expect(next.document!.nodes.some((n) => n.id.startsWith('V1.'))).toBe(
      false,
    );
    expect(
      next.document!.wires.some(
        (w) => w.from.startsWith('V1.') || w.to.startsWith('V1.'),
      ),
    ).toBe(false);
    expect(next.document!.reference).not.toMatch(/^V1\./);
  });
});

describe('orientation and routing', () => {
  it.each([
    examples.open,
    `${examples.divider}\nresistor R3 resistance=1kOhm\nwire W4 R3.P V1.P\n`,
  ])('arranges open and partially connected components', async (source) => {
    const doc = parse(source).document!;
    const arranged = await autoLayout(doc);
    expect(parse(arranged).document).toBeDefined();
    expect(arranged).toMatch(/resistor R[23].*rotate=/);
  });
  it('rotates terminals toward their connections without swapping their identity', () => {
    const doc = parse(
      'node left at=(100,200)\nnode right at=(500,200)\nresistor R1 (left,right) resistance=1kOhm at=(300,200) rotate=90\nreference left',
    ).document!;
    const [oriented] = orientComponents(doc, doc.components);
    expect(oriented.rotation).toBe(0);
    expect(oriented.nodes).toEqual(['R1.P', 'R1.N']);
  });
  it('routes around intervening component bodies using orthogonal segments', () => {
    const doc = parse(
      'resistor R1 resistance=1kOhm at=(200,200)\nresistor R2 resistance=1kOhm at=(500,200)\nresistor R3 resistance=1kOhm at=(350,200)\nwire W1 R1.N R2.P\nreference R1.P',
    ).document!;
    const path = wireRoutes(doc.nodes, doc.components, doc.wires).get('W1')!;
    expect(path.length).toBeGreaterThan(2);
    for (let i = 1; i < path.length; i++) {
      expect(path[i].x === path[i - 1].x || path[i].y === path[i - 1].y).toBe(
        true,
      );
      for (const c of doc.components)
        expect(crossesBox(path[i - 1], path[i], componentBox(c))).toBe(false);
    }
  });
  it('auto-arranges symbols and rotations while preserving simulation results and endpoint attachment', async () => {
    const before = parse(examples.divider).document!;
    const source = await autoLayout(before);
    const after = parse(source).document!;
    expect(after).toBeDefined();
    const a = simulate(before).samples[0];
    const b = simulate(after).samples[0];
    for (const c of after.components) {
      expect(b.currents[c.id]).toBeCloseTo(a.currents[c.id]!, 10);
      expect(source.split('\n')[c.line - 1]).toContain('rotate=');
      for (const [port, id] of c.nodes.entries())
        expect(after.nodes.find((n) => n.id === id)?.position).toEqual(
          terminalPosition(c, port),
        );
    }
  });
});
