/**
 * hyperliquidWs.ts — Real-time Hyperliquid WebSocket price feed
 *
 * Uses the official `hyperliquid` npm SDK to subscribe to allMids:
 * all 232+ perpetual mid prices updated every ~100-200 ms with zero polling.
 *
 * Exports:
 *   startHlWebSocket()   — call once at startup; auto-reconnects with backoff
 *   getHlWsMid(coin)     — real-time mid price for a single coin
 *   getHlWsMids()        — all coin→price pairs as a read-only Map
 *   isHlWsConnected()    — true if feed is live and fresh (<10 s old)
 *   getHlWsStatus()      — status blob for the /api/hyperliquid/ws-status route
 *   HL_BUILDER           — builder-code constant for future HL order routing
 */

import { Hyperliquid } from "hyperliquid";
import { logger } from "./logger.js";

// ── In-memory real-time mid price store ───────────────────────────────────────
// coin (e.g. "BTC") → USD mid price (e.g. 64116)
const _mids = new Map<string, number>();

let _connected  = false;
let _lastUpdate = 0;
let _updateCount = 0;
let _sdk: Hyperliquid | null = null;

// ── Builder code ──────────────────────────────────────────────────────────────
//
// Include this in any order routed to Hyperliquid to earn fee revenue.
// Register at: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes
//
// Builder.fee is in tenths-of-a-bps:
//   fee: 1  → 0.1 bps → 0.001 %
//   fee: 10 → 1.0 bps → 0.01 %   ← our default
//   Max: 100 (10 bps / 0.1 %)
export const HL_BUILDER: { address: string; fee: number } = {
  address: process.env.HL_BUILDER_ADDRESS ?? "",
  fee:     10,
};

// ── Public accessors ──────────────────────────────────────────────────────────

/** Real-time mid price for a single coin (e.g. "BTC"). */
export function getHlWsMid(coin: string): number | undefined {
  return _mids.get(coin.toUpperCase());
}

/** All real-time mid prices. Updated every ~100-200 ms when connected. */
export function getHlWsMids(): ReadonlyMap<string, number> {
  return _mids;
}

/**
 * True when the WebSocket is connected AND received an update within the last
 * 10 seconds (guards against silent TCP drops where the socket looks open).
 */
export function isHlWsConnected(): boolean {
  return _connected && _lastUpdate > 0 && Date.now() - _lastUpdate < 10_000;
}

export function getHlWsUpdateCount(): number { return _updateCount; }

export function getHlWsStatus() {
  return {
    connected:      _connected,
    live:           isHlWsConnected(),
    coins:          _mids.size,
    updateCount:    _updateCount,
    lastUpdateMs:   _lastUpdate > 0 ? Date.now() - _lastUpdate : null,
    builderAddress: HL_BUILDER.address || "(not configured)",
    builderFeeBps:  HL_BUILDER.fee / 10,
  };
}

// ── Symbol normalisation ──────────────────────────────────────────────────────
// The SDK converts HL's exchange names ("BTC") to display names ("BTC-PERP").
// We strip the suffix to keep our canonical single-token format.
function canonical(sdkSymbol: string): string {
  if (sdkSymbol.endsWith("-PERP")) return sdkSymbol.slice(0, -5);
  if (sdkSymbol.endsWith("-SPOT")) return sdkSymbol.slice(0, -5);
  return sdkSymbol;
}

// ── Connection + auto-reconnect ───────────────────────────────────────────────

let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _reconnectDelay = 5_000;
const MAX_RECONNECT_DELAY = 120_000;

async function connect(): Promise<void> {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }

  try {
    // Suppress the SDK's verbose console.log output during subscription events
    const origLog = console.log;
    console.log = (..._args: unknown[]) => {};

    _sdk = new Hyperliquid({ enableWs: true, testnet: false });
    await _sdk.connect();

    console.log = origLog; // restore after connect handshake

    _connected      = true;
    _reconnectDelay = 5_000; // reset backoff on success
    logger.info("hyperliquidWs: connected to Hyperliquid WebSocket");

    // Subscribe to allMids — fires every ~100-200 ms with all coin mids
    await _sdk.subscriptions.subscribeToAllMids(
      (mids: Record<string, number | string>) => {
        for (const [sdkSym, rawPx] of Object.entries(mids)) {
          const coin  = canonical(sdkSym).toUpperCase();
          const price = typeof rawPx === "number" ? rawPx : parseFloat(String(rawPx));
          if (coin && Number.isFinite(price) && price > 0) _mids.set(coin, price);
        }
        _lastUpdate = Date.now();
        _updateCount++;

        if (_updateCount === 1) {
          logger.info({ coins: _mids.size }, "hyperliquidWs: first allMids batch received");
        } else if (_updateCount % 3_000 === 0) {
          logger.debug({ updateCount: _updateCount, coins: _mids.size }, "hyperliquidWs: heartbeat");
        }
      }
    );

    // Health monitor: reconnect if 30 s pass without any update
    const healthTimer = setInterval(() => {
      if (!_connected) { clearInterval(healthTimer); return; }
      if (_lastUpdate > 0 && Date.now() - _lastUpdate > 30_000) {
        logger.warn("hyperliquidWs: stale feed (30 s without update) — reconnecting");
        clearInterval(healthTimer);
        _connected = false;
        scheduleReconnect();
      }
    }, 15_000);

  } catch (err: any) {
    _connected = false;
    logger.warn({ err: err?.message }, "hyperliquidWs: connection failed");
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (_reconnectTimer) return;
  const jitter = _reconnectDelay * 0.2 * (Math.random() * 2 - 1);
  const delay  = Math.min(_reconnectDelay + jitter, MAX_RECONNECT_DELAY);
  _reconnectDelay = Math.min(_reconnectDelay * 2, MAX_RECONNECT_DELAY);

  logger.info({ delayMs: Math.round(delay) }, "hyperliquidWs: scheduling reconnect");
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    connect().catch(() => scheduleReconnect());
  }, delay);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function startHlWebSocket(): void {
  logger.info("hyperliquidWs: starting real-time price feed");
  connect().catch(() => scheduleReconnect());
}
