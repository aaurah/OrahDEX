/**
 * OrahDEX — WalletConnect Web3Wallet singleton
 * Enables Orah Wallet to connect TO any web3 dApp that supports WalletConnect v2.
 * Usage: the user copies/scans a WC URI from a dApp → paste here → approve.
 */
import { Core } from "@walletconnect/core";
import { Web3Wallet, type IWeb3Wallet } from "@walletconnect/web3wallet";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";

export { buildApprovedNamespaces, getSdkError };

/** Build a JSON-RPC 2.0 error response (mimics WC's formatJsonRpcError). */
export function formatJsonRpcError(id: number, error: { code: number; message: string } | string) {
  const err = typeof error === "string"
    ? { code: -32000, message: error }
    : error;
  return { id, jsonrpc: "2.0" as const, error: err };
}

// The EVM chains Orah Wallet exposes to connected dApps
export const SUPPORTED_EIP155_CHAINS = [
  "eip155:1",    // Ethereum
  "eip155:56",   // BNB Chain
  "eip155:137",  // Polygon
  "eip155:42161",// Arbitrum
  "eip155:10",   // Optimism
  "eip155:8453", // Base
  "eip155:43114",// Avalanche
  "eip155:59144",// Linea
];

export const SUPPORTED_METHODS = [
  "eth_sendTransaction",
  "eth_signTransaction",
  "eth_sign",
  "personal_sign",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
];

export const SUPPORTED_EVENTS = ["accountsChanged", "chainChanged"];

let _instance: IWeb3Wallet | null = null;
let _initPromise: Promise<IWeb3Wallet> | null = null;

export async function getWeb3Wallet(projectId: string): Promise<IWeb3Wallet> {
  if (_instance) return _instance;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const core = new Core({
      projectId,
      relayUrl: "wss://relay.walletconnect.com",
      logger: "silent",
    });

    const wallet = await Web3Wallet.init({
      core,
      metadata: {
        name: "Orah Wallet",
        description: "OrahDEX Multi-Chain HD Wallet — connect to any web3 app",
        url: "https://orahdex.org",
        icons: ["https://orahdex.org/orah-icon.png"],
      },
    });

    _instance = wallet;
    return wallet;
  })();

  return _initPromise;
}

export function resetWeb3WalletSingleton() {
  _instance = null;
  _initPromise = null;
}

/**
 * Build the eip155 namespace accounts array from the user's EVM address,
 * covering every supported chain.
 */
export function buildEip155Accounts(evmAddress: string): string[] {
  return SUPPORTED_EIP155_CHAINS.map(chain => `${chain}:${evmAddress}`);
}

/**
 * Sign a request using window.ethereum (the currently injected provider).
 * Falls back gracefully if unavailable.
 */
export async function signWithInjected(
  method: string,
  params: unknown[],
): Promise<unknown> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No injected provider — connect an EVM wallet first");
  return eth.request({ method, params });
}
