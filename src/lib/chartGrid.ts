// Compute "nice" horizontal gridlines for a chart given a numeric data range.
// Rules:
// - Spacing must be one of: 10, 20, 50, 100, 200, 500, 1000, 5000
// - Lines are always multiples of the chosen spacing (so spacing 100 -> 100, 200, 300...)
// - Aim for 4 to 10 lines within the data range
const ALLOWED_SPACINGS = [10, 20, 50, 100, 200, 500, 1000, 5000] as const;

export function niceGridLines(min: number, max: number): number[] {
  if (!isFinite(min) || !isFinite(max) || max <= min) return [];

  for (const s of ALLOWED_SPACINGS) {
    const lo = Math.ceil(min / s) * s;
    const hi = Math.floor(max / s) * s;
    if (hi < lo) continue;
    const count = Math.floor((hi - lo) / s) + 1;
    if (count >= 4 && count <= 10) {
      const lines: number[] = [];
      for (let v = lo; v <= hi + 1e-9; v += s) lines.push(Math.round(v));
      return lines;
    }
  }

  // Fallback: use the largest allowed spacing
  const s = ALLOWED_SPACINGS[ALLOWED_SPACINGS.length - 1];
  const lo = Math.ceil(min / s) * s;
  const hi = Math.floor(max / s) * s;
  const lines: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += s) lines.push(Math.round(v));
  return lines;
}
