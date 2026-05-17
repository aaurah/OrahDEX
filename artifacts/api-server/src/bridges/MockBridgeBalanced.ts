import type { IBridgeProvider, BridgeQuoteParams, BridgeQuote, BuildTxParams, BuiltTx } from "./IBridgeProvider.js";

export class MockBridgeBalanced implements IBridgeProvider {
  id = "mock-balanced";

  async getQuote(params: BridgeQuoteParams): Promise<BridgeQuote | null> {
    try {
      const amtIn = BigInt(params.amountIn);
      const feeRate = 25n; // 0.25%
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
        estimatedTimeSeconds: 180, // 3 minutes
        slippageBps: 8,            // 0.08%
        routeMeta: { via: "Socket (mock)", strategy: "best_output" },
      };
    } catch {
      return null;
    }
  }

  async buildTx(params: BuildTxParams): Promise<BuiltTx> {
    return {
      to: "0x5OcKeTBridgeRouterMockAddress000000000003",
      data: `0xbalanced${params.userAddress.slice(2, 10)}${params.quote.amountIn.slice(0, 8)}`,
      value: params.fromTokenAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
        ? params.quote.amountIn
        : "0",
      chainId: params.fromChainId,
    };
  }
}
