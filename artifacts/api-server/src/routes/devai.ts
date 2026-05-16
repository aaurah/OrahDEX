import { Router, raw } from "express";
import { db, pool } from "@workspace/db";
import { conversations, messages } from "@workspace/db/schema";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, asc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { requireAdminToken } from "../middleware/adminAuth.js";
import vm from "vm";
import fs from "fs/promises";
import path from "path";
import { exec, spawn } from "child_process";

const router = Router();

// ── Internal API base (same process, same port) ───────────────────────────────
const INTERNAL = `http://localhost:${process.env.PORT ?? 4000}`;
const GH_HEADERS = (token?: string) => ({
  "User-Agent": "OrahDEX-DevAI/2.0",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

// ── System prompt ─────────────────────────────────────────────────────────────
const DEVAI_SYSTEM_PROMPT = `You are OrahDevAI — the developer intelligence and blockchain AI of OrahDEX (orahdex.org), a sovereign decentralized exchange where every coin is listed and all trades settle on BSV (Bitcoin SV).

You are a senior blockchain engineer. You write production-ready code, debug smart contracts, analyse on-chain data, and build bots. You have live tools — use them.

## Your Tools (use them proactively)
- **read_github_file** — Read actual source code from any GitHub repo. Use when the user shares a repo link or mentions their code files.
- **list_github_repo** — Browse a repo's directory structure. Use to understand project layout before reading files.
- **execute_code** — Run JavaScript in a sandbox and see real output. Use to validate logic, compute values, simulate algorithms, test encoding/decoding.
- **fetch_url** — Fetch live content from any URL. Use to check live API responses, read docs, verify endpoint behaviour.
- **create_file** — Generate a downloadable file. ALWAYS use this when you write a complete bot, script, config, or contract — never just paste code in chat when you could deliver a file the user can run immediately.
- **fetch_bsv_tx** — Look up a live BSV transaction on WhatsOnChain. Use when the user provides a txid or asks about BSV on-chain activity.
- **get_orahdex_market** — Fetch live OrahDEX market data (prices, orderbooks, 24h stats). Use when the user asks about prices, liquidity, or market conditions.
- **decode_eth_address** — Fetch EVM address info: native balance, recent transactions. Use when the user shares an ETH/EVM address.
- **read_project_file** — Read any live source file from the OrahDEX Replit workspace. Use to inspect backend routes, frontend components, DB schema, configs.
- **list_project_dir** — Browse any directory in the OrahDEX workspace. Use to navigate the project structure before reading specific files.
- **query_database** — Run a read-only SELECT query against the live OrahDEX PostgreSQL database. Use to inspect real data, schemas, order books, user counts, etc.
- **write_project_file** — Write or overwrite any file in the workspace. Use this to implement features, fix bugs, add routes, update components, or change configs. ALWAYS read the file first if it already exists so you don't lose code.
- **run_terminal** — Run a shell command in the workspace root (60s timeout). Use to install packages (pnpm add), check git status, run builds, restart services, list files, or any system task.
- **publish** — After writing any code changes, ALWAYS call `POST /api/admin/devai/restart` using fetch_url or instruct the user to click the Publish button. This restarts both services so changes go live within ~5 seconds.

## Primary GitHub repository
The main OrahDEX codebase lives at **github.com/aaurah/OrahDEX**. When the user asks about the codebase, repo structure, or "the code" without specifying a repo, default to \`aaurah/OrahDEX\`. Use \`list_github_repo\` first to explore, then \`read_github_file\` to read specific files.

## Tool usage rules
- Always use **create_file** when you produce a complete script or bot (not just a code snippet in chat).
- Always use **get_orahdex_market** before writing a trading bot (get real symbol names and prices).
- Always use **fetch_bsv_tx** when the user gives you a txid — never guess what it does.
- Always use **read_github_file** when the user shares a GitHub URL — read the actual code.
- Always use **read_project_file** / **list_project_dir** when asked about the live Replit backend or frontend source files.
- Always use **query_database** when asked about live data, table structure, or database state.
- When writing code changes: read the file first → make the edit with write_project_file → then ALWAYS restart so changes go live → confirm with the user.
- After EVERY write_project_file call, immediately run_terminal with `curl -s -X POST http://localhost:3000/api/admin/devai/restart -H "X-Admin-Token: $ADMIN_TOKEN"` OR instruct the user to click the green Publish button.
- Chain tools intelligently: explore → read → write → restart → verify.

## Self-upgrade capability
You can upgrade yourself. Your own source files are:
- **Backend (tools, system prompt, API logic):** \`artifacts/api-server/src/routes/devai.ts\`
- **Frontend (UI, chat interface, tool display):** \`artifacts/bsv-dex/src/pages/DevAI.tsx\`

### How to add a new tool to yourself:
1. Read \`artifacts/api-server/src/routes/devai.ts\` first
2. Add the tool definition to the \`DEVAI_TOOLS\` array (follow the exact same shape as existing tools)
3. Write the \`async function toolYourName(args)\` implementation
4. Add a \`case "your_tool_name":\` line in the \`executeTool\` switch dispatcher
5. Read \`artifacts/bsv-dex/src/pages/DevAI.tsx\` and add the tool to \`TOOL_META\` and \`toolSubtitle\`
6. Restart the API server: \`run_terminal\` → \`pkill -f "api-server" || true\` — the workflow manager restarts it automatically within seconds

### How to update your system prompt (this document):
- The system prompt is the \`DEVAI_SYSTEM_PROMPT\` constant at the top of \`artifacts/api-server/src/routes/devai.ts\`
- Read the file, make changes, write it back, then restart

### Restarting / Publishing changes:
- Use the green **Publish** button in the DevAI toolbar — it hits \`POST /api/admin/devai/restart\` and restarts both services
- Or via run_terminal: \`pkill -f "tsx watch" || true\` for API changes, \`pkill -f "vite" || true\` for frontend
- Frontend .tsx/.ts changes hot-reload automatically without restart
- Backend devai.ts changes require a server restart to take effect
- ALWAYS tell the user to click Publish (or do it yourself) after writing backend files

## Workspace layout (Replit)
Root: /home/runner/workspace
- artifacts/api-server/src/routes/devai.ts  — YOUR OWN BACKEND (tools, prompt, logic)
- artifacts/bsv-dex/src/pages/DevAI.tsx     — YOUR OWN FRONTEND (chat UI, tool display)
- artifacts/api-server/src/   — All Express API routes
- artifacts/bsv-dex/src/      — React+Vite frontend
- lib/db/src/schema.ts         — Drizzle ORM schema (all tables)
- lib/db/src/index.ts          — DB connection (pool + drizzle instance)

## Blockchain Knowledge
**BSV (Bitcoin SV)**
- UTXO model, Merkle proofs, OP_RETURN data embedding, BRC-20 tokens, 1Sat Ordinals
- Script opcodes: OP_DUP, OP_HASH160, OP_EQUALVERIFY, OP_CHECKSIG (P2PKH), OP_RETURN (data)
- HD derivation: m/44'/236'/0'/0/0 (BSV), m/44'/60'/0'/0/0 (EVM)
- @bsv/sdk: Transaction, P2PKH, Script, PrivKey, PublicKey, Signature
- Broadcast via: api.whatsonchain.com/v1/bsv/main/tx/raw

**EVM / Ethereum**
- ABI encoding: function selectors (first 4 bytes of keccak256), calldata layout
- ERC-20: transfer(address,uint256), balanceOf(address), approve+transferFrom
- ERC-721 / ERC-1155: NFT standards, tokenURI, safeTransferFrom
- Gas optimisation: storage slots, packing, unchecked arithmetic, calldata vs memory
- Events/logs: indexed topics, bloom filters, eth_getLogs
- Multicall3: batch multiple read calls in one RPC request

**DeFi**
- AMM math: x*y=k (Uniswap v2), concentrated liquidity (v3), tick ranges
- Impermanent loss: IL = 2√k/(1+k) - 1 where k = price_ratio
- Flash loans: borrow → use → repay + fee in one atomic tx
- MEV: sandwich attacks, frontrunning, backrunning, private mempools (Flashbots)
- Yield: APY = (1 + APR/n)^n - 1

**OrahDEX REST API (base: https://orahdex.org/api)**
GET  /api/markets                              — all listed pairs
GET  /api/markets/:symbol/ticker               — single pair ticker
GET  /api/markets/:symbol/orderbook            — { bids, asks }
POST /api/orders                               — { symbol, side, type, price?, quantity, walletAddress }
GET  /api/orders?walletAddress=               — open orders
DELETE /api/orders/:id                         — cancel order
GET  /api/trades?symbol=&limit=               — recent trades
GET  /api/portfolio?walletAddress=            — portfolio holdings
POST /api/swap/quote                           — { fromToken, toToken, amount, walletAddress }
POST /api/swap/execute                         — unsigned swap tx
GET  /api/bridge/providers                     — bridge providers
POST /api/bridge/quote                         — cross-chain quote
GET  /api/futures/positions                    — open futures
POST /api/futures/order                        — { symbol, side, leverage, margin, type }
GET  /api/health                               — { bsvBlock, mempoolTxs, status }
GET  /api/deposit/address/:walletAddress       — BSV deposit address
POST /api/withdrawals                          — initiate withdrawal

WebSocket: wss://orahdex.org/ws
Subscribe: { type: "subscribe", channel: "ticker:BSV/USDT" }
Channels: ticker:<PAIR>, orderbook:<PAIR>, trades:<PAIR>, portfolio:<WALLET>

## Keeper Protocol fee tiers
Standard: 30bps | Guardian (1K ORAH): 25bps | Elder (10K ORAH): 20bps | Archon (100K ORAH): 15bps

## Response rules
- Skip preamble — go straight to the answer or tool call
- Use TypeScript by default; Python on request
- Always show error handling in code
- For transaction building: always build unsigned — never include private keys
- When you write a complete file: use create_file so the user can download it
- Today is May 2026`;

// ── Tool definitions (OpenAI function calling) ─────────────────────────────────
const DEVAI_TOOLS: any[] = [
  {
    type: "function",
    function: {
      name: "read_github_file",
      description: "Read a specific file from a GitHub repository. Use when the user shares a GitHub URL or mentions code in their repo.",
      parameters: {
        type: "object",
        properties: {
          owner_repo: { type: "string", description: "owner/repo e.g. 'bitcoin-sv/ts-sdk'" },
          path: { type: "string", description: "File path e.g. 'src/index.ts'" },
          branch: { type: "string", description: "Branch name, omit for default branch" },
        },
        required: ["owner_repo", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_github_repo",
      description: "List files and directories in a GitHub repository. Use to explore project structure.",
      parameters: {
        type: "object",
        properties: {
          owner_repo: { type: "string", description: "owner/repo format" },
          path: { type: "string", description: "Directory path, omit for root" },
        },
        required: ["owner_repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_code",
      description: "Execute JavaScript code in a sandbox and return the output. Use to validate logic, compute blockchain values, test encoding, or demonstrate algorithms.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "JavaScript code to execute (synchronous, console.log for output)" },
          description: { type: "string", description: "Brief description of what this computes" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch live content from any URL. Use to check API responses, read documentation, or verify endpoint behaviour.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create a downloadable file for the user. ALWAYS use this when generating a complete bot, script, smart contract, or config. The user downloads and runs it immediately.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Filename with extension e.g. 'market-maker.ts'" },
          content: { type: "string", description: "Full file content" },
          language: { type: "string", description: "Language for syntax highlighting e.g. typescript, python, solidity" },
        },
        required: ["filename", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_bsv_tx",
      description: "Fetch live BSV transaction details from WhatsOnChain blockchain explorer. Use when the user provides a BSV txid.",
      parameters: {
        type: "object",
        properties: {
          txid: { type: "string", description: "BSV transaction ID (64-char hex)" },
        },
        required: ["txid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_orahdex_market",
      description: "Fetch live OrahDEX market data including price, volume, and orderbook. Use before writing trading bots to get real symbol names and current prices.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading pair e.g. 'BSV/USDT'. Omit for top markets overview." },
          include_orderbook: { type: "boolean", description: "Also fetch the orderbook (bids/asks)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "decode_eth_address",
      description: "Fetch EVM address information: native coin balance and recent activity. Use when the user shares an Ethereum or EVM wallet address.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "EVM address (0x...)" },
          chain: { type: "string", description: "Chain name: eth, bsc, polygon, arbitrum, base. Default: eth" },
        },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_project_file",
      description: "Read a live source file from the OrahDEX Replit workspace. Use to inspect backend routes, frontend components, DB schema, package.json, configs, etc. Paths are relative to /home/runner/workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to workspace root, e.g. 'artifacts/api-server/src/routes/devai.ts' or 'lib/db/src/schema.ts'" },
          offset: { type: "number", description: "Line number to start reading from (1-indexed). Use for large files." },
          limit: { type: "number", description: "Number of lines to read (max 200). Default 200." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_project_dir",
      description: "List files and directories in the OrahDEX Replit workspace. Use to explore the project structure before reading specific files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path relative to workspace root. Omit or use '.' for root." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_database",
      description: "Run a read-only SELECT query against the live OrahDEX PostgreSQL database. Use to inspect table schemas, row counts, live orders, users, market data, or any stored data. Only SELECT statements are allowed.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "A read-only SQL SELECT statement. LIMIT your results (max 100 rows). Example: 'SELECT table_name FROM information_schema.tables WHERE table_schema=\\'public\\' ORDER BY table_name'" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_project_file",
      description: "Write or overwrite a file in the OrahDEX Replit workspace. Use this to implement features, fix bugs, create new routes, update components, or any code change. ALWAYS read the file first with read_project_file if it already exists. Paths are relative to /home/runner/workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to workspace root, e.g. 'artifacts/api-server/src/routes/orders.ts'" },
          content: { type: "string", description: "Full file content to write" },
          description: { type: "string", description: "Brief description of what this change does" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_terminal",
      description: "Run a shell command in the OrahDEX workspace root (/home/runner/workspace). Use to install packages (pnpm add), run builds, check git status, list processes, run scripts, or perform any system task. Commands run with a 60-second timeout.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run, e.g. 'pnpm --filter @workspace/api-server add zod' or 'git status' or 'ls artifacts/api-server/src/routes/'" },
          description: { type: "string", description: "Brief description of what this command does" },
        },
        required: ["command"],
      },
    },
  },
];

// ── Tool implementations ───────────────────────────────────────────────────────

async function toolReadGithubFile(args: { owner_repo: string; path: string; branch?: string }): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const qs = args.branch ? `?ref=${encodeURIComponent(args.branch)}` : "";
  const url = `https://api.github.com/repos/${args.owner_repo}/contents/${args.path}${qs}`;
  try {
    const r = await fetch(url, { headers: GH_HEADERS(token), signal: AbortSignal.timeout(12000) });
    if (!r.ok) {
      if (r.status === 404) return `File not found: ${args.owner_repo}/${args.path}`;
      if (r.status === 401) return "GitHub authentication failed. Token may be invalid.";
      return `GitHub API error: ${r.status} ${r.statusText}`;
    }
    const data = await r.json() as any;
    if (data.encoding === "base64" && data.content) {
      const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
      if (content.length > 12000) return content.slice(0, 12000) + "\n\n[...truncated at 12000 chars]";
      return content;
    }
    if (Array.isArray(data)) return "This is a directory. Use list_github_repo to browse it.";
    return JSON.stringify(data).slice(0, 4000);
  } catch (err: any) {
    return `Error reading file: ${err?.message ?? "Network error"}`;
  }
}

async function toolListGithubRepo(args: { owner_repo: string; path?: string }): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const path = args.path ? `/${args.path.replace(/^\//, "")}` : "";
  const url = `https://api.github.com/repos/${args.owner_repo}/contents${path}`;
  try {
    const r = await fetch(url, { headers: GH_HEADERS(token), signal: AbortSignal.timeout(10000) });
    if (!r.ok) {
      if (r.status === 404) return `Repo or path not found: ${args.owner_repo}${path}`;
      return `GitHub API error: ${r.status} ${r.statusText}`;
    }
    const data = await r.json() as any[];
    if (!Array.isArray(data)) return "This is a file, not a directory. Use read_github_file to read it.";
    return data
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
      .map(f => `${f.type === "dir" ? "DIR " : "    "} ${f.name}${f.type !== "dir" ? ` (${(f.size ?? 0).toLocaleString()} bytes)` : "/"}`)
      .join("\n");
  } catch (err: any) {
    return `Error listing repo: ${err?.message ?? "Network error"}`;
  }
}

function toolExecuteCode(args: { code: string; description?: string }): string {
  const logs: string[] = [];
  const sandbox = vm.createContext({
    console: {
      log: (...a: any[]) => logs.push(a.map((x: any) => (typeof x === "object" ? JSON.stringify(x, null, 2) : String(x))).join(" ")),
      error: (...a: any[]) => logs.push("ERR: " + a.map(String).join(" ")),
      warn: (...a: any[]) => logs.push("WARN: " + a.map(String).join(" ")),
      info: (...a: any[]) => logs.push(a.map(String).join(" ")),
      table: (data: any) => logs.push(JSON.stringify(data, null, 2)),
    },
    Math,
    JSON: { parse: JSON.parse, stringify: JSON.stringify },
    Array, Object, String, Number, Boolean, Date, RegExp, Set, Map,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    Buffer,
    BigInt,
    Symbol,
  });
  try {
    vm.runInContext(args.code, sandbox, { timeout: 5000 });
    return logs.length > 0 ? logs.join("\n") : "(no output — add console.log() to see results)";
  } catch (err: any) {
    return `RuntimeError: ${err?.message?.slice(0, 800) ?? "Execution failed"}`;
  }
}

async function toolFetchUrl(args: { url: string }): Promise<string> {
  try {
    const r = await fetch(args.url, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "OrahDEX-DevAI/2.0", Accept: "application/json, text/plain, */*" },
    });
    const ct = r.headers.get("content-type") ?? "";
    let body: string;
    if (ct.includes("json")) {
      const json = await r.json();
      body = JSON.stringify(json, null, 2).slice(0, 6000);
    } else {
      const text = await r.text();
      body = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
    }
    return `HTTP ${r.status} ${r.statusText}\nContent-Type: ${ct}\n\n${body}`;
  } catch (err: any) {
    return `FetchError: ${err?.message ?? "Network error"}`;
  }
}

async function toolFetchBsvTx(args: { txid: string }): Promise<string> {
  const txid = args.txid.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(txid)) return "Invalid txid — must be 64 hex characters.";
  try {
    const r = await fetch(`https://api.whatsonchain.com/v1/bsv/main/tx/hash/${txid}`, {
      headers: { "User-Agent": "OrahDEX-DevAI/2.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) {
      if (r.status === 404) return `Transaction not found: ${txid}`;
      return `WhatsOnChain error: ${r.status} ${r.statusText}`;
    }
    const d = await r.json() as any;
    const out = {
      txid: d.txid,
      block_height: d.blockheight ?? "unconfirmed",
      confirmations: d.confirmations ?? 0,
      time: d.time ? new Date(d.time * 1000).toISOString() : "unconfirmed",
      fee_satoshis: d.fees,
      size_bytes: d.size,
      inputs: (d.vin ?? []).slice(0, 10).map((i: any) => ({
        prev_txid: i.txid,
        vout: i.vout,
        sequence: i.sequence,
      })),
      outputs: (d.vout ?? []).map((o: any) => ({
        index: o.n,
        value_bsv: o.value,
        value_satoshis: Math.round(o.value * 1e8),
        addresses: o.scriptPubKey?.addresses ?? [],
        asm: o.scriptPubKey?.asm?.slice(0, 100),
        type: o.scriptPubKey?.type,
      })),
    };
    return JSON.stringify(out, null, 2);
  } catch (err: any) {
    return `Error: ${err?.message ?? "WhatsOnChain unreachable"}`;
  }
}

async function toolGetOrahDEXMarket(args: { symbol?: string; include_orderbook?: boolean }): Promise<string> {
  try {
    if (args.symbol) {
      const sym = encodeURIComponent(args.symbol);
      const [tickerR, obR] = await Promise.all([
        fetch(`${INTERNAL}/api/markets/${sym}/ticker`, { signal: AbortSignal.timeout(5000) }),
        args.include_orderbook
          ? fetch(`${INTERNAL}/api/markets/${sym}/orderbook`, { signal: AbortSignal.timeout(5000) })
          : Promise.resolve(null),
      ]);
      if (!tickerR.ok) return `Market not found: ${args.symbol}`;
      const ticker = await tickerR.json();
      const result: any = { symbol: args.symbol, ticker };
      if (obR?.ok) {
        const ob = await obR.json() as any;
        result.orderbook = {
          top_bids: (ob.bids ?? []).slice(0, 5),
          top_asks: (ob.asks ?? []).slice(0, 5),
        };
      }
      return JSON.stringify(result, null, 2);
    }
    const r = await fetch(`${INTERNAL}/api/markets`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return `Markets API error: ${r.status}`;
    const data = await r.json() as any[];
    const top = (Array.isArray(data) ? data : []).slice(0, 20).map((m: any) => ({
      symbol: m.symbol,
      price: m.price ?? m.last,
      change_24h: m.change24h ?? m.change,
      volume_24h: m.volume24h ?? m.volume,
    }));
    return JSON.stringify(top, null, 2);
  } catch (err: any) {
    return `Market data error: ${err?.message ?? "Internal API unreachable"}`;
  }
}

async function toolDecodeEthAddress(args: { address: string; chain?: string }): Promise<string> {
  const addr = args.address.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return "Invalid EVM address format. Must be 0x followed by 40 hex chars.";

  const SCAN_APIS: Record<string, { api: string; symbol: string }> = {
    eth:      { api: "https://api.etherscan.io/api",     symbol: "ETH" },
    bsc:      { api: "https://api.bscscan.com/api",      symbol: "BNB" },
    polygon:  { api: "https://api.polygonscan.com/api",  symbol: "MATIC" },
    arbitrum: { api: "https://api.arbiscan.io/api",      symbol: "ETH" },
    base:     { api: "https://api.basescan.org/api",     symbol: "ETH" },
  };

  const chainKey = (args.chain ?? "eth").toLowerCase();
  const info = SCAN_APIS[chainKey] ?? SCAN_APIS.eth;

  try {
    const balR = await fetch(`${info.api}?module=account&action=balance&address=${addr}&tag=latest`, {
      headers: { "User-Agent": "OrahDEX-DevAI/2.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!balR.ok) return `Scan API error: ${balR.status}`;
    const balData = await balR.json() as any;
    if (balData.status !== "1") {
      return JSON.stringify({ address: addr, chain: chainKey, note: "API returned error (possibly rate-limited without API key)", raw: balData }, null, 2);
    }
    const balWei = BigInt(balData.result ?? "0");
    const balNative = (Number(balWei) / 1e18).toFixed(8);

    return JSON.stringify({
      address: addr,
      chain: chainKey,
      native_balance: `${balNative} ${info.symbol}`,
      native_balance_wei: balData.result,
      note: "Token balances require an API key. Use get_orahdex_market to check OrahDEX positions.",
    }, null, 2);
  } catch (err: any) {
    return `EVM lookup error: ${err?.message ?? "Network error"}`;
  }
}

const WORKSPACE_ROOT = "/home/runner/workspace";

function execAsync(cmd: string, cwd: string, timeout: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, timeout, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
      if (err && !stdout && !stderr) return reject(err);
      resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

async function toolWriteProjectFile(args: { path: string; content: string; description?: string }): Promise<string> {
  try {
    const safePath = path.resolve(WORKSPACE_ROOT, args.path.replace(/^\//, ""));
    if (!safePath.startsWith(WORKSPACE_ROOT)) return "Access denied: path outside workspace.";
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, args.content, "utf-8");
    const lines = args.content.split("\n").length;
    return `Written: ${args.path} (${lines} lines, ${args.content.length.toLocaleString()} chars)${args.description ? `\n${args.description}` : ""}`;
  } catch (err: any) {
    return `Error writing file: ${err?.message ?? "Unknown error"}`;
  }
}

async function toolRunTerminal(args: { command: string; description?: string }): Promise<string> {
  const BLOCKED_PATTERNS = [/rm\s+-rf\s+\//, /:\(\)\{.*\}/, /mkfs/, /dd\s+if=\/dev\/zero/];
  if (BLOCKED_PATTERNS.some(p => p.test(args.command))) {
    return "Command blocked for safety. Destructive system-level operations are not allowed.";
  }
  try {
    const { stdout, stderr } = await execAsync(args.command, WORKSPACE_ROOT, 60000);
    const out = [
      args.description ? `$ ${args.description}` : `$ ${args.command}`,
      stdout.trim() ? stdout.trim().slice(0, 6000) : "",
      stderr.trim() ? `[stderr] ${stderr.trim().slice(0, 2000)}` : "",
    ].filter(Boolean).join("\n");
    return out || "(command completed with no output)";
  } catch (err: any) {
    return `Command failed: ${err?.message?.slice(0, 800) ?? "Execution error"}`;
  }
}

async function toolReadProjectFile(args: { path: string; offset?: number; limit?: number }): Promise<string> {
  try {
    const safePath = path.resolve(WORKSPACE_ROOT, args.path.replace(/^\//, ""));
    if (!safePath.startsWith(WORKSPACE_ROOT)) return "Access denied: path outside workspace.";
    const raw = await fs.readFile(safePath, "utf-8");
    const lines = raw.split("\n");
    const offset = Math.max(0, (args.offset ?? 1) - 1);
    const limit = Math.min(200, args.limit ?? 200);
    const slice = lines.slice(offset, offset + limit);
    const totalLines = lines.length;
    const header = `File: ${args.path} (${totalLines} lines total, showing ${offset + 1}-${offset + slice.length})\n${"─".repeat(60)}\n`;
    return header + slice.map((l, i) => `${String(offset + i + 1).padStart(4)} ${l}`).join("\n");
  } catch (err: any) {
    if (err?.code === "ENOENT") return `File not found: ${args.path}`;
    if (err?.code === "EISDIR") return `Path is a directory. Use list_project_dir instead.`;
    return `Error reading file: ${err?.message ?? "Unknown error"}`;
  }
}

async function toolListProjectDir(args: { path?: string }): Promise<string> {
  try {
    const dirPath = args.path && args.path !== "." ? args.path.replace(/^\//, "") : "";
    const safePath = path.resolve(WORKSPACE_ROOT, dirPath);
    if (!safePath.startsWith(WORKSPACE_ROOT)) return "Access denied: path outside workspace.";
    const entries = await fs.readdir(safePath, { withFileTypes: true });
    const IGNORE = new Set(["node_modules", ".git", "dist", ".cache", "__pycache__", ".turbo"]);
    const filtered = entries.filter(e => !IGNORE.has(e.name) && !e.name.startsWith("."));
    const dirs = filtered.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    const files = filtered.filter(e => !e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    const lines: string[] = [`Directory: ${dirPath || "/"} (${entries.length} entries)\n${"─".repeat(60)}`];
    for (const d of dirs) lines.push(`  DIR  ${d.name}/`);
    for (const f of files) {
      try {
        const stat = await fs.stat(path.join(safePath, f.name));
        lines.push(`       ${f.name} (${stat.size.toLocaleString()} bytes)`);
      } catch {
        lines.push(`       ${f.name}`);
      }
    }
    return lines.join("\n");
  } catch (err: any) {
    if (err?.code === "ENOENT") return `Directory not found: ${args.path}`;
    return `Error listing directory: ${err?.message ?? "Unknown error"}`;
  }
}

async function toolQueryDatabase(args: { sql: string }): Promise<string> {
  const query = args.sql.trim();
  const upper = query.toUpperCase().replace(/\s+/g, " ");
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    return "Only SELECT (and WITH ... SELECT) queries are allowed for safety.";
  }
  const BLOCKED = ["INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE", "GRANT", "REVOKE"];
  if (BLOCKED.some(kw => upper.includes(kw))) {
    return "Write operations are not permitted. Only read-only SELECT queries allowed.";
  }
  // Enforce row limit
  const limitedQuery = upper.includes("LIMIT") ? query : `${query} LIMIT 100`;
  try {
    const result = await pool.query(limitedQuery);
    const { rows, fields } = result;
    if (!rows.length) return "Query returned 0 rows.";
    const headers = fields.map(f => f.name);
    const colWidths = headers.map((h, i) =>
      Math.min(40, Math.max(h.length, ...rows.map(r => String(r[h] ?? "null").length)))
    );
    const sep = colWidths.map(w => "─".repeat(w + 2)).join("┼");
    const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(" │ ");
    const dataRows = rows.map(row =>
      headers.map((h, i) => String(row[h] ?? "null").slice(0, 40).padEnd(colWidths[i])).join(" │ ")
    );
    return [`${rows.length} row${rows.length === 1 ? "" : "s"} returned`, "─" + sep, headerRow, "─" + sep, ...dataRows, "─" + sep].join("\n");
  } catch (err: any) {
    return `SQL error: ${err?.message ?? "Query failed"}`;
  }
}

// ── Tool dispatcher ────────────────────────────────────────────────────────────
interface ToolResult {
  output: string;
  file?: { id: string; filename: string; content: string; language: string };
}

async function executeTool(name: string, args: any, callId: string): Promise<ToolResult> {
  switch (name) {
    case "read_github_file":   return { output: await toolReadGithubFile(args) };
    case "list_github_repo":   return { output: await toolListGithubRepo(args) };
    case "execute_code":       return { output: toolExecuteCode(args) };
    case "fetch_url":          return { output: await toolFetchUrl(args) };
    case "create_file":        return {
      output: `File "${args.filename}" ready for download (${args.content?.length ?? 0} chars).`,
      file: { id: callId, filename: args.filename, content: args.content ?? "", language: args.language ?? "text" },
    };
    case "fetch_bsv_tx":       return { output: await toolFetchBsvTx(args) };
    case "get_orahdex_market": return { output: await toolGetOrahDEXMarket(args) };
    case "decode_eth_address": return { output: await toolDecodeEthAddress(args) };
    case "read_project_file":  return { output: await toolReadProjectFile(args) };
    case "list_project_dir":   return { output: await toolListProjectDir(args) };
    case "query_database":     return { output: await toolQueryDatabase(args) };
    case "write_project_file": return { output: await toolWriteProjectFile(args) };
    case "run_terminal":       return { output: await toolRunTerminal(args) };
    default:                   return { output: `Unknown tool: ${name}` };
  }
}

// ── Helper: SSE write ─────────────────────────────────────────────────────────
function sse(res: any, payload: object) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// ── GET /devai/conversations ───────────────────────────────────────────────────
router.get("/devai/conversations", requireAdminToken, async (_req, res) => {
  try {
    const rows = await db
      .select({ id: conversations.id, title: conversations.title, createdAt: conversations.createdAt })
      .from(conversations)
      .orderBy(conversations.id);
    res.json(rows.reverse());
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /devai/conversations ─────────────────────────────────────────────────
router.post("/devai/conversations", requireAdminToken, async (_req, res) => {
  try {
    const [conv] = await db.insert(conversations).values({ title: "New Dev Session" }).returning();
    res.json({ id: conv.id, title: conv.title, createdAt: conv.createdAt });
  } catch (err: any) {
    logger.error({ err: err?.message }, "DevAI: failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// ── GET /devai/conversations/:id ───────────────────────────────────────────────
router.get("/devai/conversations/:id", requireAdminToken, async (req, res) => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
    res.json({ ...conv, messages: msgs });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /devai/conversations/:id/messages — agentic SSE ──────────────────────
router.post("/devai/conversations/:id/messages", requireAdminToken, async (req, res) => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const content = (req.body?.content ?? "").trim();
  if (!content) { res.status(400).json({ error: "Content is required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    await db.insert(messages).values({ conversationId: id, role: "user", content });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    type ChatMsg =
      | { role: "system"; content: string }
      | { role: "user"; content: string }
      | { role: "assistant"; content: string | null; tool_calls?: any[] }
      | { role: "tool"; tool_call_id: string; content: string };

    const chatMessages: ChatMsg[] = [
      { role: "system", content: DEVAI_SYSTEM_PROMPT },
      ...history.slice(-24).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // ── Agentic tool-use loop (non-streaming) ──────────────────────────────────
    const MAX_TOOL_ROUNDS = 8;
    let toolRounds = 0;
    let finalTextFromLoop: string | null = null;

    while (toolRounds < MAX_TOOL_ROUNDS) {
      const resp = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 6000,
        messages: chatMessages as any,
        tools: DEVAI_TOOLS,
        tool_choice: "auto",
        stream: false,
      });

      const choice = resp.choices[0];
      const msg = choice.message;

      if (choice.finish_reason === "tool_calls" && msg.tool_calls?.length) {
        // Push assistant message with tool_calls
        chatMessages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });

        // Execute each tool, stream events
        for (const tc of msg.tool_calls) {
          const name = tc.function.name;
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments ?? "{}"); } catch { /* invalid json */ }

          sse(res, { tool_call: { id: tc.id, name, args } });

          let result: ToolResult;
          try {
            result = await executeTool(name, args, tc.id);
          } catch (err: any) {
            result = { output: `Tool error: ${err?.message ?? "Unknown"}` };
          }

          sse(res, { tool_result: { id: tc.id, name, output: result.output.slice(0, 8000) } });
          if (result.file) sse(res, { file: result.file });

          chatMessages.push({ role: "tool", tool_call_id: tc.id, content: result.output.slice(0, 8000) });
        }
        toolRounds++;
        continue;
      }

      // No tool calls — capture text and break
      finalTextFromLoop = msg.content ?? "";
      break;
    }

    // ── Final streaming response ───────────────────────────────────────────────
    let fullResponse = "";

    if (toolRounds === 0 && finalTextFromLoop !== null) {
      // No tools used: stream the already-received content in chunks (avoid extra API call)
      const text = finalTextFromLoop;
      for (let i = 0; i < text.length; i += 6) {
        const chunk = text.slice(i, i + 6);
        fullResponse += chunk;
        sse(res, { content: chunk });
        // tiny yield so the event loop can flush
        await new Promise(r => setImmediate(r));
      }
    } else {
      // Tools were used: make a final streaming call for a natural summary response
      const finalStream = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 8192,
        messages: chatMessages as any,
        stream: true,
      });

      for await (const chunk of finalStream) {
        const token = chunk.choices[0]?.delta?.content;
        if (token) {
          fullResponse += token;
          sse(res, { content: token });
        }
      }
    }

    // ── Persist final response ─────────────────────────────────────────────────
    if (fullResponse) {
      await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });
    }

    // Auto-title conversation
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (conv?.title === "New Dev Session") {
      await db.update(conversations).set({ title: content.slice(0, 60).trim() }).where(eq(conversations.id, id));
    }

    sse(res, { done: true });
    res.end();
  } catch (err: any) {
    logger.error({ err: err?.message }, "DevAI: chat error");
    sse(res, { error: err?.message ?? "AI error" });
    res.end();
  }
});

// ── GET /admin/devai/github ────────────────────────────────────────────────────
router.get("/admin/devai/github", async (_req, res) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) { res.json({ connected: false, repos: [] }); return; }
  try {
    const [userRes, reposRes] = await Promise.all([
      fetch("https://api.github.com/user", { headers: GH_HEADERS(token) }),
      fetch("https://api.github.com/user/repos?per_page=30&sort=updated", { headers: GH_HEADERS(token) }),
    ]);
    if (!userRes.ok) { res.json({ connected: false, repos: [], error: "Invalid token" }); return; }
    const user = await userRes.json() as { login: string };
    const repos = reposRes.ok
      ? (await reposRes.json() as any[]).map((r: any) => ({
          name: r.name, full_name: r.full_name, private: r.private,
          language: r.language ?? null, updated_at: r.updated_at,
        }))
      : [];
    res.json({ connected: true, login: user.login, repos });
  } catch (err: any) {
    res.json({ connected: false, repos: [], error: err?.message ?? "Network error" });
  }
});

// ── POST /admin/devai/restart — restart services to apply code changes ────────
router.post("/admin/devai/restart", requireAdminToken, (_req, res) => {
  res.json({ ok: true, message: "Restarting services. Backend changes live in ~5s, frontend hot-reloads instantly." });
  setTimeout(() => {
    exec("pkill -f 'tsx watch' 2>/dev/null; pkill -f 'tsx' 2>/dev/null; true", { timeout: 5000 }, () => {});
  }, 300);
});

// ── GET /admin/devai/export — stream workspace as tar.gz ──────────────────────
router.get("/admin/devai/export", requireAdminToken, (req, res) => {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `orahdex-workspace-${date}.tar.gz`;
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    const proc = spawn("tar", [
      "czf", "-",
      "--exclude=.git",
      "--exclude=node_modules",
      "--exclude=.local",
      "--exclude=dist",
      "--exclude=*.log",
      "-C", "/home/runner",
      "workspace",
    ]);
    proc.stdout.pipe(res);
    proc.stderr.on("data", (d) => logger.warn({ msg: d.toString().trim() }, "export warning"));
    proc.on("error", (err) => {
      logger.error({ err: err.message }, "export failed");
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    req.on("close", () => proc.kill());
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Export failed" });
  }
});

// ── POST /admin/devai/upload — upload & extract a tar.gz to workspace ─────────
router.post("/admin/devai/upload", requireAdminToken, raw({ type: "*/*", limit: "500mb" }), async (req, res) => {
  const tmp = `/tmp/devai-upload-${Date.now()}.tar.gz`;
  try {
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Empty or missing file body" }); return;
    }
    await fs.writeFile(tmp, req.body as Buffer);
    const { stdout, stderr } = await execAsync(
      `tar xzf "${tmp}" -C /home/runner/workspace`,
      WORKSPACE_ROOT, 120000
    );
    await fs.unlink(tmp).catch(() => {});
    const lines = (stdout + stderr).trim().split("\n").filter(Boolean);
    res.json({ ok: true, message: `Extracted ${req.body.length.toLocaleString()} bytes`, details: lines.slice(0, 20) });
  } catch (err: any) {
    await fs.unlink(tmp).catch(() => {});
    res.status(500).json({ error: err?.message ?? "Extraction failed" });
  }
});

// ── DELETE /devai/conversations/:id ───────────────────────────────────────────
router.delete("/devai/conversations/:id", requireAdminToken, async (req, res) => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
