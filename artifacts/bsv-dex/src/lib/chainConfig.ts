/**
 * OrahDEX per-chain configuration.
 * Single source of truth for chain metadata, RPC endpoints,
 * DEX router addresses, and token contract addresses.
 *
 * Chain switch in wallet → load CHAINS[newChainId] → re-init RPC + contracts.
 */

export interface ChainTokenInfo {
  address: string;
  decimals: number;
  symbol: string;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeSymbol: string;
  nativeName: string;
  nativeColor: string;
  /** Uniswap v2-compatible router for swap quoting */
  router: string;
  /** Well-known ERC-20 tokens on this chain, keyed by symbol */
  tokens: Record<string, ChainTokenInfo>;
}

export const CHAINS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    shortName: "ETH",
    rpcUrl: "https://ethereum.publicnode.com",
    explorerUrl: "https://etherscan.io",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeColor: "#8B5CF6",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488", // Uniswap v2
    tokens: {
      USDT: { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
      USDC: { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      WBTC: { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
      DAI:  { symbol: "DAI",  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
      LINK: { symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
    },
  },
  56: {
    chainId: 56,
    name: "BNB Chain",
    shortName: "BNB",
    rpcUrl: "https://bsc-dataseed.binance.org",
    explorerUrl: "https://bscscan.com",
    nativeSymbol: "BNB",
    nativeName: "BNB",
    nativeColor: "#EAB308",
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap v2
    tokens: {
      USDT:  { symbol: "USDT",  address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
      USDC:  { symbol: "USDC",  address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
      DAI:   { symbol: "DAI",   address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18 },
      BUSD:  { symbol: "BUSD",  address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18 },
      CAKE:  { symbol: "CAKE",  address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18 },
    },
  },
  137: {
    chainId: 137,
    name: "Polygon",
    shortName: "MATIC",
    rpcUrl: "https://polygon-rpc.com",
    explorerUrl: "https://polygonscan.com",
    nativeSymbol: "POL",
    nativeName: "Polygon",
    nativeColor: "#7C3AED",
    router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // QuickSwap
    tokens: {
      USDT: { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
      USDC: { symbol: "USDC", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
      DAI:  { symbol: "DAI",  address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
      WBTC: { symbol: "WBTC", address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
    },
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    shortName: "ARB",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeColor: "#8B5CF6",
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", // SushiSwap on Arbitrum
    tokens: {
      USDT: { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
      USDC: { symbol: "USDC", address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", decimals: 6 },
      WBTC: { symbol: "WBTC", address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8 },
      DAI:  { symbol: "DAI",  address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 },
    },
  },
  10: {
    chainId: 10,
    name: "Optimism",
    shortName: "OP",
    rpcUrl: "https://mainnet.optimism.io",
    explorerUrl: "https://optimistic.etherscan.io",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeColor: "#8B5CF6",
    router: "0x9c12939390052919aF3155f41Bf4160Fd3666A6", // Velodrome-compatible
    tokens: {
      USDT: { symbol: "USDT", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
      USDC: { symbol: "USDC", address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", decimals: 6 },
      DAI:  { symbol: "DAI",  address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 },
    },
  },
  8453: {
    chainId: 8453,
    name: "Base",
    shortName: "BASE",
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeColor: "#8B5CF6",
    router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", // BaseSwap V2 router
    tokens: {
      USDT:  { symbol: "USDT",  address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
      USDC:  { symbol: "USDC",  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
      USDbC: { symbol: "USDbC", address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", decimals: 6 },
      DAI:   { symbol: "DAI",   address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
      cbBTC: { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
      WBTC:  { symbol: "WBTC",  address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
      cbETH: { symbol: "cbETH", address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18 },
    },
  },
  59144: {
    chainId: 59144,
    name: "Linea",
    shortName: "LINEA",
    rpcUrl: "https://rpc.linea.build",
    explorerUrl: "https://lineascan.build",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeColor: "#8B5CF6",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488",
    tokens: {
      USDC: { symbol: "USDC", address: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", decimals: 6 },
      USDT: { symbol: "USDT", address: "0xA219439258ca9da29E9Cc4cE5596924745e12B93", decimals: 6 },
    },
  },
  324: {
    chainId: 324,
    name: "zkSync Era",
    shortName: "ZK",
    rpcUrl: "https://mainnet.era.zksync.io",
    explorerUrl: "https://explorer.zksync.io",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeColor: "#8B5CF6",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488",
    tokens: {
      USDC: { symbol: "USDC", address: "0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4", decimals: 6 },
      USDT: { symbol: "USDT", address: "0x493257fD37EDB34451f62EDf8D2a0C418852bA4C", decimals: 6 },
    },
  },
  43114: {
    chainId: 43114,
    name: "Avalanche",
    shortName: "AVAX",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    explorerUrl: "https://snowtrace.io",
    nativeSymbol: "AVAX",
    nativeName: "Avalanche",
    nativeColor: "#EF4444",
    router: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4", // TraderJoe
    tokens: {
      USDT: { symbol: "USDT", address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6 },
      USDC: { symbol: "USDC", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 },
    },
  },
  250: {
    chainId: 250,
    name: "Fantom",
    shortName: "FTM",
    rpcUrl: "https://rpc.ftm.tools",
    explorerUrl: "https://ftmscan.com",
    nativeSymbol: "FTM",
    nativeName: "Fantom",
    nativeColor: "#3B82F6",
    router: "0xF491e7B69E4244ad4002BC14e878a34207E38c29", // SpookySwap
    tokens: {
      USDT: { symbol: "USDT", address: "0x049d68029688eAbF473097a2fC38ef61633A3C7A", decimals: 6 },
      USDC: { symbol: "USDC", address: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75", decimals: 6 },
    },
  },
  25: {
    chainId: 25,
    name: "Cronos",
    shortName: "CRO",
    rpcUrl: "https://evm.cronos.org",
    explorerUrl: "https://cronoscan.com",
    nativeSymbol: "CRO",
    nativeName: "Cronos",
    nativeColor: "#3B82F6",
    router: "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae", // VVS Finance
    tokens: {
      USDT: { symbol: "USDT", address: "0x66e428c3f67a68878562e79A0234c1F83c208770", decimals: 6 },
      USDC: { symbol: "USDC", address: "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59", decimals: 6 },
    },
  },
  5000: {
    chainId: 5000,
    name: "Mantle",
    shortName: "MNT",
    rpcUrl: "https://rpc.mantle.xyz",
    explorerUrl: "https://explorer.mantle.xyz",
    nativeSymbol: "MNT",
    nativeName: "Mantle",
    nativeColor: "#22C55E",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488",
    tokens: {
      USDT: { symbol: "USDT", address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE", decimals: 6 },
    },
  },
  534352: {
    chainId: 534352,
    name: "Scroll",
    shortName: "SCROLL",
    rpcUrl: "https://rpc.scroll.io",
    explorerUrl: "https://scrollscan.com",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeColor: "#8B5CF6",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488",
    tokens: {
      USDC: { symbol: "USDC", address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4", decimals: 6 },
      USDT: { symbol: "USDT", address: "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df", decimals: 6 },
    },
  },

  // ── Additional chains ────────────────────────────────────────────────────────
  100: {
    chainId: 100,
    name: "Gnosis",
    shortName: "GNO",
    rpcUrl: "https://rpc.gnosischain.com",
    explorerUrl: "https://gnosisscan.io",
    nativeSymbol: "xDAI",
    nativeName: "xDAI",
    nativeColor: "#22C55E",
    router: "0x1C232F01118CB8B424793ae03F870aa7D0ac7f77", // HoneySwap
    tokens: {
      USDC: { symbol: "USDC", address: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83", decimals: 6 },
      USDT: { symbol: "USDT", address: "0x4ECaBa5870353805a9F068101A40E0f32ed605C6", decimals: 6 },
    },
  },
  42220: {
    chainId: 42220,
    name: "Celo",
    shortName: "CELO",
    rpcUrl: "https://forno.celo.org",
    explorerUrl: "https://explorer.celo.org/mainnet",
    nativeSymbol: "CELO",
    nativeName: "Celo",
    nativeColor: "#EAB308",
    router: "0xE3D8bd6Aed4F159bc8000a9cD47CffDb95F96121", // Ubeswap
    tokens: {
      USDC: { symbol: "USDC", address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", decimals: 6 },
      USDT: { symbol: "USDT", address: "0x88eeC49252c8cbc039DCdB394c0c2BA2f1637EA0", decimals: 6 },
    },
  },
  1284: {
    chainId: 1284,
    name: "Moonbeam",
    shortName: "GLMR",
    rpcUrl: "https://rpc.api.moonbeam.network",
    explorerUrl: "https://moonscan.io",
    nativeSymbol: "GLMR",
    nativeName: "Glimmer",
    nativeColor: "#818CF8",
    router: "0x70085a09D30D6f8C4ecF6eE10120d1847383BB57", // StellaSwap
    tokens: {
      USDC: { symbol: "USDC", address: "0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0e", decimals: 6 },
      USDT: { symbol: "USDT", address: "0xeFAeeE334F0Fd1712f9a8cc375f427D9Cdd40d73", decimals: 6 },
    },
  },
  146: {
    chainId: 146,
    name: "Sonic",
    shortName: "S",
    rpcUrl: "https://rpc.soniclabs.com",
    explorerUrl: "https://sonicscan.org",
    nativeSymbol: "S",
    nativeName: "Sonic",
    nativeColor: "#3B82F6",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488",
    tokens: {
      USDC: { symbol: "USDC", address: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894", decimals: 6 },
    },
  },
  81457: {
    chainId: 81457,
    name: "Blast",
    shortName: "BLAST",
    rpcUrl: "https://rpc.blast.io",
    explorerUrl: "https://blastscan.io",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeColor: "#EAB308",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488",
    tokens: {
      USDB: { symbol: "USDB", address: "0x4300000000000000000000000000000000000003", decimals: 18 },
    },
  },
  34443: {
    chainId: 34443,
    name: "Mode",
    shortName: "MODE",
    rpcUrl: "https://mainnet.mode.network",
    explorerUrl: "https://explorer.mode.network",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeColor: "#8B5CF6",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488",
    tokens: {
      USDC: { symbol: "USDC", address: "0xd988097fb8612cc24eeC14542bC03424c656005f", decimals: 6 },
    },
  },
  288: {
    chainId: 288,
    name: "Boba Network",
    shortName: "BOBA",
    rpcUrl: "https://mainnet.boba.network",
    explorerUrl: "https://bobascan.com",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeColor: "#22D3EE",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488",
    tokens: {
      USDC: { symbol: "USDC", address: "0x66a2A913e447d6b4BF33EFbec43aAeF87890FBbc", decimals: 6 },
      USDT: { symbol: "USDT", address: "0x5DE1677344D3Cb0D7D465c10b72A8f60699C062d", decimals: 6 },
    },
  },
  1088: {
    chainId: 1088,
    name: "Metis",
    shortName: "METIS",
    rpcUrl: "https://andromeda.metis.io/?owner=1088",
    explorerUrl: "https://andromeda-explorer.metis.io",
    nativeSymbol: "METIS",
    nativeName: "Metis",
    nativeColor: "#00D2FF",
    router: "0x1E876cCe41B7b844FDe09E38Fa1cf00f213bFf56", // NetSwap
    tokens: {
      USDC: { symbol: "USDC", address: "0xEA32A96608495e54156Ae48931A7c20f0dcc1a21", decimals: 6 },
      USDT: { symbol: "USDT", address: "0xbB06DCA3AE6887fAbF931640f67cab3e3a16F4dC", decimals: 6 },
    },
  },
  167000: {
    chainId: 167000,
    name: "Taiko",
    shortName: "TAIKO",
    rpcUrl: "https://rpc.mainnet.taiko.xyz",
    explorerUrl: "https://taikoscan.io",
    nativeSymbol: "ETH",
    nativeName: "Ethereum",
    nativeColor: "#EF4444",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488",
    tokens: {
      USDC: { symbol: "USDC", address: "0x07d83526730c7438048D55A4fc0b850e2aaB6f0b", decimals: 6 },
    },
  },
};

/**
 * Get token contract info for a given chain + symbol.
 * Returns undefined if the token is not in the registry for that chain.
 */
export function getChainToken(chainId: number, symbol: string): ChainTokenInfo | undefined {
  return CHAINS[chainId]?.tokens[symbol.toUpperCase()];
}

/**
 * Get the DEX router address for a given chain.
 */
export function getChainRouter(chainId: number): string {
  return CHAINS[chainId]?.router ?? CHAINS[1].router;
}

/**
 * Get the native token symbol for a given chain.
 */
export function getNativeSymbol(chainId: number): string {
  return CHAINS[chainId]?.nativeSymbol ?? "ETH";
}

/**
 * Get the chain name for display.
 */
export function getChainName(chainId: number): string {
  return CHAINS[chainId]?.name ?? `Chain ${chainId}`;
}
