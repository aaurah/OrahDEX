// Abramowitz & Stegun polynomial approximation of the standard normal CDF.
// Maximum error: |ε(x)| ≤ 7.5 × 10⁻⁸  (accurate enough for option pricing).
function normCDF(x: number): number {
  if (x < -8) return 0;
  if (x >  8) return 1;

  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t * (0.319381530 +
    t * (-0.356563782 +
    t * (1.781477937 +
    t * (-1.821255978 +
    t * 1.330274429))));
  const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const result = 1 - pdf * poly;
  return x >= 0 ? result : 1 - result;
}

function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface BlackScholesParams {
  spot: number;
  strike: number;
  expiry: number;      // time to expiry in years
  riskFreeRate: number;
  volatility: number;
  optionType: "call" | "put";
}

export interface BlackScholesResult {
  premium: number;
  delta: number;
  gamma: number;
  theta: number;  // per calendar day
  vega: number;   // per 1% change in vol
  rho: number;
}

export function blackScholes(params: BlackScholesParams): BlackScholesResult {
  const { spot, strike, expiry, riskFreeRate, volatility, optionType } = params;

  if (expiry <= 0) {
    // At or past expiry — intrinsic value only
    const intrinsic =
      optionType === "call"
        ? Math.max(0, spot - strike)
        : Math.max(0, strike - spot);
    const delta = optionType === "call" ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0);
    return { premium: intrinsic, delta, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }

  const sqrtT = Math.sqrt(expiry);
  const d1 =
    (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * expiry) /
    (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;

  const discountFactor = Math.exp(-riskFreeRate * expiry);

  let premium: number;
  let delta: number;
  let rho: number;

  if (optionType === "call") {
    premium = spot * normCDF(d1) - strike * discountFactor * normCDF(d2);
    delta   = normCDF(d1);
    rho     = strike * expiry * discountFactor * normCDF(d2) / 100;
  } else {
    premium = strike * discountFactor * normCDF(-d2) - spot * normCDF(-d1);
    delta   = normCDF(d1) - 1;
    rho     = -strike * expiry * discountFactor * normCDF(-d2) / 100;
  }

  const gamma = normPDF(d1) / (spot * volatility * sqrtT);

  // Theta: rate of change of premium per calendar day
  const thetaAnnual =
    -(spot * normPDF(d1) * volatility) / (2 * sqrtT) -
    (optionType === "call"
      ? riskFreeRate * strike * discountFactor * normCDF(d2)
      : -riskFreeRate * strike * discountFactor * normCDF(-d2));
  const theta = thetaAnnual / 365;

  // Vega: sensitivity to 1% change in implied vol
  const vega = spot * normPDF(d1) * sqrtT / 100;

  return {
    premium: Math.max(0, premium),
    delta,
    gamma,
    theta,
    vega,
    rho,
  };
}

export function getTimeToExpiry(expiryTimestamp: Date): number {
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const remaining = expiryTimestamp.getTime() - Date.now();
  return Math.max(0, remaining / msPerYear);
}

export function calculateImpliedVolatility(
  marketPremium: number,
  spot: number,
  strike: number,
  expiry: number,
  riskFreeRate: number,
  optionType: "call" | "put",
): number {
  if (expiry <= 0 || marketPremium <= 0) return 0;

  // Initial guess: use approximate ATM vega to seed Newton-Raphson
  let vol = Math.sqrt(2 * Math.PI / expiry) * (marketPremium / spot);
  vol = Math.max(0.01, Math.min(vol, 10)); // clamp to [1%, 1000%]

  const tolerance = 1e-6;
  const maxIterations = 100;

  for (let i = 0; i < maxIterations; i++) {
    const result = blackScholes({ spot, strike, expiry, riskFreeRate, volatility: vol, optionType });
    const diff = result.premium - marketPremium;

    if (Math.abs(diff) < tolerance) break;

    // vega is per 1% vol; convert to per unit vol for the Newton step
    const vegaPerUnit = result.vega * 100;
    if (Math.abs(vegaPerUnit) < 1e-10) break;

    vol = vol - diff / vegaPerUnit;
    vol = Math.max(0.001, Math.min(vol, 20)); // keep in [0.1%, 2000%]
  }

  return vol;
}
