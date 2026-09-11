import CoinbaseWalletSDK from "@coinbase/wallet-sdk";

let _provider: any | null = null;

function makeProvider() {
  const sdk = new CoinbaseWalletSDK({
    appName: "OrahDEX",
    appLogoUrl:
      typeof window !== "undefined"
        ? `${window.location.origin}/favicon.svg`
        : "https://orahdex.org/favicon.svg",
  });
  return sdk.makeWeb3Provider();
}

export function getCoinbaseProvider(): any | null {
  return _provider;
}

export async function connectCoinbaseWallet(): Promise<{
  address: string;
  chainId: number;
  provider: any;
}> {
  if (!_provider) _provider = makeProvider();

  const accounts: string[] = await _provider.request({
    method: "eth_requestAccounts",
  });
  if (!accounts || accounts.length === 0)
    throw new Error("No accounts returned from Coinbase Wallet");

  const chainIdHex: string = await _provider.request({
    method: "eth_chainId",
  });
  const chainId = parseInt(chainIdHex, 16) || 1;

  return { address: accounts[0], chainId, provider: _provider };
}

export function disconnectCoinbaseWallet(): void {
  if (_provider?.disconnect) {
    try { _provider.disconnect(); } catch { /* ignore */ }
  }
  _provider = null;
}
