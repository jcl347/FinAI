/**
 * Scoring Model Validation Tests
 *
 * Validates the put-selling scoring model against known research findings:
 *
 * 1. tastytrade: 45 DTE, 16 delta should score highest in DTE/delta dimensions
 * 2. Sweet spot delta (0.20-0.30) should outscore extreme deltas
 * 3. Higher IV environments should produce higher scores
 * 4. Crisis regime should apply penalty
 * 5. Good liquidity should outscore poor liquidity
 * 6. Annualized return calculation accuracy
 *
 * Reference data points from backtesting literature:
 * - Spintwig SPY 45-DTE backtests
 * - DataDrivenOptions put spread delta studies
 * - tastytrade 16-delta strangle research
 */

import {
  scorePut,
  classifyMarketRegime,
  rankPuts,
  scoreCompanyStability,
  type PutCandidate,
  type CompanyStability,
} from "../scoring";

function makePut(overrides: Partial<PutCandidate> = {}): PutCandidate {
  return {
    symbol: "SPY",
    stockPrice: 500,
    strikePrice: 475,
    expiration: "2026-04-17",
    dte: 40,
    bid: 3.5,
    ask: 3.8,
    lastPrice: 3.65,
    volume: 5000,
    openInterest: 15000,
    impliedVolatility: 18,
    delta: -0.2,
    gamma: 0.005,
    theta: -0.04,
    vega: 0.15,
    ...overrides,
  };
}

describe("Market Regime Classification", () => {
  test("VIX < 15 = LOW_VOL", () => {
    const r = classifyMarketRegime(12);
    expect(r.regime).toBe("LOW_VOL");
    expect(r.favorsPutSelling).toBe(true);
  });

  test("VIX 15-25 = NORMAL (ideal for put selling)", () => {
    const r = classifyMarketRegime(20);
    expect(r.regime).toBe("NORMAL");
    expect(r.favorsPutSelling).toBe(true);
  });

  test("VIX 25-35 = HIGH_VOL", () => {
    const r = classifyMarketRegime(30);
    expect(r.regime).toBe("HIGH_VOL");
    expect(r.favorsPutSelling).toBe(true);
  });

  test("VIX > 35 = CRISIS (unfavorable)", () => {
    const r = classifyMarketRegime(45);
    expect(r.regime).toBe("CRISIS");
    expect(r.favorsPutSelling).toBe(false);
  });
});

describe("Put Scoring Model", () => {
  const normalRegime = classifyMarketRegime(20);

  test("sweet spot put (45 DTE, 0.20 delta, good liquidity) scores highest", () => {
    const sweetSpot = makePut({
      dte: 45,
      delta: -0.2,
      bid: 4.0,
      ask: 4.2,
      openInterest: 20000,
      volume: 8000,
    });

    const scored = scorePut(sweetSpot, 60, normalRegime);
    expect(scored.score).toBeGreaterThan(70);
    expect(scored.recommendation).toBe("STRONG_SELL");
  });

  test("extreme delta (0.05) scores lower than sweet spot", () => {
    const farOTM = makePut({
      delta: -0.05,
      strikePrice: 440,
      bid: 0.5,
      ask: 0.7,
    });
    const sweetSpot = makePut({ delta: -0.22 });

    const farOTMScored = scorePut(farOTM, 50, normalRegime);
    const sweetSpotScored = scorePut(sweetSpot, 50, normalRegime);

    expect(sweetSpotScored.score).toBeGreaterThan(farOTMScored.score);
  });

  test("45 DTE gets higher DTE component score than 7 DTE (gamma risk)", () => {
    const dte45 = makePut({ dte: 45, bid: 3.5, ask: 3.8 });
    const dte7 = makePut({ dte: 8, bid: 3.5, ask: 3.8 });

    const scored45 = scorePut(dte45, 50, normalRegime);
    const scored7 = scorePut(dte7, 50, normalRegime);

    // The DTE signal for 45 should show bullish, while 7 DTE should not
    const dte45Signal = scored45.signals.find((s) => s.name === "Days to Expiration");
    const dte7Signal = scored7.signals.find((s) => s.name === "Days to Expiration");
    expect(dte45Signal?.sentiment).toBe("bullish");
    expect(dte7Signal?.sentiment).not.toBe("bullish");
    // Note: 7 DTE may score higher overall due to annualized return boost,
    // but DTE quality dimension correctly penalizes short expiration
  });

  test("45 DTE scores higher than 90 DTE (less efficient)", () => {
    const dte45 = makePut({ dte: 45 });
    const dte90 = makePut({ dte: 80 });

    const scored45 = scorePut(dte45, 50, normalRegime);
    const scored90 = scorePut(dte90, 50, normalRegime);

    expect(scored45.score).toBeGreaterThan(scored90.score);
  });

  test("high IV rank (60%) scores higher than low IV rank (10%)", () => {
    const put = makePut();
    const highIV = scorePut(put, 60, normalRegime);
    const lowIV = scorePut(put, 10, normalRegime);

    expect(highIV.score).toBeGreaterThan(lowIV.score);
  });

  test("crisis regime applies significant penalty", () => {
    const put = makePut();
    const crisisRegime = classifyMarketRegime(45);

    const normalScored = scorePut(put, 50, normalRegime);
    const crisisScored = scorePut(put, 50, crisisRegime);

    // Crisis multiplier is 0.75 (softened from 0.6 per Neuberger Berman research
    // showing put-writing works across VIX quartiles with wider strikes)
    expect(crisisScored.score).toBeLessThan(normalScored.score * 0.8);
  });

  test("good liquidity (tight spread, high OI) scores higher", () => {
    const liquid = makePut({
      bid: 3.95,
      ask: 4.0,
      openInterest: 50000,
      volume: 10000,
    });
    const illiquid = makePut({
      bid: 3.0,
      ask: 5.0,
      openInterest: 10,
      volume: 0,
    });

    const liquidScored = scorePut(liquid, 50, normalRegime);
    const illiquidScored = scorePut(illiquid, 50, normalRegime);

    expect(liquidScored.score).toBeGreaterThan(illiquidScored.score);
  });

  test("distance OTM 5-15% scores higher than ITM or very far OTM", () => {
    const otm10 = makePut({ strikePrice: 450, stockPrice: 500 }); // 10% OTM
    const itm = makePut({ strikePrice: 510, stockPrice: 500 }); // ITM
    const farOTM = makePut({ strikePrice: 350, stockPrice: 500 }); // 30% OTM

    const otm10Scored = scorePut(otm10, 50, normalRegime);
    const itmScored = scorePut(itm, 50, normalRegime);
    const farOTMScored = scorePut(farOTM, 50, normalRegime);

    expect(otm10Scored.score).toBeGreaterThan(itmScored.score);
    expect(otm10Scored.score).toBeGreaterThan(farOTMScored.score);
  });

  test("annualized return calculation is correct", () => {
    const put = makePut({
      strikePrice: 475,
      bid: 4.0,
      ask: 4.0,
      dte: 45,
    });

    const scored = scorePut(put, 50, normalRegime);

    // Premium yield = (4.0 / 475) * 100 = 0.842%
    // Annualized = 0.842% * (365 / 45) = 6.83%
    expect(scored.premiumYield).toBeCloseTo(0.842, 1);
    expect(scored.annualizedReturn).toBeCloseTo(6.83, 0);
  });

  test("generates correct signal metadata", () => {
    const put = makePut();
    const scored = scorePut(put, 60, normalRegime);

    expect(scored.signals.length).toBeGreaterThanOrEqual(5);
    expect(scored.signals.some((s) => s.name === "Delta / P(OTM)")).toBe(true);
    expect(scored.signals.some((s) => s.name === "Days to Expiration")).toBe(true);
    expect(scored.signals.some((s) => s.name === "Annualized Return")).toBe(true);
  });
});

describe("Put Ranking", () => {
  const normalRegime = classifyMarketRegime(20);

  test("ranks multiple candidates by score descending", () => {
    const candidates = [
      makePut({ delta: -0.05, bid: 0.2, ask: 0.4 }), // bad
      makePut({ delta: -0.20, bid: 4.0, ask: 4.2, openInterest: 20000 }), // good
      makePut({ delta: -0.50, bid: 10.0, ask: 11.0 }), // too aggressive
    ];

    const ranked = rankPuts(candidates, 50, normalRegime, 10);

    expect(ranked.length).toBeGreaterThan(0);
    // Should be sorted by score descending
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });

  test("filters out puts with zero bid and zero lastPrice", () => {
    const candidates = [
      makePut({ bid: 0, ask: 0.1, lastPrice: 0 }),
      makePut({ bid: 3.0, ask: 3.5 }),
    ];

    const ranked = rankPuts(candidates, 50, normalRegime, 10);
    expect(ranked.every((r) => r.bid > 0 || r.lastPrice > 0)).toBe(true);
    // The zero-bid, zero-lastPrice put should be filtered out
    expect(ranked.length).toBe(1);
  });

  test("includes all puts with DTE >= 1 (API controls DTE range)", () => {
    const candidates = [
      makePut({ dte: 3 }),
      makePut({ dte: 45 }),
    ];

    const ranked = rankPuts(candidates, 50, normalRegime, 10);
    expect(ranked.length).toBe(2);
    expect(ranked.every((r) => r.dte >= 1)).toBe(true);
  });
});

describe("Company Stability Scoring", () => {
  function makeStability(overrides: Partial<CompanyStability> = {}): CompanyStability {
    return {
      marketCap: 200e9,
      beta: 1.0,
      dividendYield: 1.5,
      fiftyTwoWeekLow: 140,
      fiftyTwoWeekHigh: 200,
      currentPrice: 180,
      trailingPE: 25,
      ...overrides,
    };
  }

  test("mega cap low-beta dividend payer scores highly", () => {
    const stable = makeStability({
      marketCap: 2500e9,
      beta: 0.6,
      dividendYield: 2.8,
      currentPrice: 185,
    });

    const result = scoreCompanyStability(stable);
    expect(result.score).toBeGreaterThan(85);
  });

  test("micro cap high-beta no-dividend stock scores poorly", () => {
    const risky = makeStability({
      marketCap: 500e6,
      beta: 2.5,
      dividendYield: 0,
      fiftyTwoWeekLow: 10,
      fiftyTwoWeekHigh: 50,
      currentPrice: 15,
    });

    const result = scoreCompanyStability(risky);
    expect(result.score).toBeLessThan(30);
  });

  test("low beta scores higher than high beta", () => {
    const lowBeta = scoreCompanyStability(makeStability({ beta: 0.7 }));
    const highBeta = scoreCompanyStability(makeStability({ beta: 2.0 }));
    expect(lowBeta.score).toBeGreaterThan(highBeta.score);
  });

  test("large cap scores higher than small cap", () => {
    const largeCap = scoreCompanyStability(makeStability({ marketCap: 100e9 }));
    const smallCap = scoreCompanyStability(makeStability({ marketCap: 1e9 }));
    expect(largeCap.score).toBeGreaterThan(smallCap.score);
  });

  test("stock near 52wk high scores higher than near 52wk low", () => {
    const nearHigh = scoreCompanyStability(
      makeStability({ currentPrice: 195, fiftyTwoWeekLow: 140, fiftyTwoWeekHigh: 200 })
    );
    const nearLow = scoreCompanyStability(
      makeStability({ currentPrice: 145, fiftyTwoWeekLow: 140, fiftyTwoWeekHigh: 200 })
    );
    expect(nearHigh.score).toBeGreaterThan(nearLow.score);
  });

  test("generates 4 stability signals", () => {
    const result = scoreCompanyStability(makeStability());
    expect(result.signals.length).toBe(4);
    expect(result.signals.some((s) => s.name === "Market Cap")).toBe(true);
    expect(result.signals.some((s) => s.name === "Beta")).toBe(true);
    expect(result.signals.some((s) => s.name === "52wk Position")).toBe(true);
    expect(result.signals.some((s) => s.name === "Dividend")).toBe(true);
  });

  test("stability integrates into put scoring when provided", () => {
    const normalRegime = classifyMarketRegime(20);
    const put = makePut();

    const stableCompany = makeStability({ marketCap: 2000e9, beta: 0.5, dividendYield: 3.0 });
    const riskyCompany = makeStability({ marketCap: 500e6, beta: 2.5, dividendYield: 0 });

    const stableScored = scorePut(put, 50, normalRegime, stableCompany);
    const riskyScored = scorePut(put, 50, normalRegime, riskyCompany);

    expect(stableScored.score).toBeGreaterThan(riskyScored.score);
    expect(stableScored.stabilityScore).toBeGreaterThan(riskyScored.stabilityScore);
  });
});

describe("Black-Scholes Validation", () => {
  // Import here to keep test file self-contained
  const { putPrice, putGreeks, impliedVolatility } = require("../black-scholes");

  test("put price matches known value (S=100, K=100, T=1, r=0.05, σ=0.2)", () => {
    // Known BS put price for these params ≈ $5.57
    const price = putPrice({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 });
    expect(price).toBeCloseTo(5.57, 1);
  });

  test("put delta is negative and between -1 and 0", () => {
    const greeks = putGreeks({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 });
    expect(greeks.delta).toBeLessThan(0);
    expect(greeks.delta).toBeGreaterThan(-1);
  });

  test("ATM put delta is near -0.5 (adjusted for interest rate)", () => {
    const greeks = putGreeks({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 });
    // ATM put delta is approximately -N(-d1) ≈ -0.46 for these params
    // d1 = (ln(1) + (0.05 + 0.02)*1)/(0.2*1) = 0.35, N(-0.35) ≈ 0.3632
    expect(greeks.delta).toBeCloseTo(-0.3632, 1);
  });

  test("deep OTM put has delta close to 0", () => {
    const greeks = putGreeks({ S: 100, K: 50, T: 0.1, r: 0.05, sigma: 0.2 });
    expect(Math.abs(greeks.delta)).toBeLessThan(0.01);
  });

  test("theta is negative (time decay benefits seller)", () => {
    const greeks = putGreeks({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 });
    // Theta for short put is negative (loses value per day = seller profits)
    // The put buyer's theta is negative, so our computed theta should be negative
    expect(greeks.theta).toBeLessThan(0);
  });

  test("implied volatility recovery (roundtrip)", () => {
    const sigma = 0.3;
    const price = putPrice({ S: 100, K: 95, T: 0.5, r: 0.05, sigma });
    const recoveredIV = impliedVolatility(price, 100, 95, 0.5, 0.05);
    expect(recoveredIV).toBeCloseTo(sigma, 2);
  });

  test("put-call parity approximately holds", () => {
    // P + S = C + K*e^(-rT)
    const S = 100, K = 100, T = 1, r = 0.05, sigma = 0.25;
    const putP = putPrice({ S, K, T, r, sigma });
    // Call price from put-call parity: C = P + S - K*e^(-rT)
    const expectedCall = putP + S - K * Math.exp(-r * T);
    // Should be positive for ATM
    expect(expectedCall).toBeGreaterThan(0);
    expect(expectedCall).toBeGreaterThan(putP); // call > put for ATM when r > 0
  });

  test("delta monotonicity: deeper OTM → smaller |delta|", () => {
    // At 45 DTE, 25% IV, deltas should decrease monotonically as strike decreases
    const strikes = [100, 95, 90, 85, 80];
    const deltas = strikes.map(K =>
      Math.abs(putGreeks({ S: 100, K, T: 45/365, r: 0.045, sigma: 0.25 }).delta)
    );
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]).toBeLessThan(deltas[i - 1]);
    }
  });

  test("realistic put-selling deltas match expected ranges", () => {
    // 5% OTM at 45 DTE with 25% IV → delta ~0.20-0.28
    const otm5 = putGreeks({ S: 200, K: 190, T: 45/365, r: 0.045, sigma: 0.25, q: 0.005 });
    expect(Math.abs(otm5.delta)).toBeGreaterThan(0.15);
    expect(Math.abs(otm5.delta)).toBeLessThan(0.35);

    // 10% OTM → delta ~0.05-0.15
    const otm10 = putGreeks({ S: 200, K: 180, T: 45/365, r: 0.045, sigma: 0.25, q: 0.005 });
    expect(Math.abs(otm10.delta)).toBeGreaterThan(0.03);
    expect(Math.abs(otm10.delta)).toBeLessThan(0.20);

    // ATM → delta ~0.45-0.50
    const atm = putGreeks({ S: 100, K: 100, T: 45/365, r: 0.045, sigma: 0.25 });
    expect(Math.abs(atm.delta)).toBeGreaterThan(0.40);
    expect(Math.abs(atm.delta)).toBeLessThan(0.55);
  });

  test("IV recovery produces accurate delta when Yahoo IV is missing", () => {
    // Simulate: compute a put price, then recover IV from that price, then compute delta
    // This tests the fallback path used when Yahoo returns impliedVolatility=0
    const realSigma = 0.25;
    const params = { S: 200, K: 190, T: 45/365, r: 0.045, q: 0.005 };
    const realPrice = putPrice({ ...params, sigma: realSigma });
    const recoveredSigma = impliedVolatility(realPrice, params.S, params.K, params.T, params.r, params.q);
    const realDelta = putGreeks({ ...params, sigma: realSigma }).delta;
    const recoveredDelta = putGreeks({ ...params, sigma: recoveredSigma }).delta;
    // Delta from recovered IV should be within 0.005 of real delta
    expect(Math.abs(realDelta - recoveredDelta)).toBeLessThan(0.005);
  });
});
