export const examples = {
  divider: `# Click an element or its permanently attached P / N nodes.
circuit "Voltage divider"

voltage_source V1 dc=12V at=(190,310) rotate=90 label="Supply"
resistor R1 resistance=2kOhm at=(395,165) label="Upper resistor"
resistor R2 resistance=1kOhm at=(600,310) rotate=90 label="Lower resistor"
wire W1 V1.N R2.N label="Return path"
wire W2 V1.P R1.P
wire W3 R1.N R2.P
node V1.P label="Supply"
node V1.N label="Ground"
node R1.N label="Output"
reference V1.N

label voltage(R1.N) "Vout"
label current(R1) "Iin"
analysis dc
`,
  rc: `# Charge a capacitor through a resistor. Time constant: 10 ms.
circuit "RC step response"
voltage_source V1 dc=5V at=(190,310) rotate=90
resistor R1 resistance=1kOhm at=(395,165)
capacitor C1 capacitance=10uF initial_voltage=0V at=(600,310) rotate=90
wire W1 V1.N C1.N
wire W2 V1.P R1.P
wire W3 R1.N C1.P
reference V1.N
label voltage(C1.P) "Vout"
label current(R1) "Charge current"
analysis transient stop=60ms step=100us initialization=explicit
`,
  rl: `circuit "RL step response"
voltage_source V1 dc=5V at=(190,310) rotate=90
resistor R1 resistance=100Ohm at=(395,165)
inductor L1 inductance=1H initial_current=0A at=(600,310) rotate=90
wire W1 V1.N L1.N
wire W2 V1.P R1.P
wire W3 R1.N L1.P
reference V1.N
label current(L1) "Coil current"
analysis transient stop=60ms step=100us initialization=explicit
`,
  opamp: `# Ideal voltage follower. INP / INN are inputs; P / N are output / return.
circuit "Op-amp voltage follower"
voltage_source V1 dc=2V at=(170,320) rotate=90
opamp U1 at=(430,220)
resistor R1 resistance=1kOhm at=(650,320) rotate=90
wire W1 V1.P U1.INP
wire W2 U1.P U1.INN
wire W3 U1.P R1.P
wire W4 V1.N U1.N
wire W5 U1.N R1.N
reference V1.N
label voltage(U1.P) "Vout"
analysis dc
`,
  dependent: `# A voltage-controlled voltage source with a gain of two.
circuit "Dependent source"
voltage_source V1 dc=3V at=(180,300) rotate=90
vcvs E1 control=(V1.P,V1.N) gain=2 at=(450,300) rotate=90
resistor R1 resistance=1kOhm at=(690,300) rotate=90
wire W1 V1.N E1.N
wire W2 E1.P R1.P
wire W3 R1.N E1.N
reference V1.N
label voltage(E1.P) "Vout"
analysis dc
`,
  open: `# R1.N is open. R2 is a floating island with unknown absolute voltage.
circuit "Open circuit & floating island"
voltage_source V1 dc=5V at=(170,280) rotate=90
resistor R1 resistance=1kOhm at=(400,150)
resistor R2 resistance=1kOhm at=(560,370)
wire W1 V1.P R1.P
reference V1.N
label voltage(R1.N) "Open voltage"
analysis dc
`,
};
