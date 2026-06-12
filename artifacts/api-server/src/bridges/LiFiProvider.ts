/**
 * Li.Fi bridge aggregator — real quotes across Stargate, Across, Socket, Hop, etc.
 * Docs: https://docs.li.fi/li.fi-api/li.fi-api
 * Free tier: no API key required for basic usage.
 */

import type { BridgeQuote, BuiltTx } from "./IBridgeProvider.js";
import { logger } from "../lib/logger.js";

const LIFI_API = "https://li.quest/v1";
const DUMMY_ADDR = "0x0000000000000000000000000000000000000001";
const TIMEOUT_MS = 15_000;

interface LiFiTxRequest {
  to: string;
  data: string;
  value: string;
  gasPrice?: string;
  gasLimit?: string;
  from: string;
  chainId: number;
}

interface LiFiStep {
  tool: string;
  toolDetails: { name: string; key: string };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    executionDuration: number;
  };
  transactionRequest?: LiFiTxRequest;
}

interface LiFiRoute {
  id: string;
  steps: LiFiStep[];
  tags: string[];
}

function abortSignal(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT_MS);
}

function hexToDecStr(hex: string): string {
  try { return BigInt(hex).toString(); } catch { return "0"; }
}

export async function getLiFiQuotes(params: {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  amountIn: string;
}): Promise<BridgeQuote[]> {
  const res = await fetch(`${LIFI_API}/advanced/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      fromAmount: params.amountIn,
      fromAddress: DUMMY_ADDR,
      options: { slippage: 0.03, order: "RECOMMENDED", maxPriceImpact: 0.4, allowSwitchChain: false },
    }),
    signal: abortSignal(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Li.Fi routes ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json() as { routes?: LiFiRoute[] };
  const routes = data.routes ?? [];
  logger.info({ count: routes.length }, "bridge-agg: Li.Fi returned routes");

  return routes.slice(0, 5).map((route): BridgeQuote => {
    const step = route.steps?.[0];
    const est  = step?.estimate;
    const fromAmt   = est?.fromAmount  ?? params.amountIn;
    const toAmt     = est?.toAmount    ?? "0";
    const toAmtMin  = est?.toAmountMin ?? toAmt;

    const feeWei = (() => {
      try {
        const diff = BigInt(fromAmt) - BigInt(toAmtMin);
        return diff > 0n ? diff.toString() : "0";
      } catch { return "0"; }
    })();

    const slippageBps = (() => {
      try {
        const toN   = BigInt(toAmt);
        const toMin = BigInt(toAmtMin);
        if (toN === 0n) return 50;
        return Number(((toN - toMin) * 10000n) / toN);
      } catch { return 50; }
    })();

    return {
      providerId: `lifi-${step?.tool ?? route.id}`,
      fromChainId: params.fromChainId,
      toChainId:   params.toChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress:   params.toTokenAddress,
      amountIn:  fromAmt,
      amountOut: toAmt,
      fee:       feeWei,
      estimatedTimeSeconds: est?.executionDuration ?? 300,
      slippageBps,
      routeMeta: {
        tool:     step?.tool ?? "",
        toolName: step?.toolDetails?.name ?? step?.tool ?? "Bridge",
        tags:     route.tags ?? [],
        routeId:  route.id,
      },
    };
  });
}

export async function buildLiFiTx(params: {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  amountIn: string;
  userAddress: string;
  preferredTool?: string;
}): Promise<BuiltTx> {
  const qs = new URLSearchParams({
    fromChain:   String(params.fromChainId),
    toChain:     String(params.toChainId),
    fromToken:   params.fromTokenAddress,
    toToken:     params.toTokenAddress,
    fromAmount:  params.amountIn,
    fromAddress: params.userAddress,
    toAddress:   params.userAddress,
    slippage:    "0.03",
    order:       "RECOMMENDED",
  });

  if (params.preferredTool) {
    qs.set("preferBridges", params.preferredTool);
  }

  const res = await fetch(`${LIFI_API}/quote?${qs}`, {
    signal: abortSignal(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Li.Fi quote ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const txReq: LiFiTxRequest | undefined = data.transactionRequest;

  if (!txReq?.to || !txReq?.data) {
    throw new Error("Li.Fi returned no transaction request for this route");
  }

  return {
    to:      txReq.to,
    data:    txReq.data,
    value:   txReq.value?.startsWith("0x") ? hexToDecStr(txReq.value) : (txReq.value ?? "0"),
    chainId: params.fromChainId,
  };
}
