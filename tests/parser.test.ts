import { describe, expect, it } from 'vitest';
import { parse, quantity } from '../src/language/parser';
import {
  declaration,
  deleteSelection,
  setAnnotation,
  setProperty,
} from '../src/language/edit';
import { examples } from '../src/model/examples';
import { decodeProject, project } from '../src/storage/projects';

describe('circuit language', () => {
  it.each(Object.entries(examples))('parses the %s example', (_, source) => {
    const parsed = parse(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.document).toBeDefined();
  });
  it.each([
    ['1kOhm', 1000],
    ['10uF', 1e-5],
    ['100ms', 0.1],
    ['1M', 1e6],
    ['2mA', 0.002],
    ['4.7e-9F', 4.7e-9],
    ['-3V', -3],
    ['3µF', 3e-6],
  ])('parses %s', (text, expected) =>
    expect(quantity(text as string)).toBeCloseTo(expected as number, 12),
  );
  it('rejects invalid units, dimensions, and nonfinite quantities', () => {
    expect(() => quantity('1kohm')).toThrow();
    expect(() => quantity('3A', 'V')).toThrow();
    expect(() => quantity('Infinity')).toThrow();
    expect(() => quantity('1e999V')).toThrow();
  });
  it('preserves quoted comment characters and reports line numbers', () => {
    const result = parse(
      `circuit "a # b // c"\nnode gnd label=${JSON.stringify('"ground"')}\nreference gnd\nresistor R1 (gnd,missing) resistance=1kOhm`,
    );
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        line: 4,
        message: expect.stringContaining('missing'),
      }),
    );
    expect(parse('circuit "a # b // c"').document?.name).toBe('a # b // c');
  });
  it('rejects duplicates, unknown parameters, missing controls, and invalid time settings', () => {
    expect(parse('node a\nnode a').document).toBeUndefined();
    expect(
      parse('node a\nnode b\nresistor R1 (a,b) resistance=1kOhm typo=3')
        .document,
    ).toBeUndefined();
    expect(
      parse('node a\nnode b\nvcvs E1 (a,b) gain=2').document,
    ).toBeUndefined();
    expect(
      parse('analysis transient stop=1s step=0s').document,
    ).toBeUndefined();
    expect(
      parse('analysis transient stop=1s step=1ns').document,
    ).toBeUndefined();
  });
  it('round trips visual edits without losing comments or unrelated formatting', () => {
    const source = examples.divider.replace(
      'resistance=2kOhm',
      'resistance=2kOhm # keep this comment',
    );
    const doc = parse(source).document!;
    const resistor = doc.components.find((c) => c.id === 'R1')!;
    const next = setProperty(source, resistor.line, 'resistance', '3kOhm');
    expect(next).toContain('resistance=3kOhm');
    expect(next).toContain('# keep this comment');
    expect(next.split('\n')[0]).toBe(source.split('\n')[0]);
    const moved = setProperty(next, resistor.line, 'at', '(330,200)');
    expect(
      parse(moved).document?.components.find((c) => c.id === 'R1')?.position,
    ).toEqual({ x: 330, y: 200 });
    const labeled = setAnnotation(
      parse(moved).document!,
      'current',
      'R1',
      'A "quoted" label',
    );
    expect(
      parse(labeled).document?.annotations.find((a) => a.target === 'R1')?.text,
    ).toBe('A "quoted" label');
  });
  it('deletes attached objects and dangling annotations when removing a node', () => {
    const doc = parse(examples.divider).document!;
    const next = deleteSelection(doc, { kind: 'node', id: 'V1.P' });
    expect(parse(next).document).toBeDefined();
    expect(parse(next).document?.components.map((c) => c.id)).toEqual([
      'R1',
      'R2',
    ]);
  });
  it('updates reference declarations and validates versioned project files', () => {
    expect(
      parse(declaration(examples.divider, 'reference', 'reference V1.P'))
        .document?.reference,
    ).toBe('V1.P');
    expect(decodeProject(JSON.stringify(project(examples.rc)))).toBe(
      examples.rc,
    );
    expect(decodeProject(examples.divider)).toBe(examples.divider);
    expect(() =>
      decodeProject('{"format":"circuit-studio","version":2,"source":""}'),
    ).toThrow();
    expect(() => decodeProject('bad syntax')).toThrow();
  });
  it('does not mistake parameter-like text inside a label for a parameter', () => {
    const source =
      'node a\nnode gnd\nreference gnd\nvoltage_source V1 (a,gnd) label="keep dc=3V here" dc=5V';
    const next = setProperty(source, 4, 'dc', '10V');
    expect(next).toContain('label="keep dc=3V here" dc=10V');
    expect(parse(next).document?.components[0].value).toBe(10);
  });
});
