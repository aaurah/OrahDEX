export const CAPABILITY_STATUS_AS_OF = "25 November 2026";

export const CAPABILITY_STATUS = [
  {
    id: "ethereum-orderbook",
    area: "Wallet-funded orderbook",
    status: "Ethereum mainnet only",
    summary:
      "The deployed escrow orderbook supports registered 18-decimal assets on Ethereum. Other chains are not covered by this orderbook path.",
  },
  {
    id: "orderbook-liquidity",
    area: "Order-book liquidity",
    status: "Pair-dependent",
    summary:
      "Executable depth depends on active orders. External quotes and simulated or reference prices are not order-book liquidity.",
  },
  {
    id: "swaps-bridges",
    area: "Swaps and bridges",
    status: "Provider-dependent",
    summary:
      "Quotes do not confirm execution. Check the selected provider, chain transaction, and final settlement before treating an output as received.",
  },
  {
    id: "markets-charts",
    area: "Markets and charts",
    status: "Data-source dependent",
    summary:
      "Prices, candles, and market counts come from configured sources. Some pairs may have no history or temporarily unavailable data.",
  },
  {
    id: "bsv-settlement",
    area: "BSV settlement",
    status: "Route-specific",
    summary:
      "BSV-specific features exist, but not every trade settles on BSV or creates an OP_RETURN record.",
  },
  {
    id: "other-features",
    area: "Futures, prediction, copy, and NFTs",
    status: "Feature-specific",
    summary:
      "Availability and execution vary. A page or API endpoint alone does not establish on-chain settlement, guaranteed liquidity, or yield.",
  },
  {
    id: "fees-providers",
    area: "Fees and providers",
    status: "Quote-specific",
    summary:
      "Fees, limits, and providers vary by route. Review the current quote and transaction details before signing.",
  },
] as const;
