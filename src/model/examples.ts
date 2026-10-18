export const examples = {
  divider: `# A simple starting point. Click any element to inspect it.
circuit "Voltage divider"

node supply label="Supply" at=(180,160)
node out label="Output" at=(540,160)
node gnd label="Ground" at=(540,430)
node return label="Return" at=(180,430)
reference gnd

voltage_source V1 (supply,return) dc=12V at=(180,295) rotate=90 label="Supply"
resistor R1 (supply,out) resistance=2kOhm at=(360,160) label="Upper resistor"
resistor R2 (out,gnd) resistance=1kOhm at=(540,295) rotate=90 label="Lower resistor"
wire W1 return gnd label="Return path"

label voltage(out) "Vout"
label current(R1) "Iin"
analysis dc
`,
  rc: `# Charge a capacitor through a resistor. Time constant: 10 ms.
circuit "RC step response"

node supply label="Supply" at=(180,160)
node out label="Output" at=(540,160)
node gnd label="Ground" at=(540,430)
node return label="Return" at=(180,430)
reference gnd

voltage_source V1 (supply,return) dc=5V at=(180,295) rotate=90
resistor R1 (supply,out) resistance=1kOhm at=(360,160)
capacitor C1 (out,gnd) capacitance=10uF initial_voltage=0V at=(540,295) rotate=90
wire W1 return gnd
label voltage(out) "Vout"
label current(R1) "Charge current"
analysis transient stop=60ms step=100us initialization=explicit
`,
  rl: `circuit "RL step response"
node supply at=(180,160)
node out at=(540,160)
node gnd at=(540,430)
node return at=(180,430)
reference gnd
voltage_source V1 (supply,return) dc=5V at=(180,295) rotate=90
resistor R1 (supply,out) resistance=100Ohm at=(360,160)
inductor L1 (out,gnd) inductance=1H initial_current=0A at=(540,295) rotate=90
wire W1 return gnd
label current(L1) "Coil current"
analysis transient stop=60ms step=100us initialization=explicit
`,
  opamp: `# Ideal voltage follower. Port order: +input, -input, output, return.
circuit "Op-amp voltage follower"
node input at=(180,180)
node feedback at=(350,360)
node output at=(630,180)
node gnd at=(630,440)
node return at=(180,440)
reference gnd
voltage_source V1 (input,return) dc=2V at=(180,310) rotate=90
opamp U1 (input,feedback,output,gnd) at=(420,180)
resistor R1 (output,gnd) resistance=1kOhm at=(630,310) rotate=90
wire W1 feedback output
wire W2 return gnd
label voltage(output) "Vout"
analysis dc
`,
  dependent: `# A voltage-controlled voltage source with a gain of two.
circuit "Dependent source"
node input at=(180,140)
node control_return at=(180,440)
node output at=(460,140)
node gnd at=(460,440)
node load at=(690,140)
node load_return at=(690,440)
reference gnd
voltage_source V1 (input,control_return) dc=3V at=(180,290) rotate=90
vcvs E1 (output,gnd) control=(input,control_return) gain=2 at=(460,290) rotate=90
resistor R1 (load,load_return) resistance=1kOhm at=(690,290) rotate=90
wire W1 control_return gnd
wire W2 output load
wire W3 load_return gnd
label voltage(output) "Vout"
analysis dc
`,
  open: `# An open branch has zero current; the separate island has no reference.
circuit "Open circuit & floating island"
node supply at=(170,150)
node dangling at=(500,150)
node gnd at=(170,410)
node floating_a at=(430,370)
node floating_b at=(690,370)
reference gnd
voltage_source V1 (supply,gnd) dc=5V at=(170,280) rotate=90
resistor R1 (supply,dangling) resistance=1kOhm at=(335,150)
resistor R2 (floating_a,floating_b) resistance=1kOhm at=(560,370)
label voltage(dangling) "Open voltage"
analysis dc
`,
};
