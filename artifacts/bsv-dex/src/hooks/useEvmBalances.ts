import { useEffect, useState, useCallback } from "react";
import { CHAIN_RPC_URLS } from "@/lib/reown";

export interface TokenBalance {
  symbol: string;
  name: string;
  amount: number;
  usdValue: number;
  price: number;
  change24h: number;
  color: string;
  decimals: number;
  isNative?: boolean;
}

// ERC-20 token registry per chainId
const ERC20_TOKENS: Record<number, Array<{ symbol: string; name: string; address: string; decimals: number; color: string }>> = {
  1: [ // Ethereum Mainnet
    { symbol: "USDT",  name: "Tether USD",    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",       address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6,  color: "#3B82F6" },
    { symbol: "WBTC",  name: "Wrapped BTC",    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8,  color: "#F97316" },
    { symbol: "DAI",   name: "Dai Stablecoin", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, color: "#EAB308" },
    { symbol: "LINK",  name: "Chainlink",      address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18, color: "#3B82F6" },
  ],
  56: [ // BNB Chain
    { symbol: "USDT",  name: "Tether USD",     address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",        address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, color: "#3B82F6" },
    { symbol: "DAI",   name: "Dai Stablecoin",  address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18, color: "#EAB308" },
  ],
  137: [ // Polygon
    { symbol: "USDT",  name: "Tether USD",     address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",        address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6,  color: "#3B82F6" },
    { symbol: "DAI",   name: "Dai Stablecoin",  address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18, color: "#EAB308" },
    { symbol: "WBTC",  name: "Wrapped BTC",     address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8,  color: "#F97316" },
  ],
  42161: [ // Arbitrum One
    { symbol: "USDT",  name: "Tether USD",     address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",        address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", decimals: 6,  color: "#3B82F6" },
    { symbol: "WBTC",  name: "Wrapped BTC",     address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8,  color: "#F97316" },
    { symbol: "DAI",   name: "Dai Stablecoin",  address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18, color: "#EAB308" },
  ],
  10: [ // Optimism
    { symbol: "USDT",  name: "Tether USD",     address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",        address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", decimals: 6,  color: "#3B82F6" },
    { symbol: "DAI",   name: "Dai Stablecoin",  address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18, color: "#EAB308" },
  ],
  8453: [ // Base
    { symbol: "USDT",  name: "Tether USD",      address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",         address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6,  color: "#3B82F6" },
    { symbol: "USDbC", name: "USD Base Coin",    address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", decimals: 6,  color: "#3B82F6" },
    { symbol: "DAI",   name: "Dai Stablecoin",   address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18, color: "#EAB308" },
    { symbol: "cbBTC", name: "Coinbase BTC",     address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8,  color: "#F97316" },
    { symbol: "cbETH", name: "Coinbase ETH",     address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18, color: "#8B5CF6" },
  ],
};

const NATIVE_TOKENS: Record<number, { symbol: string; name: string; color: string; cgId: string }> = {
  1:     { symbol: "ETH",   name: "Ethereum",    color: "#8B5CF6", cgId: "ethereum" },
  56:    { symbol: "BNB",   name: "BNB",         color: "#EAB308", cgId: "binancecoin" },
  137:   { symbol: "POL",   name: "Polygon",      color: "#7C3AED", cgId: "matic-network" },
  42161: { symbol: "ETH",   name: "Ethereum",    color: "#8B5CF6", cgId: "ethereum" },
  10:    { symbol: "ETH",   name: "Ethereum",    color: "#8B5CF6", cgId: "ethereum" },
  8453:  { symbol: "ETH",   name: "Ethereum",    color: "#8B5CF6", cgId: "ethereum" },
  324:   { symbol: "ETH",   name: "Ethereum",    color: "#8B5CF6", cgId: "ethereum" },
};

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

// balanceOf(address) ERC-20 call data
function balanceOfCalldata(address: string): string {
  const padded = address.toLowerCase().replace("0x", "").padStart(64, "0");
  return "0x70a08231" + padded;
}

/**
 * RPC call wrapper — prefers the public JSON-RPC endpoint for the specified
 * chainId so balances are always from the correct chain.
 * Falls back to the injected wallet only when no public RPC is configured.
 */
async function rpcCall(method: string, params: any[], chainId: number): Promise<any> {
  // Try the public RPC for the specific chain first to avoid the injected wallet
  // returning balances for the wrong chain (e.g. MetaMask on Ethereum when user
  // connected Reown on Base).
  const rpcUrl = CHAIN_RPC_URLS[chainId];
  if (rpcUrl) {
    try {
      const res = await globalThis.fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (res.ok) {
        const json = await res.json();
        if (!json.error) return json.result;
      }
    } catch {
      /* fall through to injected wallet */
    }
  }

  // Fallback: injected wallet (only if same chain is active)
  const injected = (window as any).ethereum;
  if (injected) {
    try {
      const walletChainHex: string = await injected.request({ method: "eth_chainId", params: [] });
      const walletChain = parseInt(walletChainHex, 16);
      if (walletChain === chainId) {
        return await injected.request({ method, params });
      }
    } catch { /* ignore */ }
  }

  throw new Error(`No RPC available for chainId ${chainId}`);
}

export function useEvmBalances(address: string | null, chainId: number | null) {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const fetch = useCallback(async () => {
    if (!address || !chainId) return;

    setLoading(true);
    try {
      // 1. Get native token balance
      const nativeHex: string = await rpcCall("eth_getBalance", [address, "latest"], chainId);
      const nativeWei = BigInt(nativeHex);
      const nativeAmount = Number(nativeWei) / 1e18;

      const nativeDef = NATIVE_TOKENS[chainId] ?? { symbol: "ETH", name: "Ethereum", color: "#8B5CF6", cgId: "ethereum" };

      // 2. Fetch prices for native token + stablecoins from our API
      const priceRes = await globalThis.fetch(`${BASE_URL}/api/dex/prices`);
      const priceData = priceRes.ok ? await priceRes.json() : {};

      // Build price map including native token by cgId
      const cgPriceMap: Record<string, { usd: number; change24h: number }> = {
        ethereum:    { usd: priceData.ETH?.usd   ?? 3200, change24h: priceData.ETH?.change24h   ?? 0 },
        binancecoin: { usd: priceData.BNB?.usd   ?? 600,  change24h: priceData.BNB?.change24h   ?? 0 },
        "matic-network": { usd: priceData.POL?.usd ?? 0.9, change24h: priceData.POL?.change24h  ?? 0 },
      };
      const stablePrices: Record<string, number> = { USDT: 1, USDC: 1, DAI: 1, BUSD: 1 };

      const nativePrice = cgPriceMap[nativeDef.cgId] ?? { usd: 0, change24h: 0 };

      const result: TokenBalance[] = [];

      // Always include native token (even dust or zero)
      result.push({
        symbol: nativeDef.symbol,
        name: nativeDef.name,
        amount: nativeAmount,
        usdValue: nativeAmount * nativePrice.usd,
        price: nativePrice.usd,
        change24h: nativePrice.change24h,
        color: nativeDef.color,
        decimals: 18,
        isNative: true,
      });

      // 3. Fetch ERC-20 balances for this chain
      const tokens = ERC20_TOKENS[chainId] ?? [];
      const erc20Results = await Promise.allSettled(
        tokens.map(async (token) => {
          const hexBal: string = await rpcCall("eth_call", [
            { to: token.address, data: balanceOfCalldata(address) },
            "latest",
          ], chainId);
          const raw = BigInt(hexBal || "0x0");
          const amount = Number(raw) / Math.pow(10, token.decimals);
          return { token, amount };
        })
      );

      for (const r of erc20Results) {
        if (r.status !== "fulfilled") continue;
        const { token, amount } = r.value;
        if (amount <= 0) continue;
        const price = stablePrices[token.symbol] ?? priceData[token.symbol]?.usd ?? 0;
        const change = priceData[token.symbol]?.change24h ?? 0;
        result.push({
          symbol: token.symbol,
          name: token.name,
          amount,
          usdValue: amount * price,
          price,
          change24h: change,
          color: token.color,
          decimals: token.symbol === "WBTC" ? 6 : 2,
        });
      }

      // Sort by USD value descending
      result.sort((a, b) => b.usdValue - a.usdValue);

      setBalances(result);
      setLastFetch(Date.now());
    } catch (err) {
      console.error("EVM balance fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    if (!address || !chainId) return;
    fetch();
    // Refresh every 30 seconds
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, [fetch]);

  return { balances, loading, refresh: fetch, lastFetch };
}
