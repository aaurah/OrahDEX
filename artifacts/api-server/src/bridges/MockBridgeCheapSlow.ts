import type { IBridgeProvider, BridgeQuoteParams, BridgeQuote, BuildTxParams, BuiltTx } from "./IBridgeProvider.js";
import { parseUnits, formatUnits } from "viem";

export class MockBridgeCheapSlow implements IBridgeProvider {
  id = "mock-cheap-slow";

  async getQuote(params: BridgeQuoteParams): Promise<BridgeQuote | null> {
    try {
      const amtIn = BigInt(params.amountIn);
      const feeRate = 10n; // 0.10%
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
        estimatedTimeSeconds: 600, // 10 minutes — slow
        slippageBps: 10,           // 0.10%
        routeMeta: { via: "Across V2 (mock)", strategy: "optimistic" },
      };
    } catch {
      return null;
    }
  }

  async buildTx(params: BuildTxParams): Promise<BuiltTx> {
    return {
      to: "0xAcRoSsBridgeRouterMockAddress000000000001",
      data: `0xcheap${params.userAddress.slice(2, 10)}${params.quote.amountIn.slice(0, 8)}`,
      value: params.fromTokenAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
        ? params.quote.amountIn
        : "0",
      chainId: params.fromChainId,
    };
  }
}
