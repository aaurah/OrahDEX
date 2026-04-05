/**
 * BSV Settlement v2 — Golden-Path Test Vectors
 *
 * Self-contained runnable test suite for HTLC parameter invariants and
 * on-chain status determination logic. No test framework required — run with:
 *
 *   npx tsx artifacts/api-server/src/lib/__tests__/htlcVectors.ts
 *
 * ── Design intent ─────────────────────────────────────────────────────────────
 *
 * These vectors are the "mythic canon" for the settlement layer. Any future
 * refactor of htlc.ts, orders.ts, or bsvChainMonitor.ts must keep all cases
 * green. If a business rule changes, update the expected values here first,
 * then update the implementation.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *
 * Section A — Locktime floor invariant
 *   Verifies that locktimeBlocks is always max(currentHeight + 144, 943000 + 144)
 *   regardless of stale or zero chain height cache.
 *
 * Section B — HTLC creation vs skip (dust/fee guard)
 *   Verifies that we only add a P2SH HTLC output when the funding UTXO can
 *   cover HTLC amount + fees + a non-dust change output.
 *
 * Section C — HtlcOnChainStatus determination
 *   Verifies the five-state machine against mocked chain data:
 *   LOCKED | CLAIMED | REFUNDED | EXPIRED | UNKNOWN
 */

// ── Constants (must match htlc.ts) ────────────────────────────────────────────

const MIN_LOCKTIME_BLOCKS = 144;
const ABSOLUTE_FLOOR_HEIGHT = 943000;
const HTLC_MIN_SAT = 1_000;
const DUST_SAT = 546;
const FEE_SAT = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, actual?: unknown): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${actual !== undefined ? ` (got: ${JSON.stringify(actual)})` : ""}`);
    failed++;
  }
}

function assertEquals<T>(label: string, actual: T, expected: T): void {
  assert(`${label} — expected ${JSON.stringify(expected)}`, actual === expected, actual);
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ── Section A: Locktime floor invariant ──────────────────────────────────────

/**
 * Production formula from orders.ts:
 *   locktimeBlocks = Math.max(currentHeight + MIN_LOCKTIME_BLOCKS,
 *                             ABSOLUTE_FLOOR_HEIGHT + MIN_LOCKTIME_BLOCKS)
 */
function computeLocktimeBlocks(currentHeight: number): number {
  return Math.max(
    currentHeight + MIN_LOCKTIME_BLOCKS,
    ABSOLUTE_FLOOR_HEIGHT + MIN_LOCKTIME_BLOCKS,
  );
}

const LOCKTIME_VECTORS: Array<{ currentHeight: number; expected: number; label: string }> = [
  {
    label:    "normal live chain height",
    currentHeight: 943_473,
    expected: 943_473 + 144,              // 943617
  },
  {
    label:    "height exactly at floor",
    currentHeight: 943_000,
    expected: 943_000 + 144,              // same as floor+144
  },
  {
    label:    "height below absolute floor (stale cache)",
    currentHeight: 900_000,
    expected: ABSOLUTE_FLOOR_HEIGHT + 144, // floor wins
  },
  {
    label:    "zero height (cold start / cache miss)",
    currentHeight: 0,
    expected: ABSOLUTE_FLOOR_HEIGHT + 144, // floor wins — no expired HTLC
  },
  {
    label:    "future chain growth",
    currentHeight: 1_000_000,
    expected: 1_000_000 + 144,            // normal path
  },
];

section("A — Locktime floor invariant");
for (const v of LOCKTIME_VECTORS) {
  const actual = computeLocktimeBlocks(v.currentHeight);
  assertEquals(v.label, actual, v.expected);
}

// ── Section B: HTLC creation vs skip (dust/fee guard) ────────────────────────

interface HtlcCreationResult {
  created: boolean;
  htlcSatoshis?: number;
}

/**
 * Mirrors the guard logic in orders.ts broadcastSettlement block:
 *
 *   safeHtlcSat  = HTLC_MIN_SAT
 *   maxHtlcSat   = best.satoshis - FEE_SAT - DUST_SAT
 *   canAddHtlc   = isCrossChain && htlcScript && maxHtlcSat >= safeHtlcSat
 *   htlcSatoshis = Math.min(HTLC_MIN_SAT, maxHtlcSat)
 */
function evaluateHtlcCreation(bestSatoshis: number, isCrossChain: boolean): HtlcCreationResult {
  if (!isCrossChain) return { created: false };
  const safeHtlcSat = HTLC_MIN_SAT;
  const maxHtlcSat  = bestSatoshis - FEE_SAT - DUST_SAT;
  if (maxHtlcSat < safeHtlcSat) return { created: false };
  return { created: true, htlcSatoshis: Math.min(HTLC_MIN_SAT, maxHtlcSat) };
}

interface HtlcCreationVector {
  label:       string;
  satoshis:    number;
  crossChain:  boolean;
  expectCreate: boolean;
  expectSats?:  number;
}

const CREATION_VECTORS: HtlcCreationVector[] = [
  {
    label:       "healthy UTXO — cross-chain: HTLC created at HTLC_MIN_SAT",
    satoshis:    10_000,
    crossChain:  true,
    expectCreate: true,
    expectSats:   HTLC_MIN_SAT,
  },
  {
    label:       "tight UTXO — just enough for HTLC + fee + dust",
    satoshis:    HTLC_MIN_SAT + FEE_SAT + DUST_SAT,  // 2046 sat
    crossChain:  true,
    expectCreate: true,
    expectSats:   HTLC_MIN_SAT,
  },
  {
    label:       "undersized UTXO — one sat below minimum: skip HTLC",
    satoshis:    HTLC_MIN_SAT + FEE_SAT + DUST_SAT - 1, // 2045 sat
    crossChain:  true,
    expectCreate: false,
  },
  {
    label:       "empty UTXO (zero): skip",
    satoshis:    0,
    crossChain:  true,
    expectCreate: false,
  },
  {
    label:       "same-chain fill: NEVER create HTLC regardless of UTXO size",
    satoshis:    100_000,
    crossChain:  false,
    expectCreate: false,
  },
  {
    label:       "bot fill (same-chain): never create HTLC",
    satoshis:    100_000,
    crossChain:  false,
    expectCreate: false,
  },
  {
    label:       "large UTXO — htlcSatoshis capped at HTLC_MIN_SAT",
    satoshis:    1_000_000,
    crossChain:  true,
    expectCreate: true,
    expectSats:   HTLC_MIN_SAT, // cap applies
  },
];

section("B — HTLC creation vs skip (dust/fee guard)");
for (const v of CREATION_VECTORS) {
  const result = evaluateHtlcCreation(v.satoshis, v.crossChain);
  assertEquals(`${v.label} [created]`, result.created, v.expectCreate);
  if (v.expectCreate && v.expectSats !== undefined) {
    assertEquals(`${v.label} [htlcSatoshis]`, result.htlcSatoshis, v.expectSats);
  }
}

// ── Section C: HtlcOnChainStatus state machine ────────────────────────────────

/**
 * Mirrors the logic in bsvChainMonitor.queryHtlcStatus().
 * Inputs are the mocked WhatsOnChain API responses.
 */
interface MockChainState {
  /** UTXOs at the P2SH address (empty = no unspent coins) */
  utxos:       Array<{ value: number }>;
  /** Transaction history (empty = never funded) */
  txHistory:   Array<{ tx_hash: string }>;
  blockHeight: number;
  locktimeBlocks: number;
}

type HtlcStatus = "LOCKED" | "CLAIMED" | "REFUNDED" | "EXPIRED" | "UNKNOWN";

function determineStatus(chain: MockChainState): HtlcStatus {
  const { utxos, txHistory, blockHeight, locktimeBlocks } = chain;
  const hasUtxo = utxos.length > 0;
  const isExpired = blockHeight > 0 && blockHeight >= locktimeBlocks;

  if (hasUtxo) {
    // Coin still present — either LOCKED (active) or EXPIRED (actionable refund)
    return isExpired ? "EXPIRED" : "LOCKED";
  }

  if (txHistory.length > 0) {
    // Coin was funded and then spent — CLAIMED if before locktime, REFUNDED if after
    return isExpired ? "REFUNDED" : "CLAIMED";
  }

  // No UTXOs and no history — never funded or API unreachable
  return "UNKNOWN";
}

interface StatusVector {
  label:    string;
  chain:    MockChainState;
  expected: HtlcStatus;
}

const locktimeBlocks = 943_617; // currentHeight + 144 in a typical scenario

const STATUS_VECTORS: StatusVector[] = [
  {
    label:    "funded, not expired — LOCKED",
    expected: "LOCKED",
    chain: {
      utxos:         [{ value: 1000 }],
      txHistory:     [{ tx_hash: "aaa1" }],
      blockHeight:   943_473,
      locktimeBlocks,
    },
  },
  {
    label:    "funded, locktime reached — EXPIRED (user can refund)",
    expected: "EXPIRED",
    chain: {
      utxos:         [{ value: 1000 }],
      txHistory:     [{ tx_hash: "aaa1" }],
      blockHeight:   locktimeBlocks,
      locktimeBlocks,
    },
  },
  {
    label:    "spent before locktime — CLAIMED (relayer revealed secret)",
    expected: "CLAIMED",
    chain: {
      utxos:         [],
      txHistory:     [{ tx_hash: "aaa1" }, { tx_hash: "bbb2" }],
      blockHeight:   943_473,
      locktimeBlocks,
    },
  },
  {
    label:    "spent at/after locktime — REFUNDED (user swept via CLTV)",
    expected: "REFUNDED",
    chain: {
      utxos:         [],
      txHistory:     [{ tx_hash: "aaa1" }, { tx_hash: "bbb2" }],
      blockHeight:   locktimeBlocks + 10,
      locktimeBlocks,
    },
  },
  {
    label:    "never funded — UNKNOWN",
    expected: "UNKNOWN",
    chain: {
      utxos:         [],
      txHistory:     [],
      blockHeight:   943_473,
      locktimeBlocks,
    },
  },
  {
    label:    "zero blockHeight (API timeout) — UNKNOWN-safe: LOCKED if UTXO present",
    expected: "LOCKED",  // hasUtxo=true, isExpired=false (height=0 < locktime)
    chain: {
      utxos:         [{ value: 1000 }],
      txHistory:     [{ tx_hash: "aaa1" }],
      blockHeight:   0,
      locktimeBlocks,
    },
  },
  {
    label:    "zero blockHeight + no UTXOs + history — fallback CLAIMED (not REFUNDED)",
    expected: "CLAIMED",
    chain: {
      utxos:         [],
      txHistory:     [{ tx_hash: "aaa1" }, { tx_hash: "bbb2" }],
      blockHeight:   0,
      locktimeBlocks,
    },
  },
];

section("C — HtlcOnChainStatus state machine");
for (const v of STATUS_VECTORS) {
  const actual = determineStatus(v.chain);
  assertEquals(v.label, actual, v.expected);
}

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : " ✓"}`);
if (failed > 0) {
  process.exit(1);
}
