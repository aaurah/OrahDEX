import assert from "node:assert/strict";
import { test } from "node:test";
import { getMetricsSummary, recordTradeMetric } from "../tradeMetrics.ts";

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

test("aggregates metrics, computes averages, and reports sorted top errors", () => {
  const symbol = unique("BSV/USDT");
  const network = "bsv";
  const walletType = "external";

  recordTradeMetric({
    symbol,
    side: "buy",
    network,
    walletType,
    success: true,
    timings: { precheck: 10, sign: 20, broadcast: 30, confirm: 40, totalMs: 100 },
  });
  recordTradeMetric({
    symbol,
    side: "sell",
    network,
    walletType,
    success: false,
    errorCode: "INSUFFICIENT_BALANCE",
    timings: { precheck: 20, sign: 40, broadcast: 60, confirm: 80, totalMs: 200 },
  });
  recordTradeMetric({
    symbol,
    side: "buy",
    network,
    walletType,
    success: false,
    errorCode: "INSUFFICIENT_BALANCE",
    timings: { precheck: 30, sign: 60, broadcast: 90, confirm: 120, totalMs: 300 },
  });
  recordTradeMetric({
    symbol,
    side: "sell",
    network,
    walletType,
    success: false,
    errorCode: "PRICE_SLIPPAGE",
    timings: { totalMs: 400 },
  });

  const row = getMetricsSummary().find(
    (x) => x.symbol === symbol && x.network === network && x.walletType === walletType,
  );
  assert.ok(row);
  assert.equal(row.count, 4);
  assert.equal(row.failRate, 0.75);
  assert.equal(row.avgTotalMs, 250);
  assert.equal(row.avgPrecheckMs, 15);
  assert.equal(row.avgSignMs, 30);
  assert.equal(row.avgBroadcastMs, 45);
  assert.equal(row.avgConfirmMs, 60);
  assert.deepEqual(row.topErrors, [
    { code: "INSUFFICIENT_BALANCE", count: 2 },
    { code: "PRICE_SLIPPAGE", count: 1 },
  ]);
  assert.equal(row.badge, "unstable");
});

test("assigns performance badges based on latency and failure thresholds", () => {
  const baseNetwork = "evm";
  const walletType = "orahdex";

  const fastSymbol = unique("FAST/USDT");
  recordTradeMetric({
    symbol: fastSymbol,
    side: "buy",
    network: baseNetwork,
    walletType,
    success: true,
    timings: { totalMs: 1200 },
  });
  recordTradeMetric({
    symbol: fastSymbol,
    side: "sell",
    network: baseNetwork,
    walletType,
    success: true,
    timings: { totalMs: 2200 },
  });

  const reliableSymbol = unique("RELIABLE/USDT");
  for (let i = 0; i < 21; i++) {
    recordTradeMetric({
      symbol: reliableSymbol,
      side: "buy",
      network: baseNetwork,
      walletType,
      success: i !== 0,
      errorCode: i === 0 ? "ONE_OFF" : undefined,
      timings: { totalMs: 10_000 },
    });
  }

  const slowSymbol = unique("SLOW/USDT");
  recordTradeMetric({
    symbol: slowSymbol,
    side: "buy",
    network: baseNetwork,
    walletType,
    success: true,
    timings: { totalMs: 35_000 },
  });

  const summary = getMetricsSummary();
  const fast = summary.find((x) => x.symbol === fastSymbol);
  const reliable = summary.find((x) => x.symbol === reliableSymbol);
  const slow = summary.find((x) => x.symbol === slowSymbol);

  assert.equal(fast?.badge, "fast");
  assert.equal(reliable?.badge, "reliable");
  assert.equal(slow?.badge, "slow");
});
