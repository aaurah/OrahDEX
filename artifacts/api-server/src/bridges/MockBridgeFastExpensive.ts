import type { IBridgeProvider, BridgeQuoteParams, BridgeQuote, BuildTxParams, BuiltTx } from "./IBridgeProvider.js";

export class MockBridgeFastExpensive implements IBridgeProvider {
  id = "mock-fast-expensive";

  async getQuote(params: BridgeQuoteParams): Promise<BridgeQuote | null> {
    try {
      const amtIn = BigInt(params.amountIn);
      const feeRate = 60n; // 0.60%
      const fee = amtIn * feeRate / 10000n;
      const amountOut = amtIn - fee;

      return {
        providerId: this.id,
        fromChainId: params.fromChainId,
        toChainId: params.toChainId,
        fromTokenAddress: params.fromTokenAddress,
        toTokenAddress: params.toTokenAddress,
        amountIn: params.amountIn,
        amountOut: amountOut.toString(),
        fee: fee.toString(),
        estimatedTimeSeconds: 45, // ~45 seconds — fast
        slippageBps: 5,           // 0.05%
        routeMeta: { via: "Stargate V2 (mock)", strategy: "instant" },
      };
    } catch {
      return null;
    }
  }

  async buildTx(params: BuildTxParams): Promise<BuiltTx> {
    return {
      to: "0x5tArGaTeBridgeRouterMockAddress000000002",
      data: `0xfast${params.userAddress.slice(2, 10)}${params.quote.amountIn.slice(0, 8)}`,
      value: params.fromTokenAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
        ? params.quote.amountIn
        : "0",
      chainId: params.fromChainId,
    };
  }
}
