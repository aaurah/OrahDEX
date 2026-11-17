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

export function getBsvNetworkConfig(selectedNetwork: BsvNetwork) {
  const isTestnet = selectedNetwork === "test";

  return {
    network: selectedNetwork,
    isTestnet,
    wocBase:      `https://api.whatsonchain.com/v1/bsv/${selectedNetwork}`,
    wocBroadcast: `https://api.whatsonchain.com/v1/bsv/${selectedNetwork}/tx/raw`,
    explorer:     isTestnet ? "https://test.whatsonchain.com" : "https://whatsonchain.com",
    p2pkhVersion: isTestnet ? 0x6f : 0x00,
    p2shVersion:  isTestnet ? 0xc4 : 0x05,
    wifVersion:   isTestnet ? 0xef : 0x80,
    // Mainnet P2PKH/P2SH: 1…/3…; testnet P2PKH/P2SH: m…/n…/2…
    addressRegex: isTestnet
      ? /^[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/
      : /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/,
    feeSat:  isTestnet ? 500 : 1500,
    dustSat: 546,
  } as const;
}

export const BSV_NET = getBsvNetworkConfig(network);
