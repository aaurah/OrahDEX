import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const SEPOLIA_RPC_URL      = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url:      SEPOLIA_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId:  11155111,
    },
    "base-sepolia": {
      url:      BASE_SEPOLIA_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId:  84532,
    },
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts-hardhat",
  },
};

export default config;
