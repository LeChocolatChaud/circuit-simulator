import { describe, expect, it } from 'vitest';
import {
  connectNodes,
  connectToWire,
  continueWire,
} from '../src/language/connections';
import { parse } from '../src/language/parser';
import { connectionTarget, projectOntoPath } from '../src/editor/hitTesting';
import { simulate } from '../src/simulation/solver';
import { examples } from '../src/model/examples';

const source = `circuit "Parallel tap"
voltage_source V1 dc=10V
resistor R1 resistance=1kOhm
resistor R2 resistance=1kOhm
wire W1 V1.P R1.P label="Supply feed" # preserve this comment
wire W2 R1.N V1.N
wire W3 R2.N V1.N
reference V1.N
label current(W1) "Feed current"
analysis dc
`;
function document(text: string) {
  const parsed = parse(text);
  if (!parsed.document) throw new Error(JSON.stringify(parsed.diagnostics));
  return parsed.document;
}

describe('wire editing', () => {
  it('adds each intermediate junction and its incoming segment as one valid edit', () => {
    const initial = document(examples.divider);
    const first = continueWire(initial, 'R1.P', { x: 300, y: 100 });
    const doc = document(first.source);
    expect(doc.nodes.find((n) => n.id === first.nodeId)?.position).toEqual({
      x: 300,
      y: 100,
    });
    expect(doc.wires.find((w) => w.id === first.wireId)).toMatchObject({
      from: 'R1.P',
      to: first.nodeId,
    });
    const second = continueWire(doc, first.nodeId, { x: 500, y: 100 });
    const finished = document(
      connectNodes(document(second.source), second.nodeId, 'R2.P').source,
    );
    expect(finished.wires).toHaveLength(initial.wires.length + 3);
    expect(finished.wires.find((w) => w.id === second.wireId)?.from).toBe(
      first.nodeId,
    );
    expect(second.nodeId).not.toBe(first.nodeId);
  });
  it('splits the chosen wire and connects the incoming branch without losing either endpoint', () => {
    const edit = connectToWire(document(source), 'R2.P', 'W1', {
      x: 300.123456789,
      y: 100,
    });
    const doc = document(edit.source);
    expect(doc.wires.find((w) => w.id === 'W1')).toMatchObject({
      from: 'V1.P',
      to: edit.nodeId,
      label: 'Supply feed',
    });
    expect(
      doc.wires.some((w) => w.from === edit.nodeId && w.to === 'R1.P'),
    ).toBe(true);
    expect(doc.wires.find((w) => w.id === edit.wireId)).toMatchObject({
      from: 'R2.P',
      to: edit.nodeId,
    });
    expect(doc.nodes.find((n) => n.id === edit.nodeId)?.position.x).toBe(
      300.123457,
    );
    expect(edit.source).toContain('# preserve this comment');
    expect(doc.annotations.find((a) => a.target === 'W1')?.text).toBe(
      'Feed current',
    );
    const sample = simulate(doc).samples[0];
    expect(sample.currents.R1).toBeCloseTo(0.01, 10);
    expect(sample.currents.R2).toBeCloseTo(0.01, 10);
    expect(sample.currents.V1).toBeCloseTo(-0.02, 10);
    expect(sample.wireCurrents.W1).toBeCloseTo(0.02, 10);
  });
  it('can tap a legacy implicit lead by rebinding its component through the new junction', () => {
    const doc = document(
      'node supply\nnode gnd\nvoltage_source V1 (supply,gnd) dc=10V\nresistor R1 (supply,gnd) resistance=1kOhm # model note\nresistor R2 resistance=1kOhm\nwire W1 R2.N gnd\nreference gnd',
    );
    const edit = connectToWire(doc, 'R2.P', 'R1.0', { x: 200, y: 180 });
    const next = document(edit.source);
    expect(next.components.find((c) => c.id === 'R1')?.bindings).toEqual([
      edit.nodeId,
      'gnd',
    ]);
    expect(edit.source).toContain('# model note');
    expect(next.wires.find((w) => w.id === 'R1.0')?.from).toBe(edit.nodeId);
    expect(
      next.wires.some((w) => w.from === 'supply' && w.to === edit.nodeId),
    ).toBe(true);
    const result = simulate(next);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual(
      [],
    );
    expect(result.samples[0].currents.R2).toBeCloseTo(0.01, 10);
  });
  it('leaves unrelated wires and crossings disconnected when a branch is split', () => {
    const doc = document(`${source}\nwire W4 R2.P R2.N\n`);
    const next = document(
      connectToWire(doc, 'R2.N', 'W1', { x: 250, y: 250 }).source,
    );
    expect(next.wires.find((w) => w.id === 'W4')).toMatchObject({
      from: 'R2.P',
      to: 'R2.N',
    });
  });
  it('reuses existing direct connections and rejects stale or identical endpoints', () => {
    const doc = document(source);
    expect(connectNodes(doc, 'R1.P', 'V1.P')).toEqual({
      source: doc.source,
      wireId: 'W1',
    });
    expect(() => connectNodes(doc, 'V1.P', 'V1.P')).toThrow('another node');
    expect(() => continueWire(doc, 'missing', { x: 0, y: 0 })).toThrow(
      'no longer exists',
    );
    expect(() => connectToWire(doc, 'R2.P', 'missing', { x: 0, y: 0 })).toThrow(
      'no longer exists',
    );
  });
});

describe('connection hit testing', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  it('projects onto actual segments and corners of a routed wire', () => {
    expect(projectOntoPath({ x: 60, y: 4 }, path)).toEqual({
      point: { x: 60, y: 0 },
      distance: 4,
    });
    expect(projectOntoPath({ x: 104, y: 60 }, path)).toEqual({
      point: { x: 100, y: 60 },
      distance: 4,
    });
    expect(projectOntoPath({ x: 105, y: -5 }, path).point).toEqual({
      x: 100,
      y: 0,
    });
  });
  it('prioritizes an existing junction over inserting a coincident node on a wire', () => {
    const doc = document(
      'node a at=(0,0)\nnode junction at=(60,0)\nnode b at=(100,100)\nwire W1 a b\nreference a',
    );
    const routes = new Map([['W1', path]]);
    expect(
      connectionTarget({ x: 61, y: 2 }, doc.nodes, doc.wires, routes, 1),
    ).toMatchObject({ kind: 'node', id: 'junction' });
    expect(
      connectionTarget({ x: 104, y: 60 }, doc.nodes, doc.wires, routes, 1),
    ).toMatchObject({ kind: 'wire', id: 'W1', point: { x: 100, y: 60 } });
    expect(
      connectionTarget({ x: 30, y: 40 }, doc.nodes, doc.wires, routes, 1),
    ).toBeNull();
    expect(
      connectionTarget({ x: 100, y: 65 }, doc.nodes, doc.wires, routes, 0.25),
    ).toMatchObject({ kind: 'node', id: 'b' });
  });
});
