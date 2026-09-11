export interface BridgeQuoteParams {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  amountIn: string;
  userAddress?: string;
}

export interface BridgeQuote {
  providerId: string;
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  amountIn: string;
  amountOut: string;
  fee: string;
  estimatedTimeSeconds: number;
  slippageBps: number;
  routeMeta?: Record<string, unknown>;
}

export interface BridgeQuoteWithScore extends BridgeQuote {
  score: number;
}

export interface BuildTxParams extends BridgeQuoteParams {
  quote: BridgeQuote;
  userAddress: string;
}

export interface BuiltTx {
  to: string;
  data: string;
  value: string;
  chainId: number;
}

export interface IBridgeProvider {
  id: string;
  /**
   * Return one or more quotes from this provider.
   * Returns [] if the provider is unavailable or the route is unsupported.
   */
  getQuotes(params: BridgeQuoteParams): Promise<BridgeQuote[]>;
  buildTx(params: BuildTxParams): Promise<BuiltTx>;
}
