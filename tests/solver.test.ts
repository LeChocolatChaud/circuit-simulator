import { describe, expect, it } from 'vitest';
import { parse } from '../src/language/parser';
import { simulate } from '../src/simulation/solver';
import { solveLinear } from '../src/simulation/matrix';
import { examples } from '../src/model/examples';
import type { CircuitDocument } from '../src/model/types';

function document(source: string): CircuitDocument {
  const parsed = parse(source);
  if (!parsed.document) throw new Error(JSON.stringify(parsed.diagnostics));
  return parsed.document;
}
function run(source: string) {
  const result = simulate(document(source));
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(result.samples.length).toBeGreaterThan(0);
  return result;
}
function circuit(body: string) {
  return `node a\nnode b\nnode gnd\nreference gnd\n${body}\nanalysis dc`;
}

describe('linear solver', () => {
  it('distinguishes unique values, free variables, and inconsistent constraints', () => {
    const result = solveLinear([[1, -1]], [3], 2);
    expect(result.evaluate([1, 0])).toBeNull();
    expect(result.evaluate([1, -1])).toBeCloseTo(3);
    expect(solveLinear([[1], [1]], [2, 3], 1).inconsistent).toBe(true);
  });
  it('scales equations with very different magnitudes', () => {
    const result = solveLinear(
      [
        [1e-9, 0],
        [0, 1e9],
      ],
      [2e-9, 3e9],
      2,
    );
    expect(result.evaluate([1, 0])).toBeCloseTo(2);
    expect(result.evaluate([0, 1])).toBeCloseTo(3);
  });
});

describe('DC and measurement conventions', () => {
  it('solves a divider, signed power, wire direction, and power balance', () => {
    const sample = run(examples.divider).samples[0];
    expect(sample.voltages['R1.N']).toBeCloseTo(4);
    expect(sample.currents.R1).toBeCloseTo(0.004);
    expect(sample.currents.R2).toBeCloseTo(0.004);
    expect(sample.currents.V1).toBeCloseTo(-0.004);
    expect(sample.powers.V1).toBeCloseTo(-0.048);
    expect(sample.powers.R1).toBeCloseTo(0.032);
    expect(sample.wireCurrents.W1).toBeCloseTo(-0.004);
    expect(
      Object.values(sample.powers).reduce<number>((sum, p) => sum + p!, 0),
    ).toBeCloseTo(0, 12);
    expect(sample.residual).toBeLessThan(1e-10);
  });
  it('changing reference shifts voltages and preserves currents and power', () => {
    const doc = document(examples.divider);
    const first = simulate(doc).samples[0];
    const second = simulate({ ...doc, reference: 'V1.P' }).samples[0];
    expect(second.voltages['R1.N']).toBeCloseTo(-8);
    expect(second.voltages['V1.N']).toBeCloseTo(-12);
    for (const c of doc.components) {
      expect(second.currents[c.id]).toBeCloseTo(first.currents[c.id]!);
      expect(second.powers[c.id]).toBeCloseTo(first.powers[c.id]!);
    }
  });
  it.each([
    ['vcvs E1 (b,gnd) gain=2 control=(a,gnd)', 6, 'E1', -0.006],
    ['vccs G1 (b,gnd) gain=1mS control=(a,gnd)', -3, 'G1', 0.003],
    ['ccvs H1 (b,gnd) gain=1kOhm control=V1', -3, 'H1', 0.003],
    ['cccs F1 (b,gnd) gain=2 control=V1', 6, 'F1', -0.006],
  ])('supports %s', (element, voltage, id, current) => {
    const sample = run(
      circuit(
        `voltage_source V1 (a,gnd) dc=3V\nresistor R1 (a,gnd) resistance=1kOhm\n${element}\nresistor R2 (b,gnd) resistance=1kOhm`,
      ),
    ).samples[0];
    expect(sample.voltages.b).toBeCloseTo(voltage as number);
    expect(sample.currents[id as string]).toBeCloseTo(current as number);
  });
  it('supports an independent current source', () => {
    const sample = run(
      circuit(
        'current_source I1 (gnd,a) dc=2mA\nresistor R1 (a,gnd) resistance=1kOhm',
      ),
    ).samples[0];
    expect(sample.voltages.a).toBeCloseTo(2);
    expect(sample.powers.I1).toBeCloseTo(-0.004);
  });
  it('supports identifiers that coincide with object prototype property names', () => {
    const sample = run(
      'node __proto__\nnode gnd\nreference gnd\nvoltage_source constructor (__proto__,gnd) dc=2V\nresistor toString (__proto__,gnd) resistance=1kOhm',
    ).samples[0];
    expect(sample.voltages.__proto__).toBeCloseTo(2);
    expect(sample.currents.toString).toBeCloseTo(0.002);
  });
  it('treats a DC capacitor as open and a DC inductor as a short', () => {
    const sample = run(
      circuit(
        'voltage_source V1 (a,gnd) dc=5V\ncapacitor C1 (a,b) capacitance=1uF\ninductor L1 (b,gnd) inductance=1H',
      ),
    ).samples[0];
    expect(sample.currents.C1).toBeCloseTo(0);
    expect(sample.voltages.b).toBeCloseTo(0);
  });
  it('solves ideal op-amp feedback with output-port power', () => {
    const sample = run(examples.opamp).samples[0];
    expect(sample.voltages['U1.P']).toBeCloseTo(2);
    expect(sample.currents.U1).toBeCloseTo(-0.002);
    expect(sample.powers.U1).toBeCloseTo(-0.004);
  });
  it('solves an inverting op-amp and respects input polarity', () => {
    const sample = run(
      'node input\nnode minus\nnode out\nnode gnd\nreference gnd\nvoltage_source V1 (input,gnd) dc=1V\nresistor R1 (input,minus) resistance=1kOhm\nresistor R2 (minus,out) resistance=2kOhm\nopamp U1 (gnd,minus,out,gnd)\nanalysis dc',
    ).samples[0];
    expect(sample.voltages.minus).toBeCloseTo(0);
    expect(sample.voltages.out).toBeCloseTo(-2);
  });
  it('preserves valid zero branch currents and indeterminate floating voltages', () => {
    const result = run(examples.open);
    const sample = result.samples[0];
    expect(sample.currents.R1).toBeCloseTo(0);
    expect(sample.voltages['R1.N']).toBeCloseTo(5);
    expect(sample.voltages['R2.P']).toBeNull();
    expect(sample.elementVoltages.R2).toBeCloseTo(0);
    expect(sample.currents.R2).toBeCloseTo(0);
    expect(
      result.diagnostics.some((d) =>
        d.message.includes('Indeterminate node voltage'),
      ),
    ).toBe(true);
  });
  it('marks ideal wire-loop currents as ambiguous without changing voltages', () => {
    const result = run(
      circuit(
        'voltage_source V1 (a,gnd) dc=5V\nresistor R1 (a,b) resistance=1kOhm\nnode c\nwire W1 b gnd\nwire W2 b c\nwire W3 c gnd',
      ),
    );
    expect(result.samples[0].voltages.b).toBeCloseTo(0);
    expect(result.samples[0].currents.R1).toBeCloseTo(0.005);
    expect(
      ['W1', 'W2', 'W3'].map((id) => result.samples[0].wireCurrents[id]),
    ).toEqual([null, null, null]);
  });
  it('marks the current split between identical ideal sources as ambiguous', () => {
    const sample = run(
      circuit(
        'voltage_source V1 (a,gnd) dc=5V\nvoltage_source V2 (a,gnd) dc=5V\nresistor R1 (a,gnd) resistance=1kOhm',
      ),
    ).samples[0];
    expect(sample.voltages.a).toBeCloseTo(5);
    expect(sample.currents.V1).toBeNull();
    expect(sample.currents.R1).toBeCloseTo(0.005);
  });
  it.each([
    'voltage_source V1 (a,gnd) dc=5V\nvoltage_source V2 (a,gnd) dc=3V',
    'current_source I1 (a,b) dc=1A',
    'voltage_source V1 (a,gnd) dc=1V\nopamp U1 (a,gnd,b,gnd)',
  ])('reports inconsistent constraints: %s', (body) => {
    const result = simulate(document(circuit(body)));
    expect(result.samples).toHaveLength(0);
    expect(result.diagnostics[0].severity).toBe('error');
  });
});

describe('transient integration', () => {
  it('matches RC charging and improves when the timestep is reduced', () => {
    const fine = run(examples.rc);
    const atTau = fine.samples[100];
    expect(atTau.time).toBeCloseTo(0.01);
    expect(atTau.voltages['C1.P']).toBeCloseTo(5 * (1 - (1 / 1.01) ** 100), 8);
    const coarse = run(examples.rc.replace('step=100us', 'step=1ms'));
    const exact = 5 * (1 - Math.exp(-1));
    expect(Math.abs(atTau.voltages['C1.P']! - exact)).toBeLessThan(
      Math.abs(coarse.samples[10].voltages['C1.P']! - exact),
    );
    expect(fine.samples.at(-1)?.voltages['C1.P']).toBeCloseTo(
      5 * (1 - Math.exp(-6)),
      2,
    );
  });
  it('matches RL current growth', () => {
    const result = run(examples.rl);
    expect(result.samples[0].currents.L1).toBeCloseTo(0);
    expect(result.samples[100].currents.L1).toBeCloseTo(
      0.05 * (1 - (1 / 1.01) ** 100),
      8,
    );
  });
  it('starts DC initialization at the operating point', () => {
    const result = run(
      examples.rc.replace('initialization=explicit', 'initialization=dc'),
    );
    expect(result.samples[0].voltages['C1.P']).toBeCloseTo(5);
    expect(result.samples.at(-1)?.voltages['C1.P']).toBeCloseTo(5);
  });
  it('rejects incompatible explicit initial conditions', () => {
    const result = simulate(
      document(
        'node a\nnode gnd\nreference gnd\nvoltage_source V1 (a,gnd) dc=5V\ncapacitor C1 (a,gnd) capacitance=1uF initial_voltage=0V\nanalysis transient stop=1ms step=100us initialization=explicit',
      ),
    );
    expect(result.samples).toHaveLength(0);
    expect(result.diagnostics[0].message).toContain('Initial conditions');
  });
  it('evaluates step, pulse, and sinusoidal source waveforms', () => {
    const body =
      'node a\nnode gnd\nreference gnd\nvoltage_source V1 (a,gnd) dc=0V wave=WAVE amplitude=2V delay=1ms offset=1V frequency=250Hz width=1ms period=2ms\nresistor R1 (a,gnd) resistance=1kOhm\nanalysis transient stop=5ms step=500us initialization=dc';
    const step = run(body.replace('WAVE', 'step'));
    expect(step.samples[1].voltages.a).toBeCloseTo(1);
    expect(step.samples[2].voltages.a).toBeCloseTo(3);
    const pulse = run(body.replace('WAVE', 'pulse'));
    expect(pulse.samples[2].voltages.a).toBeCloseTo(3);
    expect(pulse.samples[4].voltages.a).toBeCloseTo(1);
    const sine = run(body.replace('WAVE', 'sine'));
    expect(sine.samples[4].voltages.a).toBeCloseTo(3);
  });
  it('integrates RLC dynamics with decreasing error as the timestep shrinks', () => {
    const source =
      'node a\nnode b\nnode c\nnode gnd\nreference gnd\nvoltage_source V1 (a,gnd) dc=1V\nresistor R1 (a,b) resistance=10Ohm\ninductor L1 (b,c) inductance=1H initial_current=0A\ncapacitor C1 (c,gnd) capacitance=100uF initial_voltage=0V\nanalysis transient stop=40ms step=STEP initialization=explicit';
    const coarse = run(source.replace('STEP', '1ms')).samples.at(-1)!.voltages
      .c!;
    const fine = run(source.replace('STEP', '100us')).samples.at(-1)!.voltages
      .c!;
    const finest = run(source.replace('STEP', '10us')).samples.at(-1)!.voltages
      .c!;
    expect(Math.abs(fine - finest)).toBeLessThan(Math.abs(coarse - finest));
  });
  it('retains the exact stop time for nonintegral step counts', () => {
    const result = run(
      examples.rc.replace('stop=60ms step=100us', 'stop=1ms step=300us'),
    );
    expect(result.samples.at(-1)!.time).toBe(0.001);
    expect(result.samples).toHaveLength(5);
  });
  it('avoids a zero final timestep caused by floating point step ratios', () => {
    const result = run(
      examples.rc.replace('stop=60ms step=100us', 'stop=70ms step=10ms'),
    );
    expect(result.samples).toHaveLength(8);
    expect(result.samples.at(-1)?.time).toBeCloseTo(0.07);
  });
});
