import { useState } from "react";

const COIN_COLORS: Record<string, string> = {
  BSV:"#EAB308", BTC:"#F97316", ETH:"#8B5CF6", SOL:"#06B6D4",
  XRP:"#3B82F6", BNB:"#EAB308", ADA:"#2563EB", DOGE:"#EAB308",
  DOT:"#E11D48", AVAX:"#EF4444", MATIC:"#7C3AED", LINK:"#2563EB",
  UNI:"#EC4899", ATOM:"#6366F1", LTC:"#6B7280", BCH:"#22C55E",
  TRX:"#EF4444", NEAR:"#10B981", APT:"#06B6D4", ARB:"#60A5FA",
  OP:"#EF4444", SUI:"#3B82F6", INJ:"#2563EB", PEPE:"#22C55E",
  SHIB:"#F97316", MKR:"#22C55E", AAVE:"#7C3AED", CRV:"#F43F5E",
  FET:"#06B6D4", AGIX:"#7C3AED", OCEAN:"#2563EB", RNDR:"#F97316",
  USDT:"#22C55E", USDC:"#2563EB", TUSD:"#2563EB", USDD:"#EF4444",
  ETH2:"#8B5CF6", WBTC:"#F97316", DAI:"#EAB308", BUSD:"#EAB308",
  FTM:"#2563EB", CRO:"#2563EB", ALGO:"#10B981", VET:"#22C55E",
  HBAR:"#6B7280", EOS:"#6B7280", XLM:"#6B7280", XMR:"#F97316",
  FIL:"#2563EB", THETA:"#22C55E", GRT:"#7C3AED", SAND:"#F97316",
  MANA:"#F97316", AXS:"#2563EB", FLOW:"#22C55E", ZEC:"#EAB308",
  ENJ:"#2563EB", CHZ:"#EF4444", HOT:"#10B981", CAKE:"#EAB308",
  SUSHI:"#EC4899", YFI:"#2563EB", COMP:"#22C55E", SNX:"#10B981",
};

function coinSources(symbol: string): string[] {
  const sym = symbol.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [
    `https://assets.coincap.io/assets/icons/${sym}@2x.png`,
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${sym}.png`,
    `https://lcw.nyc3.cdn.digitaloceanspaces.com/production/currencies/64/${sym}.png`,
  ];
}

interface Props {
  symbol: string;
  size?: number;
  className?: string;
  ring?: boolean;
}

export function CoinLogo({ symbol, size = 32, className = "", ring = false }: Props) {
  const [srcIdx, setSrcIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  const color = COIN_COLORS[symbol.toUpperCase()] ?? "#6B7280";
  const initials = symbol.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  const fontSize = size <= 20 ? 8 : size <= 28 ? 9 : size <= 36 ? 11 : 12;
  const ringCls = ring ? "ring-2 ring-border" : "";

  const sources = coinSources(symbol);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center text-white font-black shrink-0 rounded-full ${ringCls} ${className}`}
        style={{ width: size, height: size, background: color, fontSize }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={sources[srcIdx]}
      alt={symbol}
      width={size}
      height={size}
      className={`rounded-full object-cover shrink-0 bg-secondary ${ringCls} ${className}`}
      onError={() => {
        if (srcIdx + 1 < sources.length) {
          setSrcIdx(i => i + 1);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

export { COIN_COLORS };
