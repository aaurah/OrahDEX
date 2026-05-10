/**
 * cmcFallback.ts — stubbed
 *
 * Orah now runs its own sovereign price engine (Binance public API +
 * WhatsOnChain + own trades).  CoinMarketCap is no longer a data source.
 * All functions return null so existing call-sites degrade gracefully.
 */

export async function cmcFetchPrices(_symbols: string[]): Promise<null> {
  return null;
}

export async function cmcFetchMarkets(_limit?: number): Promise<null> {
  return null;
}

export async function cmcFetchExchanges(_limit?: number): Promise<null> {
  return null;
}

export async function cmcFetchTickers(_symbol: string): Promise<null> {
  return null;
}
