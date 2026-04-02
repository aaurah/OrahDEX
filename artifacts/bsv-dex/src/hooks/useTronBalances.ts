import { useState, useEffect, useCallback } from "react";

const USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const BTT_TRC20  = "TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4";
const WIN_TRC20  = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const JST_TRC20  = "TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9";

export interface TronTokenBalance {
  symbol:    string;
  amount:    number;
  isNative:  boolean;
  usdValue?: number;
  price?:    number;
}

export function useTronBalances(address: string | null) {
  const [balances, setBalances]   = useState<TronTokenBalance[]>([]);
  const [loading, setLoading]     = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!address || !address.startsWith("T")) {
      setBalances([]);
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch(`https://api.trongrid.io/v1/accounts/${address}`, {
        headers: { Accept: "application/json" },
      });
      const json = await res.json();
      const data = json?.data?.[0];

      if (!data) {
        setBalances([{ symbol: "TRX", amount: 0, isNative: true }]);
        return;
      }

      const trxAmount = Number(data.balance ?? 0) / 1e6;
      const result: TronTokenBalance[] = [
        { symbol: "TRX", amount: trxAmount, isNative: true },
      ];

      const trc20: Record<string, string>[] = data.trc20 ?? [];
      for (const tokenMap of trc20) {
        const usdtRaw = tokenMap[USDT_TRC20];
        if (usdtRaw) {
          result.push({ symbol: "USDT", amount: Number(usdtRaw) / 1e6, isNative: false });
        }
        const bttRaw = tokenMap[BTT_TRC20];
        if (bttRaw) {
          result.push({ symbol: "BTT",  amount: Number(bttRaw)  / 1e18, isNative: false });
        }
        const winRaw = tokenMap[WIN_TRC20];
        if (winRaw) {
          result.push({ symbol: "WIN",  amount: Number(winRaw)  / 1e6,  isNative: false });
        }
        const jstRaw = tokenMap[JST_TRC20];
        if (jstRaw) {
          result.push({ symbol: "JST",  amount: Number(jstRaw)  / 1e18, isNative: false });
        }
      }

      setBalances(result);
    } catch {
      setBalances([{ symbol: "TRX", amount: 0, isNative: true }]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { balances, loading, refresh: fetchBalances };
}
