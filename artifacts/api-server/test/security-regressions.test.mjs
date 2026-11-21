import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ordersPath = path.join(__dirname, "..", "src", "routes", "orders.ts");
const ordersSchemaPath = path.join(__dirname, "..", "..", "..", "lib", "db", "src", "schema", "orders.ts");
const tradePath = path.join(__dirname, "..", "src", "routes", "trade.ts");
const fundingVerifierPath = path.join(__dirname, "..", "src", "lib", "fundingVerifier.ts");
const tradingCapabilitiesPath = path.join(__dirname, "..", "src", "lib", "tradingCapabilities.ts");
const startupModePath = path.join(__dirname, "..", "src", "lib", "startupMode.ts");
const appPath = path.join(__dirname, "..", "src", "app.ts");
const routesIndexPath = path.join(__dirname, "..", "src", "routes", "index.ts");
const adminAuthPath = path.join(__dirname, "..", "src", "middleware", "adminAuth.ts");
const adminRoutesPath = path.join(__dirname, "..", "src", "routes", "admin.ts");
const adminLoginPath = path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "admin", "Login.tsx");
const evmWebhookRouterPath = path.join(__dirname, "..", "src", "routes", "evmWebhookRouter.ts");
const depositAddressesPath = path.join(__dirname, "..", "src", "lib", "depositAddresses.ts");
const internalEvmWalletPath = path.join(__dirname, "..", "src", "lib", "internalEvmWallet.ts");
const exchangeHotWalletPath = path.join(__dirname, "..", "src", "lib", "exchangeHotWallet.ts");
const advancedOrderEnginePath = path.join(__dirname, "..", "src", "lib", "advancedOrderEngine.ts");
const hotWalletGeneratorPath = path.join(__dirname, "..", "scripts", "gen-new-hotwallet.ts");
const futuresPath = path.join(__dirname, "..", "src", "routes", "futures.ts");
const nftPath = path.join(__dirname, "..", "src", "routes", "nft.ts");
const predictionPath = path.join(__dirname, "..", "src", "routes", "prediction.ts");
const predictionPagePath = path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "Prediction.tsx");
const swapPath = path.join(__dirname, "..", "src", "routes", "swap.ts");
const unifiedTradePath = path.join(__dirname, "..", "src", "routes", "trade.ts");
const optionsPath = path.join(__dirname, "..", "src", "routes", "options.ts");
const copyTradingPath = path.join(__dirname, "..", "src", "routes", "copyTrading.ts");
const p2pPath = path.join(__dirname, "..", "src", "routes", "p2pIntents.ts");
const copyTradingPagePath = path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "CopyTrading.tsx");
const tradeAuthPath = path.join(__dirname, "..", "..", "bsv-dex", "src", "lib", "tradeAuth.ts");

async function read(filePath) {
  return readFile(filePath, "utf8");
}

test("orders route enforces external auth for recognized wallet formats", async () => {
  const src = await read(ordersPath);

  assert.match(src, /\(isEvmAddress \|\| isBsvAddress \|\| isSolAddress\) \? "external"/);
  assert.match(src, /priorNonceUse/);
  assert.match(src, /lower\(\$\{ordersTable\.walletAddress\}\) = lower\(\$\{body\.walletAddress\}\)/);
  assert.match(src, /eq\(ordersTable\.nonce, orderNonce\)/);
  // BSV and Solana orders now use order-bound challenges instead of withdrawal challenges
  // to prevent replay attacks (H-07 fix).
  assert.match(src, /verifyBsvOrderSignature\(body\.walletAddress, sig/);
  assert.match(src, /verifySolOrderSignature\(body\.walletAddress, sig/);
  assert.match(src, /isNonceUniqueViolation/);
  assert.match(src, /orders_wallet_nonce_uidx/);
});

test("orders schema enforces wallet+nonce uniqueness", async () => {
  const src = await read(ordersSchemaPath);

  assert.match(src, /uniqueIndex\("orders_wallet_nonce_uidx"\)\.on\(sql`lower\(\$\{t\.walletAddress\}\)`, t\.nonce\)/);
});

test("trade wallet settle is EVM-only and requires EVM wallet signature", async () => {
  const src = await read(tradePath);

  assert.match(src, /const \{[^}]*walletSignature[^}]*\} = req\.body/);
  assert.match(src, /walletAddress must be an EVM address \(0x\.\.\.\) for \/trade\/wallet\/settle\./);
  assert.match(src, /if \(!walletSignature\)/);
  assert.match(src, /verifyEvmSignature\(walletAddress, authMsg, walletSignature\)/);
  assert.doesNotMatch(src, /verifyBsvWithdrawSignature\(walletAddress, walletSignature\)/);
  assert.doesNotMatch(src, /verifySolWithdrawSignature\(walletAddress, walletSignature\)/);
});

test("trade router does not expose withdraw endpoints", async () => {
  const src = await read(tradePath);

  assert.doesNotMatch(src, /router\.post\("\/withdraw\/challenge"/);
  assert.doesNotMatch(src, /router\.post\("\/withdraw"/);
});

test("funding verifier fails closed for unverifiable external EVM funding", async () => {
  const src = await read(fundingVerifierPath);

  assert.match(src, /code:\s+"FUNDING_PROOF_REQUIRED"/);
  assert.match(src, /code:\s+"CHAIN_ID_REQUIRED"/);
  assert.match(src, /code:\s+"UNSUPPORTED_ASSET"/);
  assert.match(src, /code:\s+"BALANCE_VERIFICATION_UNAVAILABLE"/);
  assert.doesNotMatch(src, /on-chain RPC balance check failed — falling through/);
});

test("withdrawals router is mounted before trade router", async () => {
  const src = await read(routesIndexPath);

  const withdrawalsPos = src.indexOf("router.use(withdrawalsRouter);");
  const tradePos = src.indexOf("router.use(tradeRouter);");

  assert.notEqual(withdrawalsPos, -1, "withdrawals router mount not found");
  assert.notEqual(tradePos, -1, "trade router mount not found");
  assert.ok(withdrawalsPos < tradePos, "withdrawals router should be mounted before trade router");
});

test("admin auth uses timing-safe token checks", async () => {
  const src = await read(adminAuthPath);

  assert.match(src, /timingSafeEqual/);
  assert.match(src, /function hasMatchingAdminToken/);
});

test("admin API is private by default except for login and challenge routes", async () => {
  const src = await read(adminRoutesPath);
  const guardIndex = src.indexOf("router.use((req, res, next) => {");
  const firstAdminRouteIndex = src.indexOf('router.get("/security-vault"');

  assert.notEqual(guardIndex, -1, "admin router-wide authentication guard exists");
  assert.ok(guardIndex < firstAdminRouteIndex, "router-wide guard runs before admin handlers");
  assert.match(src, /requireAdminToken\(req, res, next\)/);
  assert.match(src, /"POST \/auth"/);
  assert.match(src, /"POST \/auth\/totp"/);
  assert.match(src, /"POST \/auth\/wallet-challenge"/);
  assert.match(src, /"POST \/auth\/wallet"/);
  assert.doesNotMatch(src, /"GET \/security-vault"/);
  assert.doesNotMatch(src, /"POST \/security-vault\/regenerate-bsv"/);
});

test("admin password comparison is safe for unequal input lengths", async () => {
  const src = await read(adminRoutesPath);

  assert.match(src, /typeof password === "string"[\s\S]*crypto\.timingSafeEqual\([\s\S]*createHash\("sha256"\)/);
  assert.match(src, /typeof email === "string" && email\.trim\(\)/);
});

test("admin TOTP login requires a short-lived first-factor challenge", async () => {
  const src = await read(adminRoutesPath);
  const totpRoute = src.match(/router\.post\("\/auth\/totp",[\s\S]*?\n\}\);/)?.[0];

  assert.ok(totpRoute, "TOTP login route exists");
  assert.match(src, /requiresTotp: true[\s\S]*challengeId/);
  assert.match(totpRoute, /pendingTotpChallenges\.get\(challengeId\)/);
  assert.match(totpRoute, /challenge\.expiresAt < Date\.now\(\)/);
  assert.ok(
    totpRoute.indexOf("pendingTotpChallenges.get") < totpRoute.indexOf("generateAdminToken"),
    "a session is issued only after a valid challenge is found",
  );
});

test("admin logout revokes only the current session", async () => {
  const [routesSrc, authSrc] = await Promise.all([read(adminRoutesPath), read(adminAuthPath)]);
  const logoutRoute = routesSrc.match(/router\.post\("\/auth\/logout"[\s\S]*?\n\}\);/)?.[0];

  assert.ok(logoutRoute, "admin logout route exists");
  assert.match(logoutRoute, /revokeAdminToken/);
  assert.doesNotMatch(logoutRoute, /revokeAllAdminTokens/);
  assert.match(authSrc, /export async function revokeAdminToken\(token: string\)/);
});

test("admin login does not display or calculate the active TOTP code", async () => {
  const src = await read(adminLoginPath);

  assert.doesNotMatch(src, /generateTOTP|previewCode|auth\/totp-uri/);
  assert.match(src, /verifyTotp\(totpCode\)/);
});

test("EVM webhook rejects requests when HMAC secret is missing", async () => {
  const src = await read(evmWebhookRouterPath);

  assert.match(src, /EVM_WEBHOOK_SECRET not set — rejecting webhook request/);
  assert.doesNotMatch(src, /EVM_WEBHOOK_SECRET not set — skipping HMAC verification/);
  assert.match(src, /if \(!secret\) \{[\s\S]*return false;\n  \}/);
});

test("wallet encryption requires configured secrets and has no hard-coded fallback", async () => {
  const [depositSrc, internalSrc, hotWalletSrc, bsvWalletSrc] = await Promise.all([
    read(depositAddressesPath),
    read(internalEvmWalletPath),
    read(exchangeHotWalletPath),
    read(path.join(__dirname, "..", "src", "lib", "internalBsvWallet.ts")),
  ]);

  for (const src of [depositSrc, internalSrc, hotWalletSrc, bsvWalletSrc]) {
    assert.doesNotMatch(src, /orahdex-internal-evm-fallback-key-32bytes!/);
  }
  assert.match(internalSrc, /getRequiredEnv\("EVM_WALLET_SECRET"/);
  assert.match(hotWalletSrc, /getRequiredEnv\("EVM_WALLET_SECRET"/);
  assert.match(bsvWalletSrc, /process\.env\.BSV_WALLET_SECRET\?\.trim\(\)/);
  assert.doesNotMatch(bsvWalletSrc, /orahdex-internal-bsv-fallback-key-32bytes!/);
  assert.match(depositSrc, /process\.env\.EVM_WALLET_SECRET/);
});

test("hot-wallet generator cannot create or print private keys", async () => {
  const src = await read(hotWalletGeneratorPath);

  assert.match(src, /intentionally disabled/);
  assert.match(src, /process\.exitCode = 1/);
  assert.doesNotMatch(src, /randomBytes|generatePrivateKey|privateKey\s*=/);
});

test("advanced order workers stay disabled until signed funding is supported", async () => {
  const src = await read(advancedOrderEnginePath);
  const startup = src.match(/export function startAdvancedOrderEngines\(\): void \{[\s\S]*?\n\}/)?.[0];

  assert.ok(startup, "advanced-order startup function exists");
  assert.match(startup, /remain disabled until strategies have signed, funded wallet authorization/);
  assert.doesNotMatch(startup, /guardedInterval|setInterval|runTwapEngine|runIcebergEngine/);
});

test("futures mutations fail closed and NFT routes can be disabled", async () => {
  const [futuresSrc, nftSrc] = await Promise.all([read(futuresPath), read(nftPath)]);

  assert.match(futuresSrc, /temporarily unavailable pending signed wallet authorization/);
  assert.match(nftSrc, /process\.env\.NFT_ENABLED === "false"/);
});

test("prediction routes fail closed until signed funding and verified settlement exist", async () => {
  const [apiSrc, pageSrc] = await Promise.all([read(predictionPath), read(predictionPagePath)]);
  const guard = apiSrc.match(/router\.use\("\/prediction"[\s\S]*?\n\}\);/)?.[0];

  assert.ok(guard, "prediction router-wide pause exists");
  assert.ok(guard.indexOf("router.use") < apiSrc.indexOf('router.post("/prediction/bet"'));
  assert.ok(guard.indexOf("router.use") < apiSrc.indexOf('router.post("/prediction/claim"'));
  assert.match(guard, /status\(503\)/);
  assert.match(guard, /PREDICTION_TRADING_PAUSED/);
  assert.match(pageSrc, /Prediction trading is paused while wallet funding and round settlement are verified/);
  assert.match(pageSrc, /disabled\s*\n\s*className/);
});

test("oracle-priced internal ledger swaps fail closed without reserve backing", async () => {
  const [swapSrc, tradeSrc] = await Promise.all([read(swapPath), read(unifiedTradePath)]);
  const directSwapPause = swapSrc.match(/router\.post\("\/swap", \(_req, res\) => \{[\s\S]*?\n\}\);/)?.[0];
  const unifiedSwapPause = tradeSrc.match(/const internalLedgerSwapPaused[\s\S]*?router\.post\("\/trade\/exchange\/advanced", internalLedgerSwapPaused\);/)?.[0];

  assert.ok(directSwapPause, "direct internal swap is paused before its handler");
  assert.match(directSwapPause, /status\(503\)/);
  assert.match(directSwapPause, /INTERNAL_LEDGER_SWAP_DISABLED/);
  assert.ok(unifiedSwapPause, "unified internal ledger swaps are paused");
  assert.match(unifiedSwapPause, /router\.post\("\/trade\/exchange", internalLedgerSwapPaused\)/);
  assert.match(swapSrc, /source === "internal" \|\| source === "split"[\s\S]*?INTERNAL_LEDGER_SWAP_DISABLED/);
});

test("options, copy vaults, and P2P fills fail closed without authorized settlement", async () => {
  const [optionsSrc, copySrc, p2pSrc, copyPageSrc] = await Promise.all([
    read(optionsPath),
    read(copyTradingPath),
    read(p2pPath),
    read(copyTradingPagePath),
  ]);

  assert.match(optionsSrc, /router\.post\("\/options\/order",[\s\S]*?status\(503\)[\s\S]*?OPTIONS_TRADING_PAUSED/);
  assert.match(optionsSrc, /router\.post\("\/options\/exercise\/:positionId",[\s\S]*?status\(503\)[\s\S]*?OPTIONS_TRADING_PAUSED/);
  assert.match(copySrc, /router\.post\("\/copy\/vaults\/:id\/deposit",[\s\S]*?status\(503\)[\s\S]*?COPY_TRADING_PAUSED/);
  assert.match(copySrc, /router\.post\("\/copy\/vaults\/:id\/withdraw",[\s\S]*?status\(503\)[\s\S]*?COPY_TRADING_PAUSED/);
  assert.match(p2pSrc, /router\.post\("\/p2p\/intents\/:id\/fill",[\s\S]*?status\(503\)[\s\S]*?P2P_SETTLEMENT_UNAVAILABLE/);
  assert.match(copyPageSrc, /Copy-vault deposits and withdrawals are paused/);
});

test("mobile Reown signing uses the active raw wallet provider before Wagmi", async () => {
  const src = await read(tradeAuthPath);
  const branch = src.match(/if \(provider === "reown"\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";

  assert.ok(branch, "Reown signing path exists");
  assert.match(branch, /connection\.connector\.getProvider\(\)/);
  assert.match(branch, /if \(!eip1193\?\.request\) \{\s*if \(wagmiSign\) return await wagmiSign\(\{ message \}\);/);
  assert.match(branch, /const accounts = await eip1193\.request\(\{ method: "eth_accounts" \}\)/);
  assert.match(branch, /return await eip1193\.request\(\{ method: "personal_sign"/);
});

test("EVM orderbook orders require confirmed escrow proof and same-chain settlement", async () => {
  const [ordersSrc, escrowSrc] = await Promise.all([
    read(ordersPath),
    read(path.join(__dirname, "..", "src", "lib", "evmOrderbookEscrow.ts")),
  ]);

  assert.match(ordersSrc, /router\.get\("\/orders\/evm-settlement\/config"/);
  assert.match(ordersSrc, /getEvmOrderbookEscrowConfig\(chainId\)/);
  assert.match(ordersSrc, /router\.post\("\/orders\/recover-evm"/);
  assert.match(ordersSrc, /router\.get\("\/runtime-config"/);
  assert.match(ordersSrc, /res\.json\(await getTradingCapabilities\(chainId\)\)/);
  assert.match(ordersSrc, /getTradingCapabilities\(\s*chainIdInput \? Number\(chainIdInput\) : undefined/);
  assert.match(ordersSrc, /safeStartup: true/);
  assert.match(ordersSrc, /if \(safeApiStartup && !orderbookTradingEnabled\)[\s\S]*?code: "SAFE_STARTUP"/);
  assert.match(ordersSrc, /getOrderNetworkCapability\(runtimeCapabilities/);
  assert.match(ordersSrc, /verifyEvmOrderLock\(\{/);
  assert.match(ordersSrc, /ORDERBOOK_LOCK_REQUIRED/);
  assert.match(ordersSrc, /candidateOrderbookFunding\.chainId !== incomingOrderbookFunding\?\.chainId/);
  assert.match(ordersSrc, /candidateClaimsOrderbookEscrow !== Boolean\(incomingOrderbookFunding\)/);
  assert.match(ordersSrc, /settleEvmOrderFill\(\{/);
  assert.match(ordersSrc, /verifyEvmOrderbookCancelTx\(\{/);
  assert.match(escrowSrc, /MIN_CONFIRMATIONS/);
  assert.match(escrowSrc, /isEvmOrderbookChainEnabled\(params\.chainId\)/);
  assert.match(escrowSrc, /OrderOpened/);
  assert.match(escrowSrc, /configuredEscrow\.toLowerCase\(\) !== params\.escrowAddress\.toLowerCase\(\)/);
});

test("only configured and verified EVM chains can trade during safe startup", async () => {
  const [src, startupSrc, appSrc, selfHealingSrc, mobileTradeSrc, orderFormSrc] = await Promise.all([
    read(tradingCapabilitiesPath),
    read(startupModePath),
    read(appPath),
    read(path.join(__dirname, "..", "src", "lib", "selfHealing.ts")),
    read(path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "mobile", "MobileTrade.tsx")),
    read(path.join(__dirname, "..", "..", "bsv-dex", "src", "components", "trading", "OrderForm.tsx")),
  ]);

  assert.match(src, /!isEvmOrderbookChainEnabled\(chainId\)/);
  assert.match(src, /bsv:\s*\{\s*available: false/);
  assert.match(src, /sol:\s*\{\s*available: false/);
  assert.match(src, /btc:\s*\{\s*available: false/);
  assert.match(src, /bch:\s*\{\s*available: false/);
  assert.match(src, /input\.chainId !== capability\.chainId/);
  assert.match(src, /input\.orderType !== "limit"/);
  assert.match(src, /!input\.hasEscrowLock/);
  assert.match(src, /await pool\.query\("SELECT 1"\)/);
  assert.match(src, /service\.name === "order-reconciler"/);
  assert.match(src, /recovery\.lastSuccessAt !== null/);
  assert.match(startupSrc, /configuredEvmOrderbookChainIds\(\)\.some\(isEvmOrderbookChainEnabled\)/);
  assert.match(startupSrc, /ORAHDEX_TRADING_EVM_VERIFIED_CHAIN_IDS/);
  assert.match(appSrc, /if \(tradingWorkersEnabled\) \{[\s\S]*?startOrderReconciler[\s\S]*?startBsvIntentWatcher/);
  assert.match(appSrc, /else if \(orderbookTradingEnabled\)[\s\S]*?startOrderReconciler/);
  assert.match(selfHealingSrc, /initialDelayMs:\s*1_000/);
  const generalWorkerBlock = appSrc.match(/if \(!safeApiStartup\) \{\n  _s\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(generalWorkerBlock, "general background worker block exists");
  assert.doesNotMatch(generalWorkerBlock, /startOrderReconciler|startBsvDepositWatcher|startHtlcWatcher|startBsvIntentWatcher/);
  assert.match(mobileTradeSrc, /tradingNetworkCapability\?\.available === true/);
  assert.match(mobileTradeSrc, /runtime-config\?chainId=\$\{tradingCapabilityChainId\}/);
  assert.match(mobileTradeSrc, /tradingCapabilityReason/);
  assert.match(orderFormSrc, /tradingNetworkCapability\?\.available === true/);
  assert.match(orderFormSrc, /runtime-config\?chainId=\$\{tradingCapabilityChainId\}/);
  assert.match(orderFormSrc, /tradingCapabilityReason/);
});

test("order reconciler never removes a live EVM escrow order from the database", async () => {
  const selfHealingSrc = await read(path.join(__dirname, "..", "src", "lib", "selfHealing.ts"));
  assert.match(selfHealingSrc, /order\.fundingRef\?\.startsWith\("evm-order:"\)\) continue/);
});
