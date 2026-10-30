// Small-count statistics for the Results section: the Wilson score interval
// for a proportion and the rule of three for a rate observed zero times. Pure
// functions, no dependencies; the build-log script prints them.

export function wilson(k: number, n: number, z = 1.959964): [number, number] {
  if (n <= 0 || k < 0 || k > n) throw new Error(`wilson: k=${k} n=${n}`);
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const snap = (x: number): number => (Math.abs(x) < 1e-12 ? 0 : Math.abs(1 - x) < 1e-12 ? 1 : x);
  const lo = snap(Math.max(0, (center - half) / denom));
  const hi = snap(Math.min(1, (center + half) / denom));
  return [lo, hi];
}

// With zero events in n independent trials, the 95 percent upper bound on the
// event rate is about 3/n.
export function ruleOfThree(n: number): number {
  if (n <= 0) throw new Error(`ruleOfThree: n=${n}`);
  return 3 / n;
}

export function formatInterval(k: number, n: number): string {
  const [lo, hi] = wilson(k, n);
  return `${Math.round(lo * 100)} to ${Math.round(hi * 100)}%`;
}
