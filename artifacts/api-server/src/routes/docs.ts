import { Router, type Request, type Response } from "express";

/* ═══════════════════════════════════════════════════════════════════════════
   OpenAPI 3.0 spec — OrahDEX REST API
═══════════════════════════════════════════════════════════════════════════ */
const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "OrahDEX REST API",
    version: "4.9.0",
    description:
      "Multi-chain DEX — spot & futures markets, cross-chain swaps, BSV integration, passkey wallets, and more.\n\n" +
      "**Base paths**\n- `/api` — primary REST API\n- `/v1` — routing / quote engine\n- `/tv` — TradingView UDF compatibility\n\n" +
      "Most endpoints require an `Authorization: Bearer <api-key>` header.",
    contact: { name: "OrahDEX", url: "https://orahdex.io" },
    license: { name: "Proprietary" },
  },
  servers: [
    { url: "https://orahdex.io", description: "Production" },
    { url: "", description: "Current host" },
  ],
  tags: [
    { name: "Health",      description: "Liveness probes" },
    { name: "Markets",     description: "Pairs, tickers, OHLCV candles" },
    { name: "Tokens",      description: "Token metadata and prices (v1)" },
    { name: "Quote",       description: "Swap quote and routing engine (v1)" },
    { name: "Orders",      description: "Limit and market order lifecycle" },
    { name: "BSV",         description: "Bitcoin SV — balances, UTXOs, broadcast" },
    { name: "Passkey",     description: "Passkey wallet cloud backup" },
    { name: "Withdrawals", description: "Crypto withdrawal requests" },
    { name: "HTLC",        description: "Cross-chain Hash Time Locked Contracts" },
  ],
  paths: {
    "/api/healthz": {
      get: {
        tags: ["Health"], summary: "Liveness probe", operationId: "getHealth",
        responses: {
          "200": {
            description: "Server is healthy",
            content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", example: "ok" } }, required: ["status"] } } },
          },
        },
      },
    },
    "/api/settings/public": {
      get: {
        tags: ["Health"], summary: "Public platform settings", operationId: "getPublicSettings",
        responses: { "200": { description: "Whitelisted settings object", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },

    "/api/markets": {
      get: {
        tags: ["Markets"], summary: "List markets", operationId: "listMarkets",
        parameters: [
          { in: "query", name: "type",   schema: { type: "string", enum: ["spot", "futures", "options"] } },
          { in: "query", name: "limit",  schema: { type: "integer", default: 100 } },
          { in: "query", name: "offset", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "Array of markets", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Market" } } } } } },
      },
    },
    "/api/markets/search": {
      get: {
        tags: ["Markets"], summary: "Search markets by symbol prefix", operationId: "searchMarkets",
        parameters: [
          { in: "query", name: "q",     required: true,  schema: { type: "string" }, example: "BTC" },
          { in: "query", name: "limit", required: false, schema: { type: "integer", default: 20 } },
        ],
        responses: { "200": { description: "Matching markets", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Market" } } } } } },
      },
    },
    "/api/markets/{symbol}": {
      get: {
        tags: ["Markets"], summary: "Get market by symbol", operationId: "getMarket",
        parameters: [{ in: "path", name: "symbol", required: true, schema: { type: "string" }, example: "BTC-USDT" }],
        responses: {
          "200": { description: "Market metadata", content: { "application/json": { schema: { $ref: "#/components/schemas/Market" } } } },
          "404": { description: "Market not found" },
        },
      },
    },
    "/api/markets/{symbol}/ticker": {
      get: {
        tags: ["Markets"], summary: "24h ticker", operationId: "getTicker",
        parameters: [{ in: "path", name: "symbol", required: true, schema: { type: "string" }, example: "BTC-USDT" }],
        responses: { "200": { description: "Ticker data", content: { "application/json": { schema: { $ref: "#/components/schemas/Ticker" } } } } },
      },
    },
    "/api/markets/{symbol}/candles": {
      get: {
        tags: ["Markets"], summary: "OHLCV candle data", operationId: "getCandles",
        parameters: [
          { in: "path",  name: "symbol",     required: true,  schema: { type: "string" }, example: "BTC-USDT" },
          { in: "query", name: "resolution", required: false, schema: { type: "string", enum: ["1","5","15","60","240","1D"], default: "60" } },
          { in: "query", name: "from",       required: false, schema: { type: "integer" }, description: "Unix timestamp (seconds)" },
          { in: "query", name: "to",         required: false, schema: { type: "integer" }, description: "Unix timestamp (seconds)" },
          { in: "query", name: "limit",      required: false, schema: { type: "integer", default: 500 } },
        ],
        responses: { "200": { description: "OHLCV array", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Candle" } } } } } },
      },
    },

    "/v1/tokens": {
      get: {
        tags: ["Tokens"], summary: "List tradeable tokens", operationId: "listTokens",
        responses: { "200": { description: "Tokens with prices and Keeper fee metadata", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Token" } } } } } },
      },
    },

    "/v1/quote": {
      get: {
        tags: ["Quote"], summary: "Get a swap quote", operationId: "getQuote",
        parameters: [
          { in: "query", name: "from",   required: true,  schema: { type: "string" }, example: "ETH" },
          { in: "query", name: "to",     required: true,  schema: { type: "string" }, example: "USDT" },
          { in: "query", name: "amount", required: true,  schema: { type: "string" }, example: "1.0" },
          { in: "query", name: "chain",  required: false, schema: { type: "string" }, example: "1" },
        ],
        responses: { "200": { description: "Quote with price impact and fees", content: { "application/json": { schema: { $ref: "#/components/schemas/Quote" } } } } },
      },
    },
    "/v1/swap/build": {
      post: {
        tags: ["Quote"], summary: "Build EVM swap calldata", operationId: "buildSwap",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["from","to","amount","wallet"], properties: { from: { type: "string" }, to: { type: "string" }, amount: { type: "string" }, slippage: { type: "number", default: 0.005 }, wallet: { type: "string" }, chain: { type: "string" } } } } },
        },
        responses: { "200": { description: "EVM transaction calldata", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },
    "/v1/swap/simulate": {
      post: {
        tags: ["Quote"], summary: "Simulate a swap (revert check + MEV risk)", operationId: "simulateSwap",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Simulation result", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, gasUsed: { type: "string" } } } } } } },
      },
    },

    "/v1/htlc/lock": {
      post: {
        tags: ["HTLC"], summary: "Initiate a cross-chain HTLC lock", operationId: "htlcLock",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["asset","amount","recipient","hashlock","timelock"], properties: { asset: { type: "string" }, amount: { type: "string" }, recipient: { type: "string" }, hashlock: { type: "string" }, timelock: { type: "integer" } } } } } },
        responses: { "200": { description: "Lock transaction data", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },

    "/api/orders": {
      post: {
        tags: ["Orders"], summary: "Place an order", operationId: "placeOrder",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/OrderRequest" } } } },
        responses: {
          "201": { description: "Order created", content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } } },
          "400": { description: "Validation error" },
        },
      },
    },
    "/api/orders/{id}": {
      delete: {
        tags: ["Orders"], summary: "Cancel an open order", operationId: "cancelOrder",
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Order cancelled" }, "404": { description: "Not found" } },
      },
    },

    "/api/bsv/balance/{address}": {
      get: {
        tags: ["BSV"], summary: "BSV address balance", operationId: "getBsvBalance",
        parameters: [{ in: "path", name: "address", required: true, schema: { type: "string" }, description: "BSV address or paymail" }],
        responses: { "200": { description: "Balance in satoshis", content: { "application/json": { schema: { type: "object", properties: { confirmed: { type: "integer" }, unconfirmed: { type: "integer" } } } } } } },
      },
    },
    "/api/bsv/utxos/{address}": {
      get: {
        tags: ["BSV"], summary: "UTXOs for a BSV address", operationId: "getBsvUtxos",
        parameters: [{ in: "path", name: "address", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "UTXO list", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Utxo" } } } } } },
      },
    },
    "/api/bsv/broadcast": {
      post: {
        tags: ["BSV"], summary: "Broadcast a raw BSV transaction", operationId: "broadcastBsv",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["rawTx"], properties: { rawTx: { type: "string", description: "Raw transaction hex" } } } } } },
        responses: { "200": { description: "Broadcast result", content: { "application/json": { schema: { type: "object", properties: { txid: { type: "string" } } } } } } },
      },
    },
    "/api/bsv/resolve-handle/{handle}": {
      get: {
        tags: ["BSV"], summary: "Resolve a HandCash $handle", operationId: "resolveBsvHandle",
        parameters: [{ in: "path", name: "handle", required: true, schema: { type: "string" }, example: "satoshi" }],
        responses: { "200": { description: "Address and paymail", content: { "application/json": { schema: { type: "object", properties: { address: { type: "string" }, paymail: { type: "string" } } } } } } },
      },
    },

    "/api/passkey/backup": {
      post: {
        tags: ["Passkey"], summary: "Store encrypted wallet backup", operationId: "backupPasskey",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["id","blob"], properties: { id: { type: "string" }, blob: { type: "string" } } } } } },
        responses: { "200": { description: "Backup stored" } },
      },
    },
    "/api/passkey/backup/{id}": {
      get: {
        tags: ["Passkey"], summary: "Retrieve encrypted wallet backup", operationId: "getPasskeyBackup",
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Encrypted blob", content: { "application/json": { schema: { type: "object", properties: { blob: { type: "string" } } } } } }, "404": { description: "Not found" } },
      },
    },

    "/api/withdrawals": {
      post: {
        tags: ["Withdrawals"], summary: "Request a crypto withdrawal", operationId: "createWithdrawal",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["asset","amount","address"], properties: { asset: { type: "string" }, amount: { type: "string" }, address: { type: "string" }, chain: { type: "string" } } } } } },
        responses: { "201": { description: "Withdrawal queued" } },
      },
    },
  },
  components: {
    schemas: {
      Market: {
        type: "object",
        properties: {
          symbol:     { type: "string",  example: "BTC-USDT" },
          baseAsset:  { type: "string",  example: "BTC" },
          quoteAsset: { type: "string",  example: "USDT" },
          type:       { type: "string",  enum: ["spot","futures","options"] },
          lastPrice:  { type: "number" },
          volume24h:  { type: "number" },
          status:     { type: "string",  enum: ["open","closed","halted"] },
        },
      },
      Ticker: {
        type: "object",
        properties: {
          symbol:           { type: "string" },
          lastPrice:        { type: "number" },
          high24h:          { type: "number" },
          low24h:           { type: "number" },
          volume24h:        { type: "number" },
          changePercent24h: { type: "number" },
        },
      },
      Candle: {
        type: "object",
        description: "OHLCV bar — all prices as numbers",
        properties: {
          t: { type: "integer", description: "Unix timestamp (seconds)" },
          o: { type: "number",  description: "Open" },
          h: { type: "number",  description: "High" },
          l: { type: "number",  description: "Low" },
          c: { type: "number",  description: "Close" },
          v: { type: "number",  description: "Volume" },
        },
      },
      Token: {
        type: "object",
        properties: {
          symbol:   { type: "string" },
          name:     { type: "string" },
          price:    { type: "number" },
          decimals: { type: "integer" },
          chainId:  { type: "integer" },
          address:  { type: "string" },
          logoUri:  { type: "string" },
        },
      },
      Quote: {
        type: "object",
        properties: {
          from:        { type: "string" },
          to:          { type: "string" },
          amountIn:    { type: "string" },
          amountOut:   { type: "string" },
          priceImpact: { type: "number", description: "Fraction, e.g. 0.003 = 0.3%" },
          fee:         { type: "number" },
          route:       { type: "array", items: { type: "string" } },
        },
      },
      OrderRequest: {
        type: "object",
        required: ["symbol","side","type","amount"],
        properties: {
          symbol: { type: "string", example: "BTC-USDT" },
          side:   { type: "string", enum: ["buy","sell"] },
          type:   { type: "string", enum: ["market","limit"] },
          amount: { type: "string", example: "0.001" },
          price:  { type: "string", description: "Required for limit orders" },
        },
      },
      Order: {
        type: "object",
        properties: {
          id:        { type: "string" },
          symbol:    { type: "string" },
          side:      { type: "string" },
          type:      { type: "string" },
          status:    { type: "string", enum: ["open","filled","cancelled","partial"] },
          amount:    { type: "string" },
          price:     { type: "string" },
          filled:    { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Utxo: {
        type: "object",
        properties: {
          txid:         { type: "string" },
          vout:         { type: "integer" },
          value:        { type: "integer", description: "Satoshis" },
          height:       { type: "integer" },
          scriptPubKey: { type: "string" },
        },
      },
    },
  },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   OpenRPC 1.2.6 spec — OrahDEX JSON-RPC methods
═══════════════════════════════════════════════════════════════════════════ */
const OPENRPC_SPEC = {
  openrpc: "1.2.6",
  info: {
    title: "OrahDEX JSON-RPC",
    version: "4.9.0",
    description: "JSON-RPC 2.0 interface for OrahDEX. All methods are prefixed `orah_`.\n\n**Endpoint:** `POST /rpc`\n\n**Playground:** `GET /rpc/playground`",
    contact: { name: "OrahDEX", url: "https://orahdex.io" },
  },
  servers: [{ name: "OrahDEX RPC", url: "/rpc" }],
  methods: [
    {
      name: "orah_getHealth",
      summary: "Server liveness probe",
      params: [],
      result: { name: "health", schema: { type: "object", properties: { status: { type: "string", description: "\"ok\" when healthy" } } } },
      examples: [{ name: "basic", params: [], result: { name: "health", value: { status: "ok" } } }],
    },
    {
      name: "orah_getSettings",
      summary: "Public platform settings",
      params: [],
      result: { name: "settings", schema: { type: "object" } },
    },
    {
      name: "orah_getMarkets",
      summary: "List enabled markets",
      params: [
        { name: "limit", schema: { type: "integer", default: 100 }, description: "Max results to return" },
        { name: "type",  schema: { type: "string", enum: ["spot","futures","options"] }, description: "Filter by market type" },
        { name: "offset",schema: { type: "integer", default: 0 } },
      ],
      result: { name: "markets", schema: { type: "array", items: { type: "object" } } },
      examples: [{ name: "spot markets", params: [{ name: "type", value: "spot" },{ name: "limit", value: 10 }], result: { name: "markets", value: [] } }],
    },
    {
      name: "orah_searchMarkets",
      summary: "Search markets by symbol prefix",
      params: [
        { name: "q",     required: true,  schema: { type: "string" }, description: "Search query e.g. \"BTC\"" },
        { name: "limit", required: false, schema: { type: "integer", default: 20 } },
      ],
      result: { name: "markets", schema: { type: "array", items: { type: "object" } } },
      examples: [{ name: "search BTC", params: [{ name: "q", value: "BTC" }], result: { name: "markets", value: [] } }],
    },
    {
      name: "orah_getMarket",
      summary: "Get a single market by symbol",
      params: [{ name: "symbol", required: true, schema: { type: "string" }, description: "e.g. \"BTC-USDT\"" }],
      result: { name: "market", schema: { type: "object" } },
      examples: [{ name: "BTC-USDT", params: [{ name: "symbol", value: "BTC-USDT" }], result: { name: "market", value: {} } }],
    },
    {
      name: "orah_getTicker",
      summary: "24h price ticker",
      params: [{ name: "symbol", required: true, schema: { type: "string" }, description: "e.g. \"BTC-USDT\"" }],
      result: {
        name: "ticker",
        schema: {
          type: "object",
          properties: {
            symbol:           { type: "string" },
            lastPrice:        { type: "number" },
            high24h:          { type: "number" },
            low24h:           { type: "number" },
            volume24h:        { type: "number" },
            changePercent24h: { type: "number" },
          },
        },
      },
      examples: [{ name: "BTC-USDT ticker", params: [{ name: "symbol", value: "BTC-USDT" }], result: { name: "ticker", value: { symbol: "BTC-USDT", lastPrice: 65000 } } }],
    },
    {
      name: "orah_getCandles",
      summary: "OHLCV candle data for charting",
      params: [
        { name: "symbol",     required: true,  schema: { type: "string" } },
        { name: "resolution", required: false, schema: { type: "string", enum: ["1","5","15","60","240","1D"], default: "60" } },
        { name: "from",       required: false, schema: { type: "integer" }, description: "Unix timestamp start (seconds)" },
        { name: "to",         required: false, schema: { type: "integer" }, description: "Unix timestamp end (seconds)" },
        { name: "limit",      required: false, schema: { type: "integer", default: 500 } },
      ],
      result: { name: "candles", schema: { type: "array", description: "Array of {t,o,h,l,c,v} objects" } },
    },
    {
      name: "orah_getTokens",
      summary: "List all tradeable tokens with prices",
      params: [],
      result: { name: "tokens", schema: { type: "array", items: { type: "object", properties: { symbol: { type: "string" }, name: { type: "string" }, price: { type: "number" }, decimals: { type: "integer" } } } } },
    },
    {
      name: "orah_getQuote",
      summary: "Get a swap price quote",
      params: [
        { name: "from",   required: true,  schema: { type: "string" }, description: "Input token symbol e.g. \"ETH\"" },
        { name: "to",     required: true,  schema: { type: "string" }, description: "Output token symbol e.g. \"USDT\"" },
        { name: "amount", required: true,  schema: { type: "string" }, description: "Input amount as decimal string" },
        { name: "chain",  required: false, schema: { type: "string" }, description: "EVM chain ID" },
      ],
      result: {
        name: "quote",
        schema: { type: "object", properties: { amountOut: { type: "string" }, priceImpact: { type: "number" }, fee: { type: "number" }, route: { type: "array", items: { type: "string" } } } },
      },
      examples: [{ name: "ETH→USDT", params: [{ name: "from", value: "ETH" },{ name: "to", value: "USDT" },{ name: "amount", value: "1.0" }], result: { name: "quote", value: { amountOut: "3200.00", priceImpact: 0.001 } } }],
    },
    {
      name: "orah_getBsvBalance",
      summary: "BSV address or paymail balance",
      params: [{ name: "address", required: true, schema: { type: "string" }, description: "BSV address or paymail" }],
      result: { name: "balance", schema: { type: "object", properties: { confirmed: { type: "integer", description: "Satoshis" }, unconfirmed: { type: "integer", description: "Satoshis" } } } },
      examples: [{ name: "by address", params: [{ name: "address", value: "1BitcoinAddress..." }], result: { name: "balance", value: { confirmed: 100000, unconfirmed: 0 } } }],
    },
    {
      name: "orah_getBsvUtxos",
      summary: "UTXOs for a BSV address",
      params: [{ name: "address", required: true, schema: { type: "string" } }],
      result: { name: "utxos", schema: { type: "array", items: { type: "object", properties: { txid: { type: "string" }, vout: { type: "integer" }, value: { type: "integer" } } } } },
    },
    {
      name: "orah_resolveBsvHandle",
      summary: "Resolve a HandCash $handle to address + paymail",
      params: [{ name: "handle", required: true, schema: { type: "string" }, description: "Handle without the $ prefix" }],
      result: { name: "resolved", schema: { type: "object", properties: { address: { type: "string" }, paymail: { type: "string" } } } },
      examples: [{ name: "satoshi", params: [{ name: "handle", value: "satoshi" }], result: { name: "resolved", value: { address: "...", paymail: "satoshi@handcash.io" } } }],
    },
  ],
  components: { schemas: {} },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   JSON-RPC 2.0 method table — delegates to internal REST endpoints
═══════════════════════════════════════════════════════════════════════════ */
type Params = Record<string, unknown>;
type Handler = (p: Params) => Promise<unknown>;

function localBase() {
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

async function get(path: string): Promise<unknown> {
  const r = await fetch(`${localBase()}${path}`);
  return r.json();
}

const METHODS: Record<string, Handler> = {
  orah_getHealth: async () => get("/api/healthz"),

  orah_getSettings: async () => get("/api/settings/public"),

  orah_getMarkets: async (p) => {
    const q = new URLSearchParams();
    if (p.limit)  q.set("limit",  String(p.limit));
    if (p.offset) q.set("offset", String(p.offset));
    if (p.type)   q.set("type",   String(p.type));
    return get(`/api/markets?${q}`);
  },

  orah_searchMarkets: async (p) => {
    const q = new URLSearchParams({ q: String(p.q ?? ""), limit: String(p.limit ?? 20) });
    return get(`/api/markets/search?${q}`);
  },

  orah_getMarket: async (p) =>
    get(`/api/markets/${encodeURIComponent(String(p.symbol ?? ""))}`),

  orah_getTicker: async (p) =>
    get(`/api/markets/${encodeURIComponent(String(p.symbol ?? ""))}/ticker`),

  orah_getCandles: async (p) => {
    const q = new URLSearchParams();
    if (p.resolution) q.set("resolution", String(p.resolution));
    if (p.from)       q.set("from",       String(p.from));
    if (p.to)         q.set("to",         String(p.to));
    if (p.limit)      q.set("limit",      String(p.limit));
    return get(`/api/markets/${encodeURIComponent(String(p.symbol ?? ""))}/candles?${q}`);
  },

  orah_getTokens: async () => get("/v1/tokens"),

  orah_getQuote: async (p) => {
    const q = new URLSearchParams();
    if (p.from)   q.set("from",   String(p.from));
    if (p.to)     q.set("to",     String(p.to));
    if (p.amount) q.set("amount", String(p.amount));
    if (p.chain)  q.set("chain",  String(p.chain));
    return get(`/v1/quote?${q}`);
  },

  orah_getBsvBalance: async (p) =>
    get(`/api/bsv/balance/${encodeURIComponent(String(p.address ?? ""))}`),

  orah_getBsvUtxos: async (p) =>
    get(`/api/bsv/utxos/${encodeURIComponent(String(p.address ?? ""))}`),

  orah_resolveBsvHandle: async (p) =>
    get(`/api/bsv/resolve-handle/${encodeURIComponent(String(p.handle ?? ""))}`),
};

/* ═══════════════════════════════════════════════════════════════════════════
   Swagger UI HTML (CDN — no static file bundling needed)
═══════════════════════════════════════════════════════════════════════════ */
function swaggerHtml(specPath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>OrahDEX API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#0d0f14}
    .swagger-ui .topbar{background:#111318;border-bottom:1px solid #1e2332;padding:8px 24px}
    .swagger-ui .topbar .download-url-wrapper input{background:#1a1f2e;border:1px solid #1e2332;color:#e2e8f0}
    .swagger-ui .info .title{color:#4ade80}
    .swagger-ui .opblock.opblock-get .opblock-summary-method{background:#1d6e3a}
    .swagger-ui .opblock.opblock-post .opblock-summary-method{background:#1a4a7a}
    .swagger-ui .opblock.opblock-delete .opblock-summary-method{background:#7a1a1a}
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "${specPath}",
      dom_id: "#swagger-ui",
      deepLinking: true,
      tryItOutEnabled: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      plugins: [SwaggerUIBundle.plugins.DownloadUrl],
      layout: "BaseLayout",
    });
  </script>
</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RPC landing page HTML
═══════════════════════════════════════════════════════════════════════════ */
function rpcLandingHtml(): string {
  const methodCards = Object.keys(METHODS)
    .map(n => `<div class="mcard"><span class="mname">${n}</span></div>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>OrahDEX JSON-RPC</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d0f14;color:#e2e8f0;min-height:100vh;padding:40px 24px}
    h1{font-size:22px;font-weight:700;color:#4ade80;margin-bottom:6px}
    .sub{font-size:13px;color:#64748b;margin-bottom:28px}
    .links{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:32px}
    a.btn{display:inline-block;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;transition:opacity .15s}
    a.btn-green{background:rgba(74,222,128,.12);color:#4ade80;border:1px solid rgba(74,222,128,.25)}
    a.btn-green:hover{background:rgba(74,222,128,.2)}
    a.btn-gray{background:#1a1f2e;color:#94a3b8;border:1px solid #1e2332}
    a.btn-gray:hover{background:#222838;color:#e2e8f0}
    .card{background:#141923;border:1px solid #1e2332;border-radius:12px;padding:20px;margin-bottom:18px}
    .card h2{font-size:13px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}
    pre{background:#0d0f14;border:1px solid #1e2332;border-radius:8px;padding:14px;font-size:12px;overflow-x:auto;color:#e2e8f0;line-height:1.6}
    code{background:#1a1f2e;border:1px solid #1e2332;border-radius:4px;padding:1px 6px;font-size:12px;color:#4ade80}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
    .mcard{background:#0d0f14;border:1px solid #1e2332;border-radius:8px;padding:8px 12px}
    .mname{font-family:monospace;font-size:12px;color:#4ade80}
  </style>
</head>
<body>
  <h1>OrahDEX JSON-RPC 2.0</h1>
  <p class="sub">Send <code>POST /rpc</code> with a standard JSON-RPC 2.0 payload — all methods prefixed <code>orah_</code></p>
  <div class="links">
    <a class="btn btn-green" href="/rpc/playground" target="_blank">Open Playground ↗</a>
    <a class="btn btn-gray"  href="/rpc/spec">openrpc.json</a>
    <a class="btn btn-gray"  href="/docs">REST API Docs</a>
  </div>
  <div class="card">
    <h2>Example request</h2>
    <pre>curl -X POST /rpc \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"orah_getTicker","params":{"symbol":"BTC-USDT"}}'</pre>
  </div>
  <div class="card">
    <h2>Available methods (${Object.keys(METHODS).length})</h2>
    <div class="grid">${methodCards}</div>
  </div>
</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Routers
═══════════════════════════════════════════════════════════════════════════ */

/** Mounted at /docs */
export const docsRouter = Router();

docsRouter.get("/", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(swaggerHtml("/docs/openapi.json"));
});

docsRouter.get("/openapi.json", (_req: Request, res: Response) => {
  res.json(OPENAPI_SPEC);
});

/** Mounted at /rpc */
export const rpcRouter = Router();

rpcRouter.get("/", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(rpcLandingHtml());
});

rpcRouter.get("/spec", (_req: Request, res: Response) => {
  res.json(OPENRPC_SPEC);
});

rpcRouter.get("/playground", (req: Request, res: Response) => {
  const host  = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost";
  const proto = (req.get("x-forwarded-proto") ?? req.protocol) === "http" ? "http" : "https";
  const specUrl = encodeURIComponent(`${proto}://${host}/rpc/spec`);
  res.redirect(`https://playground.open-rpc.org/?schemaUrl=${specUrl}`);
});

/* ── JSON-RPC 2.0 dispatcher ─────────────────────────────────────────── */
rpcRouter.post("/", async (req: Request, res: Response) => {
  const body = req.body as {
    jsonrpc?: string;
    method?:  string;
    params?:  Params | unknown[];
    id?:      string | number | null;
  };

  const { jsonrpc, method, id = null } = body;
  const params: Params = Array.isArray(body.params)
    ? Object.fromEntries(body.params.map((v, i) => [i, v]))
    : (body.params as Params ?? {});

  if (jsonrpc !== "2.0") {
    return void res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request — jsonrpc must be \"2.0\"" }, id });
  }
  if (!method || typeof method !== "string") {
    return void res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request — method missing" }, id });
  }

  const handler = METHODS[method];
  if (!handler) {
    return void res.status(404).json({ jsonrpc: "2.0", error: { code: -32601, message: `Method not found: ${method}` }, id });
  }

  try {
    const result = await handler(params);
    res.json({ jsonrpc: "2.0", result, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message }, id });
  }
});
