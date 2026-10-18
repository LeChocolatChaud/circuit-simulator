export function format(
  value: number | null | undefined,
  unit = '',
  digits = 4,
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return 'Indeterminate';
  if (Math.abs(value) < 1e-15) return `0${unit ? ` ${unit}` : ''}`;
  const exponent = Math.max(
    -12,
    Math.min(9, Math.floor(Math.log10(Math.abs(value)) / 3) * 3),
  );
  const prefix: Record<number, string> = {
    '-12': 'p',
    '-9': 'n',
    '-6': 'µ',
    '-3': 'm',
    0: '',
    3: 'k',
    6: 'M',
    9: 'G',
  };
  return `${Number((value / 10 ** exponent).toPrecision(digits))} ${prefix[exponent]}${unit}`.trim();
}
