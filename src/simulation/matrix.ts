/** Row-scaled Gauss-Jordan elimination preserves free variables instead of silently grounding them. */
export interface LinearSolution {
  inconsistent: boolean;
  rank: number;
  evaluate: (coefficients: number[]) => number | null;
  residual: number;
}
export function solveLinear(
  matrix: number[][],
  rhs: number[],
  columns: number,
): LinearSolution {
  const tolerance = 1e-11;
  const rows = matrix.map((row, i) => {
    const scale = Math.max(...row.map(Math.abs), 1e-300);
    return [...row.map((x) => x / scale), rhs[i] / scale];
  });
  const pivots: number[] = [];
  let pivotRow = 0;
  for (let col = 0; col < columns && pivotRow < rows.length; col++) {
    let best = pivotRow;
    for (let r = pivotRow + 1; r < rows.length; r++)
      if (Math.abs(rows[r][col]) > Math.abs(rows[best][col])) best = r;
    if (Math.abs(rows[best][col]) < tolerance) continue;
    [rows[best], rows[pivotRow]] = [rows[pivotRow], rows[best]];
    const pivot = rows[pivotRow][col];
    for (let c = 0; c <= columns; c++) rows[pivotRow][c] /= pivot;
    for (let r = 0; r < rows.length; r++) {
      if (r === pivotRow) continue;
      const factor = rows[r][col];
      if (factor === 0) continue;
      for (let c = 0; c <= columns; c++)
        rows[r][c] -= factor * rows[pivotRow][c];
      rows[r][col] = 0;
    }
    pivots.push(col);
    pivotRow++;
  }
  const inconsistent = rows.some(
    (row) =>
      row.slice(0, columns).every((x) => Math.abs(x) < tolerance) &&
      Math.abs(row[columns]) > 1e-8,
  );
  const pivotSet = new Set(pivots);
  const free = Array.from({ length: columns }, (_, i) => i).filter(
    (i) => !pivotSet.has(i),
  );
  const particular = new Array<number>(columns).fill(0);
  pivots.forEach((col, row) => {
    particular[col] = rows[row][columns];
  });
  const residual = Math.max(
    0,
    ...matrix.map(
      (row, i) =>
        Math.abs(
          row.reduce((sum, x, j) => sum + x * particular[j], 0) - rhs[i],
        ) /
        (1 +
          Math.abs(rhs[i]) +
          row.reduce((sum, x, j) => sum + Math.abs(x * particular[j]), 0)),
    ),
  );
  return {
    inconsistent:
      inconsistent ||
      particular.some((x) => !Number.isFinite(x)) ||
      residual > 1e-7,
    rank: pivots.length,
    residual,
    evaluate(coefficients) {
      if (inconsistent) return null;
      const scale = Math.max(1, ...coefficients.map(Math.abs));
      for (const col of free) {
        let dependency = coefficients[col] ?? 0;
        pivots.forEach((pivot, row) => {
          dependency -= (coefficients[pivot] ?? 0) * rows[row][col];
        });
        if (Math.abs(dependency) > tolerance * scale * 10) return null;
      }
      const value = coefficients.reduce(
        (sum, x, j) => sum + x * particular[j],
        0,
      );
      return Number.isFinite(value) ? value : null;
    },
  };
}
