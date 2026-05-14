import type { TokenBalance } from "@/hooks/useEvmBalances";

interface ResolveNftBalanceInput {
  isEvm: boolean;
  isOrahWallet: boolean;
  storeBalance: number | string | null | undefined;
  evmBalances: TokenBalance[] | null | undefined;
  evmBalancesLoading: boolean;
  mintCurrency: string | null | undefined;
}

interface ResolveNftBalanceOutput {
  availableAmount: number;
  hasLoadedBalance: boolean;
  availableLabel: string | null;
}

const NATIVE_CURRENCY_SYMBOLS = new Set(["ETH", "WETH", "BNB", "MATIC", "AVAX"]);

export function resolveNftSpendBalance({
  isEvm,
  isOrahWallet,
  storeBalance,
  evmBalances,
  evmBalancesLoading,
  mintCurrency,
}: ResolveNftBalanceInput): ResolveNftBalanceOutput {
  const currency = (mintCurrency ?? "BSV").toUpperCase();
  const wantsBsv = currency === "BSV" || !isEvm || isOrahWallet;

  if (wantsBsv) {
    const amount = Number(storeBalance ?? 0) || 0;
    return {
      availableAmount: amount,
      hasLoadedBalance: storeBalance != null,
      availableLabel: storeBalance != null ? `${amount.toFixed(6)} BSV` : null,
    };
  }

  const balances = evmBalances ?? [];
  const fallbackNative = balances.find((b) => b.isNative);
  const exact = balances.find((b) => b.symbol.toUpperCase() === currency);
  const selected = exact ?? (NATIVE_CURRENCY_SYMBOLS.has(currency) ? fallbackNative : undefined);
  const amount = Number(selected?.amount ?? 0) || 0;
  const labelSymbol = selected?.symbol ?? currency;

  return {
    availableAmount: amount,
    hasLoadedBalance: !evmBalancesLoading,
    availableLabel: !evmBalancesLoading ? `${amount.toFixed(4)} ${labelSymbol}` : null,
  };
}
