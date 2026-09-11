import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

const PK = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const accounts = PK ? [PK] : [];

const rpc = (envKey: string, fallback: string) => process.env[envKey] ?? fallback;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat:   {},
    localhost: { url: "http://127.0.0.1:8545" },

    // ── Mainnets (chainIds match evmHtlc.ts EVM_CHAINS) ──────────────────
    ethereum:   { chainId: 1,     accounts, url: rpc("ETH_RPC_URL",      "https://eth.llamarpc.com") },
    polygon:    { chainId: 137,   accounts, url: rpc("POLYGON_RPC_URL",  "https://polygon-rpc.com") },
    bsc:        { chainId: 56,    accounts, url: rpc("BSC_RPC_URL",      "https://bsc-dataseed.binance.org") },
    base:       { chainId: 8453,  accounts, url: rpc("BASE_RPC_URL",     "https://mainnet.base.org") },
    arbitrum:   { chainId: 42161, accounts, url: rpc("ARB_RPC_URL",      "https://arb1.arbitrum.io/rpc") },
    optimism:   { chainId: 10,    accounts, url: rpc("OP_RPC_URL",       "https://mainnet.optimism.io") },
    avalanche:  { chainId: 43114, accounts, url: rpc("AVAX_RPC_URL",     "https://api.avax.network/ext/bc/C/rpc") },
    zksync:     { chainId: 324,   accounts, url: rpc("ZKSYNC_RPC_URL",   "https://mainnet.era.zksync.io") },

    // ── Testnets ─────────────────────────────────────────────────────────
    sepolia:        { chainId: 11155111, accounts, url: rpc("SEPOLIA_RPC_URL",      "https://ethereum-sepolia-rpc.publicnode.com") },
    "base-sepolia": { chainId: 84532,    accounts, url: rpc("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org") },
    "arb-sepolia":  { chainId: 421614,   accounts, url: rpc("ARB_SEPOLIA_RPC_URL",  "https://sepolia-rollup.arbitrum.io/rpc") },
    "op-sepolia":   { chainId: 11155420, accounts, url: rpc("OP_SEPOLIA_RPC_URL",   "https://sepolia.optimism.io") },
    "polygon-amoy": { chainId: 80002,    accounts, url: rpc("AMOY_RPC_URL",         "https://rpc-amoy.polygon.technology") },
    "bsc-testnet":  { chainId: 97,       accounts, url: rpc("BSC_TESTNET_RPC_URL",  "https://data-seed-prebsc-1-s1.binance.org:8545") },
    "avax-fuji":    { chainId: 43113,    accounts, url: rpc("FUJI_RPC_URL",         "https://api.avax-test.network/ext/bc/C/rpc") },
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts-hardhat",
  },
};

export default config;
