---
name: Alchemy + QuickNode RPC integration
description: How Alchemy/QuickNode RPC is wired into OrahDEX backend and frontend.
---

## Architecture

**Priority order** (in `quicknode.ts`): QuickNode full URL (`QN_*_ENDPOINT`) → Alchemy (`ALCHEMY_API_KEY`) → public RPC fallback.

**Backend secret**: `ALCHEMY_API_KEY` — builds `https://{chain-host}.g.alchemy.com/v2/{key}` for 7 EVM chains + Solana.

**Backend proxy**: `POST /api/rpc/:chainId` in `routes/quicknode.ts` — transparently routes to whichever provider is configured. Also `POST /api/rpc/solana`.

**Frontend** (`lib/reown.ts`): `CHAIN_RPC_URLS` and `wagmiConfig.transports` both call `_proxy(chainId)` = `${window.location.origin}${BASE_URL}/api/rpc/:chainId`. VITE_QN_*_RPC overrides in `.env` bypass the proxy if set directly (faster, but key exposed in bundle).

**Also updated**: `solanaWallet.ts` uses `QN_SOL_ENDPOINT → ALCHEMY_API_KEY → SOLANA_RPC_URL → public`. `admin.ts` RPC_URLS use `QN_*_ENDPOINT → ETH_RPC_URL → public`.

**Why:** Keeps Alchemy key server-side only; proxy adds one hop but ensures key rotation doesn't require a frontend rebuild. QuickNode add-on swap API (`/api/quicknode/swap/price|quote`) requires `QN_*_ENDPOINT` with addon 614 enabled — not available via Alchemy.

**Status endpoint**: `GET /api/quicknode/status` — returns `{alchemy_key_set, solana, chains: {eth, bsc, base, ...}}` with provider name per chain.
