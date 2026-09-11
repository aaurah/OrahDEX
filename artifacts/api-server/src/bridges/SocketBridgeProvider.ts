/**
 * SocketBridgeProvider — real bridge quotes via Socket (socket.tech) v2 API.
 *
 * Socket aggregates Across V2, Stargate, Hop, Connext, cBridge, and many more.
 * A public demo API key is included as a fallback; set SOCKET_API_KEY in env
 * to use a production key with higher rate limits.
 *
 * Docs: https://docs.socket.tech/socket-api/v2
 */

import type { IBridgeProvider, BridgeQuoteParams, BridgeQuote, BuildTxParams, BuiltTx } from "./IBridgeProvider.js";
import { logger } from "../lib/logger.js";

const SOCKET_API_BASE = "https://api.socket.tech/v2";
const SOCKET_API_KEY  = process.env["SOCKET_API_KEY"] ?? "72a5b4b0-e727-48be-8aa1-5da9d62fe635";
const TIMEOUT_MS      = 12_000;

function socketHeaders() {
  return { "API-KEY": SOCKET_API_KEY, "Content-Type": "application/json" };
}

interface SocketProtocol {
  name: string;
  displayName?: string;
  icon?: string;
}

interface SocketStep {
  type: string;
  protocol?: SocketProtocol;
  bridgeSlippage?: number;
  swapSlippage?: number;
  fromAmount?: string;
  toAmount?: string;
}

interface SocketUserTx {
  userTxType?: string;
  txType?: string;
  chainId?: number;
  steps?: SocketStep[];
}

interface SocketRoute {
  routeId?: string;
  fromAmount?: string;
  toAmount?: string;
  serviceTime?: number;
  maxServiceTime?: number;
  totalGasFeesInUsd?: number;
  outputValueInUsd?: number;
  inputValueInUsd?: number;
  usedBridgeNames?: string[];
  userTxs?: SocketUserTx[];
}

function extractBridgeName(route: SocketRoute): string {
  const step = route.userTxs?.[0]?.steps?.find(s => s.type === "bridge" || s.protocol);
  if (step?.protocol?.displayName) return step.protocol.displayName;
  if (step?.protocol?.name)        return step.protocol.name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  if (route.usedBridgeNames?.[0])  return route.usedBridgeNames[0].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return "Bridge";
}

function hexToDecStr(val: string | number | undefined): string {
  if (val === undefined || val === null) return "0";
  const s = String(val);
  if (s.startsWith("0x") || s.startsWith("0X")) {
    try { return BigInt(s).toString(); } catch { return "0"; }
  }
  return s;
}

export class SocketBridgeProvider implements IBridgeProvider {
  id = "socket";

  async getQuotes(params: BridgeQuoteParams): Promise<BridgeQuote[]> {
    const url = new URL(`${SOCKET_API_BASE}/quote`);
    url.searchParams.set("fromChainId",       String(params.fromChainId));
    url.searchParams.set("toChainId",         String(params.toChainId));
    url.searchParams.set("fromTokenAddress",  params.fromTokenAddress);
    url.searchParams.set("toTokenAddress",    params.toTokenAddress);
    url.searchParams.set("fromAmount",        params.amountIn);
    url.searchParams.set("userAddress",       params.userAddress ?? "0x0000000000000000000000000000000000000001");
    url.searchParams.set("sort",              "output");
    url.searchParams.set("uniqueRoutesPerBridge", "true");
    url.searchParams.set("isContractCall",    "false");
    url.searchParams.set("maxUserTxs",        "1");
    url.searchParams.set("bridgeWithGas",     "false");
    url.searchParams.set("bridgeWithInsurance","false");

    const r = await fetch(url.toString(), {
      headers: socketHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Socket /quote HTTP ${r.status}: ${body.slice(0, 200)}`);
    }

    const data = await r.json() as { success?: boolean; result?: { routes?: SocketRoute[] }; message?: string };
    if (!data.success) throw new Error(`Socket quote error: ${data.message ?? "unknown"}`);

    const routes: SocketRoute[] = data.result?.routes ?? [];
    if (routes.length === 0) {
      logger.info({ fromChainId: params.fromChainId, toChainId: params.toChainId }, "Socket: no routes available for this pair");
      return [];
    }

    return routes.slice(0, 5).map((route, i) => this.mapRoute(route, i, params));
  }

  private mapRoute(route: SocketRoute, _index: number, params: BridgeQuoteParams): BridgeQuote {
    const bridgeName  = extractBridgeName(route);
    const routeShort  = (route.routeId ?? `route-${_index}`).slice(0, 8);
    const bridgeSlug  = bridgeName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const providerId  = `socket:${bridgeSlug}:${routeShort}`;

    const amountIn  = params.amountIn;
    const amountOut = route.toAmount ?? "0";

    let fee = "0";
    try {
      const inBig  = BigInt(amountIn);
      const outBig = BigInt(amountOut);
      fee = inBig > outBig ? (inBig - outBig).toString() : "0";
    } catch { fee = "0"; }

    const slippageBps = Math.round(
      (route.userTxs?.[0]?.steps?.find(s => s.type === "bridge")?.bridgeSlippage ?? 0.5) * 100
    );

    return {
      providerId,
      fromChainId:      params.fromChainId,
      toChainId:        params.toChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress:   params.toTokenAddress,
      amountIn,
      amountOut,
      fee,
      estimatedTimeSeconds: route.serviceTime ?? 300,
      slippageBps,
      routeMeta: {
        bridgeName,
        gasFeesUsd:   route.totalGasFeesInUsd ?? 0,
        outputUsd:    route.outputValueInUsd   ?? 0,
        socketRoute:  route,
      },
    };
  }

  async buildTx(params: BuildTxParams): Promise<BuiltTx> {
    const socketRoute = params.quote.routeMeta?.["socketRoute"] as SocketRoute | undefined;
    if (!socketRoute) throw new Error("Missing socketRoute in quote routeMeta — cannot build transaction");

    const r = await fetch(`${SOCKET_API_BASE}/build-tx`, {
      method:  "POST",
      headers: socketHeaders(),
      body:    JSON.stringify({ route: socketRoute }),
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Socket /build-tx HTTP ${r.status}: ${body.slice(0, 200)}`);
    }

    const data = await r.json() as {
      success?: boolean;
      result?: { txData?: { to?: string; data?: string; value?: string | number; chainId?: number } };
      message?: string;
    };

    if (!data.success) throw new Error(`Socket build-tx error: ${data.message ?? "unknown"}`);

    const txData = data.result?.txData;
    if (!txData?.to || !txData?.data) throw new Error("Incomplete txData from Socket build-tx");

    return {
      to:      txData.to,
      data:    txData.data,
      value:   hexToDecStr(txData.value),
      chainId: txData.chainId ?? params.fromChainId,
    };
  }
}
