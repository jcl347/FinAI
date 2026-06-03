/**
 * Foundational portfolio-construction / diversification allocators (pure functions on a sleeve
 * return matrix). These are the industry-standard methods for COMBINING low-correlation sleeves:
 *   - inverseVol        : equal-risk base (what the current allocator approximates)
 *   - minVariance       : global minimum-variance (Markowitz) on a SHRUNK covariance (Ledoit-Wolf)
 *   - riskParity        : equal risk contribution (ERC)
 *   - maxDiversification: Choueifaty-Coignard Most-Diversified Portfolio (maximize diversification ratio)
 *   - hrp               : Hierarchical Risk Parity (Lopez de Prado 2016) — cluster + recursive bisection,
 *                          no matrix inversion (robust to the noisy covariance that breaks min-variance)
 * All return LONG-ONLY weights summing to 1 (negatives clamped + renormalized — a standard practical fix).
 * `rets` is [asset][time]; align to a common trailing window before calling.
 */

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Sample covariance matrix of [asset][time] returns. */
export function covMatrix(rets: number[][]): number[][] {
  const n = rets.length;
  const T = Math.min(...rets.map((r) => r.length));
  const m = rets.map((r) => mean(r.slice(-T)));
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      const ri = rets[i].slice(-T), rj = rets[j].slice(-T);
      for (let t = 0; t < T; t++) s += (ri[t] - m[i]) * (rj[t] - m[j]);
      const c = T > 1 ? s / (T - 1) : 0;
      cov[i][j] = c; cov[j][i] = c;
    }
  }
  return cov;
}

export function corrMatrix(cov: number[][]): number[][] {
  const n = cov.length;
  const sd = cov.map((row, i) => Math.sqrt(Math.max(1e-12, row[i])));
  return cov.map((row, i) => row.map((c, j) => c / (sd[i] * sd[j])));
}

/** Ledoit-Wolf-style shrinkage toward a constant-correlation / diagonal target. */
export function shrinkCov(cov: number[][], delta = 0.2): number[][] {
  const n = cov.length;
  const sd = cov.map((row, i) => Math.sqrt(Math.max(1e-12, row[i])));
  // average off-diagonal correlation
  let rbar = 0, cnt = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { rbar += cov[i][j] / (sd[i] * sd[j]); cnt++; }
  rbar = cnt ? rbar / cnt : 0;
  const out = cov.map((row) => row.slice());
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const target = rbar * sd[i] * sd[j];
    out[i][j] = (1 - delta) * cov[i][j] + delta * target;
  }
  return out;
}

function normalizeLongOnly(w: number[]): number[] {
  const clamped = w.map((x) => Math.max(0, x));
  const s = clamped.reduce((a, b) => a + b, 0);
  return s > 0 ? clamped.map((x) => x / s) : new Array(w.length).fill(1 / w.length);
}

export function equalWeight(n: number): number[] {
  return new Array(n).fill(1 / n);
}

export function inverseVol(cov: number[][]): number[] {
  const iv = cov.map((row, i) => 1 / Math.sqrt(Math.max(1e-12, row[i])));
  const s = iv.reduce((a, b) => a + b, 0);
  return iv.map((x) => x / s);
}

/** Gauss-Jordan matrix inverse (small matrices). Returns null if singular. */
function invMatrix(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...new Array(n).fill(0).map((_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    if (Math.abs(a[piv][col]) < 1e-15) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    const d = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

/** Global minimum-variance: w ∝ Σ⁻¹·1 (on a shrunk Σ for stability), long-only. */
export function minVariance(cov: number[][]): number[] {
  const n = cov.length;
  const inv = invMatrix(shrinkCov(cov, 0.2));
  if (!inv) return inverseVol(cov);
  const w = inv.map((row) => row.reduce((a, b) => a + b, 0)); // Σ⁻¹·1
  return normalizeLongOnly(w);
}

/** Most-Diversified Portfolio: w ∝ Σ⁻¹·σ (maximizes the diversification ratio), long-only. */
export function maxDiversification(cov: number[][]): number[] {
  const n = cov.length;
  const sd = cov.map((row, i) => Math.sqrt(Math.max(1e-12, row[i])));
  const inv = invMatrix(shrinkCov(cov, 0.2));
  if (!inv) return inverseVol(cov);
  const w = inv.map((row) => row.reduce((a, v, j) => a + v * sd[j], 0)); // Σ⁻¹·σ
  return normalizeLongOnly(w);
}

/** Equal-risk-contribution (risk parity) via simple iterative algorithm, long-only. */
export function riskParity(cov: number[][], iters = 200): number[] {
  const n = cov.length;
  let w = inverseVol(cov);
  for (let k = 0; k < iters; k++) {
    const Sw = w.map((_, i) => cov[i].reduce((a, c, j) => a + c * w[j], 0)); // Σw
    const port = Math.sqrt(Math.max(1e-12, w.reduce((a, wi, i) => a + wi * Sw[i], 0)));
    // target each marginal risk contribution equal: w_i ← w_i * (port/n) / (w_i*Sw_i) update
    const next = w.map((wi, i) => {
      const rc = (wi * Sw[i]) / port; // risk contribution
      const target = port / n;
      return Math.max(1e-8, wi * (target / Math.max(1e-12, rc)) ** 0.5);
    });
    const s = next.reduce((a, b) => a + b, 0);
    w = next.map((x) => x / s);
  }
  return w;
}

export function diversificationRatio(w: number[], cov: number[][]): number {
  const sd = cov.map((row, i) => Math.sqrt(Math.max(1e-12, row[i])));
  const weightedVol = w.reduce((a, wi, i) => a + wi * sd[i], 0);
  const Sw = w.map((_, i) => cov[i].reduce((a, c, j) => a + c * w[j], 0));
  const portVol = Math.sqrt(Math.max(1e-12, w.reduce((a, wi, i) => a + wi * Sw[i], 0)));
  return weightedVol / portVol;
}

// ── Hierarchical Risk Parity (Lopez de Prado 2016) ──
/** Single-linkage agglomerative clustering on the correlation-distance, returning a leaf order. */
function quasiDiagOrder(corr: number[][]): number[] {
  const n = corr.length;
  // distance d = sqrt(0.5*(1-corr))
  const dist = corr.map((row) => row.map((c) => Math.sqrt(Math.max(0, 0.5 * (1 - c)))));
  // agglomerate: each cluster is an ordered list of leaves; merge nearest (single linkage).
  let clusters: number[][] = Array.from({ length: n }, (_, i) => [i]);
  const clusterDist = (a: number[], b: number[]) => {
    let m = Infinity;
    for (const i of a) for (const j of b) m = Math.min(m, dist[i][j]);
    return m;
  };
  while (clusters.length > 1) {
    let bi = 0, bj = 1, best = Infinity;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const d = clusterDist(clusters[i], clusters[j]);
        if (d < best) { best = d; bi = i; bj = j; }
      }
    const merged = [...clusters[bi], ...clusters[bj]];
    clusters = clusters.filter((_, k) => k !== bi && k !== bj);
    clusters.push(merged);
  }
  return clusters[0];
}

function clusterVar(cov: number[][], idx: number[]): number {
  // inverse-variance weights within the cluster, then its variance
  const iv = idx.map((i) => 1 / Math.max(1e-12, cov[i][i]));
  const s = iv.reduce((a, b) => a + b, 0);
  const w = iv.map((x) => x / s);
  let v = 0;
  for (let a = 0; a < idx.length; a++) for (let b = 0; b < idx.length; b++) v += w[a] * w[b] * cov[idx[a]][idx[b]];
  return v;
}

export function hrp(rets: number[][]): number[] {
  const n = rets.length;
  if (n === 1) return [1];
  const cov = covMatrix(rets);
  const corr = corrMatrix(cov);
  const order = quasiDiagOrder(corr);
  const w = new Array(n).fill(1);
  // recursive bisection over the quasi-diagonal order
  const recurse = (items: number[]) => {
    if (items.length <= 1) return;
    const half = Math.floor(items.length / 2);
    const left = items.slice(0, half), right = items.slice(half);
    const vl = clusterVar(cov, left), vr = clusterVar(cov, right);
    const alpha = 1 - vl / (vl + vr); // allocate inversely to cluster variance
    for (const i of left) w[i] *= alpha;
    for (const i of right) w[i] *= 1 - alpha;
    recurse(left); recurse(right);
  };
  recurse(order);
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}

/**
 * Correlation-aware diversification TILT (the orthogonality guard as a soft tilt, not a hard optimizer).
 * Starts from an equal base and down-weights each sleeve by how correlated it is to the rest of the book
 * (avg pairwise correlation), renormalized long-only. Light λ — a tilt, since hard optimizers lose to
 * naive diversification on noisy covariance (DeMiguel-Garlappi-Uppal 2009). This is the in-repo, free-data
 * version of "de-weight a sleeve as its rolling correlation-to-book rises".
 */
export function corrPenalty(rets: number[][], lambda = 0.6): number[] {
  const n = rets.length;
  const cov = covMatrix(rets);
  const corr = corrMatrix(cov);
  const avgCorr = corr.map((row, i) => row.reduce((a, c, j) => a + (i === j ? 0 : c), 0) / Math.max(1, n - 1));
  const meanAC = mean(avgCorr);
  const base = equalWeight(n);
  const w = base.map((b, i) => Math.max(0, b * (1 - lambda * (avgCorr[i] - meanAC))));
  const s = w.reduce((a, b) => a + b, 0);
  return s > 0 ? w.map((x) => x / s) : base;
}

export type AllocMethod = "inverse_vol" | "equal" | "min_variance" | "risk_parity" | "max_diversification" | "hrp" | "corr_penalty";

/** Dispatch: weights from a [asset][time] return matrix by method. */
export function allocate(method: AllocMethod, rets: number[][]): number[] {
  if (rets.length === 0) return [];
  if (rets.length === 1) return [1];
  const cov = covMatrix(rets);
  switch (method) {
    case "equal": return equalWeight(rets.length);
    case "inverse_vol": return inverseVol(cov);
    case "min_variance": return minVariance(cov);
    case "risk_parity": return riskParity(cov);
    case "max_diversification": return maxDiversification(cov);
    case "hrp": return hrp(rets);
    case "corr_penalty": return corrPenalty(rets);
  }
}
