/**
 * bsvNetworkConfig.ts — Single source of truth for BSV network parameters.
 *
 * Controlled by the BSV_NETWORK environment variable:
 *   BSV_NETWORK=main  (default) — BSV mainnet
 *   BSV_NETWORK=test            — BSV testnet
 *
 * All BSV-touching modules import from here.
 * No other file should hardcode mainnet/testnet values.
 *
 * BSV testnet parameters (compared to mainnet):
 *   P2PKH version byte : 0x6f (111)  — addresses start with m or n
 *   P2SH  version byte : 0xc4 (196)  — addresses start with 2
 *   WIF   version byte : 0xef (239)
 *   WhatsOnChain API   : /v1/bsv/test/…
 *   Explorer           : https://test.whatsonchain.com
 */

export type BsvNetwork = "main" | "test";

const rawNetwork = process.env.BSV_NETWORK ?? "main";
const network: BsvNetwork = rawNetwork === "test" ? "test" : "main";

const isTestnet = network === "test";

export const BSV_NET = {
  /** "main" | "test" — maps directly to the WhatsOnChain API path segment */
  network,
  isTestnet,

  // ── WhatsOnChain API ──────────────────────────────────────────────────────
  /** Base URL for all WoC REST calls, e.g. `${wocBase}/chain/info` */
  wocBase:      `https://api.whatsonchain.com/v1/bsv/${network}`,
  /** Raw-tx broadcast endpoint */
  wocBroadcast: `https://api.whatsonchain.com/v1/bsv/${network}/tx/raw`,

  // ── Block explorer ────────────────────────────────────────────────────────
  /** Root explorer URL (no trailing slash) */
  explorer: isTestnet ? "https://test.whatsonchain.com" : "https://whatsonchain.com",

  // ── Address encoding (Base58Check version bytes) ──────────────────────────
  /** P2PKH address version byte (mainnet: 0x00 → "1…", testnet: 0x6f → "m…"/"n…") */
  p2pkhVersion: isTestnet ? 0x6f : 0x00,
  /** P2SH address version byte (mainnet: 0x05 → "3…", testnet: 0xc4 → "2…") */
  p2shVersion:  isTestnet ? 0xc4 : 0x05,
  /** WIF private-key version byte (mainnet: 0x80, testnet: 0xef) */
  wifVersion:   isTestnet ? 0xef : 0x80,

  // ── Address validation regex ──────────────────────────────────────────────
  /**
   * Mainnet  P2PKH: starts with 1    (version 0x00)
   * Testnet  P2PKH: starts with m/n  (version 0x6f)
   * Testnet  P2SH : starts with 2    (version 0xc4)
   */
  addressRegex: isTestnet
    ? /^[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/
    : /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/,

  // ── Fee policy ────────────────────────────────────────────────────────────
  /** Default transaction fee in satoshis (testnet: lower, no real cost) */
  feeSat:  isTestnet ? 500 : 1500,
  /** Minimum output value to be considered non-dust */
  dustSat: 546,
} as const;
