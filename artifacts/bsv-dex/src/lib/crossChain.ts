export const ASSET_NATIVE_CHAIN: Record<string, string> = {
  BSV: "bsv",
  BTC: "bitcoin",
  LTC: "litecoin",
  ADA: "cardano",
  SOL: "solana",
  TRX: "tron",
  XRP: "ripple",
  DOT: "polkadot",
  ATOM: "cosmos",
  XLM: "stellar",
  ALGO: "algorand",
  NEAR: "near",
  SUI: "sui",
  APT: "aptos",
  FIL: "filecoin",
  HBAR: "hedera",
  ICP: "internet-computer",
  VET: "vechain",
  TON: "ton",
  KAS: "kaspa",
  EGLD: "multiversx",
};

export const CHAIN_DISPLAY: Record<string, string> = {
  cardano:             "Cardano",
  solana:              "Solana",
  tron:                "TRON",
  ripple:              "XRP Ledger",
  polkadot:            "Polkadot",
  cosmos:              "Cosmos",
  stellar:             "Stellar",
  algorand:            "Algorand",
  near:                "NEAR Protocol",
  sui:                 "Sui",
  aptos:               "Aptos",
  filecoin:            "Filecoin",
  hedera:              "Hedera",
  "internet-computer": "Internet Computer",
  vechain:             "VeChain",
  ton:                 "TON",
  kaspa:               "Kaspa",
  multiversx:          "MultiversX",
  bitcoin:             "Bitcoin",
  litecoin:            "Litecoin",
  bsv:                 "BSV",
};

export const ADDRESS_PLACEHOLDERS: Record<string, string> = {
  cardano:  "addr1q…",
  solana:   "4Zg8…",
  tron:     "T…",
  ripple:   "r…",
  polkadot: "1…",
  cosmos:   "cosmos1…",
  stellar:  "G…",
  algorand: "ALGO…",
  near:     "you.near",
  bitcoin:  "bc1q…",
  litecoin: "ltc1…",
};

export function getAssetNativeChain(symbol: string): string {
  return ASSET_NATIVE_CHAIN[symbol.toUpperCase()] ?? "evm";
}

export function walletCanReceive(
  walletNetwork: string | null | undefined,
  assetChain: string,
): boolean {
  const net = walletNetwork ?? "evm";
  if (assetChain === "evm")    return net === "evm";
  if (assetChain === "bsv")    return net === "bsv" || net === "bsv-test";
  if (assetChain === "tron")   return net === "tron";
  if (assetChain === "solana") return net === "sol";
  return false;
}
