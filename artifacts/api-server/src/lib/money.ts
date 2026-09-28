export type RoundingMode = "floor" | "ceil" | "round";

const MAX_DECIMALS = 36;

export function requireDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }
}

export function pow10(decimals: number): bigint {
  requireDecimals(decimals);
  return 10n ** BigInt(decimals);
}

export function isDecimalString(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

export function parseUnits(value: string, decimals: number): bigint {
  requireDecimals(decimals);
  const v = value.trim();
  if (!isDecimalString(v)) throw new Error(`Invalid decimal amount: ${value}`);

  const negative = v.startsWith("-");
  const unsigned = negative ? v.slice(1) : v;
  const [intPart, fracPart = ""] = unsigned.split(".");

  if (fracPart.length > decimals) {
    throw new Error(`Too many decimals for ${decimals}-decimal asset: ${value}`);
  }

  const scaledFraction = fracPart.padEnd(decimals, "0") || "0";
  const raw = BigInt(intPart || "0") * pow10(decimals) + BigInt(scaledFraction);
  return negative ? -raw : raw;
}

export function formatUnits(value: bigint, decimals: number): string {
  requireDecimals(decimals);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = pow10(decimals);
  const intPart = abs / base;
  let fracPart = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  if (decimals === 0) fracPart = "";
  return `${negative ? "-" : ""}${intPart.toString()}${fracPart ? `.${fracPart}` : ""}`;
}

export function add(a: bigint, b: bigint): bigint {
  return a + b;
}

export function sub(a: bigint, b: bigint): bigint {
  return a - b;
}

export function cmp(a: bigint, b: bigint): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

function roundDivision(value: bigint, divisor: bigint, mode: RoundingMode): bigint {
  if (divisor === 0n) throw new Error("Division by zero");
  if (mode === "floor") return value / divisor;
  if (mode === "ceil") {
    const q = value / divisor;
    return value % divisor === 0n ? q : q + 1n;
  }

  // round = half away from zero
  const q = value / divisor;
  const r = value % divisor;
  if (r === 0n) return q;
  const absR = r < 0n ? -r : r;
  const half = divisor / 2n;
  if (absR > half) return q + (value < 0n ? -1n : 1n);
  if (absR === half) {
    // tie: away from zero
    return q + (value < 0n ? -1n : 1n);
  }
  return q;
}

export function mulPriceQty(params: {
  priceRaw: bigint;
  priceDecimals: number;
  quantityRaw: bigint;
  quantityDecimals: number;
  outputDecimals: number;
  rounding?: RoundingMode;
}): bigint {
  const {
    priceRaw,
    priceDecimals,
    quantityRaw,
    quantityDecimals,
    outputDecimals,
    rounding = "ceil",
  } = params;

  requireDecimals(priceDecimals);
  requireDecimals(quantityDecimals);
  requireDecimals(outputDecimals);

  const product = priceRaw * quantityRaw;
  const shift = priceDecimals + quantityDecimals - outputDecimals;

  if (shift === 0) return product;
  if (shift > 0) return roundDivision(product, pow10(shift), rounding);
  return product * pow10(-shift);
}

export function mulDiv(a: bigint, b: bigint, c: bigint, rounding: RoundingMode = "floor"): bigint {
  if (c === 0n) throw new Error("Division by zero");
  return roundDivision(a * b, c, rounding);
}

export function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function isPositive(value: bigint): boolean {
  return value > 0n;
}

export function isNonNegative(value: bigint): boolean {
  return value >= 0n;
}
