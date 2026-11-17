import { CHAIN_TOKEN_ADDRESSES, TOKEN_DECIMALS } from "./onChainLiquidity";
import type { ReownSwapCoin } from "./reown-appkit";

export interface ReownOrderbookMarket {
  symbol: string;
  baseAsset: string;
  quoteAsset: "ETH";
  lastPrice: number;
  priceChangePercent24h: number;
  type: "spot";
  network: "ethereum";
  reownOrderbook: true;
  swapOnly: false;
}

interface PriceMarket {
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  base?: string;
  quote?: string;
  lastPrice?: number | string;
  price?: number | string;
  priceChangePercent24h?: number | string;
  chg?: number | string;
  type?: string;
}

interface PricePoint {
  price: number;
  change: number;
  rank: number;
}

const REFERENCE_QUOTES = ["USDT", "USDC", "DAI"] as const;

function finitePositive(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function marketParts(market: PriceMarket): { base: string; quote: string } {
  const parts = String(market.symbol ?? "").toUpperCase().split("/");
  return {
    base: String(market.baseAsset ?? market.base ?? parts[0] ?? "").toUpperCase(),
    quote: String(market.quoteAsset ?? market.quote ?? parts[1] ?? "").toUpperCase(),
  };
}

function rankMarketType(type: string | undefined): number {
  if (type === "spot") return 0;
  if (type === "simpleswap") return 1;
  return 2;
}

function approvedEthereumToken(coin: ReownSwapCoin): boolean {
  const symbol = coin.symbol.trim().toUpperCase();
  const address = coin.address.split(":").pop()?.toLowerCase();
  const approvedAddress = CHAIN_TOKEN_ADDRESSES[1]?.[symbol]?.toLowerCase();

  return coin.chainId === 1 &&
    symbol !== "ETH" &&
    Boolean(address && approvedAddress && address === approvedAddress) &&
    Number(coin.decimals) === 18 &&
    TOKEN_DECIMALS[symbol] === 18;
}

/**
 * Build real Ethereum order-book market options only from Reown's Ethereum
 * token list when the token's contract and decimals exactly match OrahDEX's
 * existing escrow allowlist. Prices are references, not book depth or volume.
 */
export function buildReownOrderbookMarkets(
  coins: ReownSwapCoin[],
  markets: PriceMarket[],
): ReownOrderbookMarket[] {
  const prices = new Map<string, PricePoint>();

  for (const market of markets) {
    const { base, quote } = marketParts(market);
    if (!base || !quote || market.type === "futures") continue;
    const price = finitePositive(market.lastPrice ?? market.price);
    if (!price) continue;

    const key = `${base}/${quote}`;
    const candidate = {
      price,
      change: finiteNumber(market.priceChangePercent24h ?? market.chg),
      rank: rankMarketType(market.type),
    };
    const previous = prices.get(key);
    if (!previous || candidate.rank < previous.rank) prices.set(key, candidate);
  }

  const result = new Map<string, ReownOrderbookMarket>();
  for (const coin of coins) {
    if (!approvedEthereumToken(coin)) continue;
    const base = coin.symbol.trim().toUpperCase();
    const symbol = `${base}/ETH`;

    let pricePoint = prices.get(symbol);
    if (!pricePoint) {
      for (const quote of REFERENCE_QUOTES) {
        const baseReference = prices.get(`${base}/${quote}`);
        const ethReference = prices.get(`ETH/${quote}`);
        if (!baseReference || !ethReference || ethReference.price <= 0) continue;
        const derivedPrice = baseReference.price / ethReference.price;
        if (!Number.isFinite(derivedPrice) || derivedPrice <= 0) continue;
        pricePoint = {
          price: derivedPrice,
          change: baseReference.change - ethReference.change,
          rank: 0,
        };
        break;
      }
    }
    if (!pricePoint || pricePoint.price <= 0) continue;

    result.set(symbol, {
      symbol,
      baseAsset: base,
      quoteAsset: "ETH",
      lastPrice: pricePoint.price,
      priceChangePercent24h: pricePoint.change,
      type: "spot",
      network: "ethereum",
      reownOrderbook: true,
      swapOnly: false,
    });
  }

  return [...result.values()].sort((a, b) => a.baseAsset.localeCompare(b.baseAsset));
}
