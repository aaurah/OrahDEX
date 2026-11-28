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
const routesIndexPath = path.join(__dirname, "..", "src", "routes", "index.ts");
const adminAuthPath = path.join(__dirname, "..", "src", "middleware", "adminAuth.ts");
const adminRoutesPath = path.join(__dirname, "..", "src", "routes", "admin.ts");
const adminLoginPath = path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "admin", "Login.tsx");
const adminIntegrationsPath = path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "admin", "Integrations.tsx");
const adminSecuritySettingsPath = path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "admin", "SecuritySettings.tsx");
const adminSetupGuidePath = path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "admin", "SetupGuide.tsx");
const evmWebhookRouterPath = path.join(__dirname, "..", "src", "routes", "evmWebhookRouter.ts");
const depositAddressesPath = path.join(__dirname, "..", "src", "lib", "depositAddresses.ts");
const internalEvmWalletPath = path.join(__dirname, "..", "src", "lib", "internalEvmWallet.ts");
const exchangeHotWalletPath = path.join(__dirname, "..", "src", "lib", "exchangeHotWallet.ts");
const advancedOrderEnginePath = path.join(__dirname, "..", "src", "lib", "advancedOrderEngine.ts");
const hotWalletGeneratorPath = path.join(__dirname, "..", "scripts", "gen-new-hotwallet.ts");
const futuresPath = path.join(__dirname, "..", "src", "routes", "futures.ts");
const nftPath = path.join(__dirname, "..", "src", "routes", "nft.ts");
const withdrawalPath = path.join(__dirname, "..", "src", "routes", "withdrawals.ts");
const socialNftPath = path.join(__dirname, "..", "src", "routes", "socialNft.ts");
const webhookHandlersPath = path.join(__dirname, "..", "src", "webhookHandlers.ts");
const safeFetchPath = path.join(__dirname, "..", "src", "lib", "safePublicFetch.ts");
const evmHtlcPath = path.join(__dirname, "..", "src", "lib", "evmHtlc.ts");
const apiKeyAuthPath = path.join(__dirname, "..", "src", "middleware", "apiKeyAuth.ts");
const personalApiKeysPath = path.join(__dirname, "..", "src", "lib", "personalApiKeys.ts");
const walletRequestAuthPath = path.join(__dirname, "..", "src", "lib", "walletRequestAuth.ts");
const userApiKeysPath = path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "UserApiKeysSecure.tsx");
const emailInboxPath = path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "admin", "EmailInbox.tsx");
const htlcDeployPath = path.join(__dirname, "..", "..", "..", "contracts", "deploy.ts");
const gitignorePath = path.join(__dirname, "..", "..", "..", ".gitignore");
const v1RoutesPath = path.join(__dirname, "..", "src", "routes", "v1.ts");
const healthHandlerPath = path.join(__dirname, "..", "src", "app.ts");
const selfHealingPath = path.join(__dirname, "..", "src", "lib", "selfHealing.ts");
const chatRoutesPath = path.join(__dirname, "..", "src", "routes", "chat.ts");
const candleFetcherPath = path.join(__dirname, "..", "src", "lib", "candleFetcher.ts");
const swapRoutesPath = path.join(__dirname, "..", "src", "routes", "swap.ts");
const withdrawalsRoutesPath = path.join(__dirname, "..", "src", "routes", "withdrawals.ts");
const lifiClientPath = path.join(__dirname, "..", "src", "lib", "lifi.ts");
const statusPagePath = path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "StatusPage.tsx");
const dexRoutesPath = path.join(__dirname, "..", "src", "routes", "dex.ts");
const priceUpdaterPath = path.join(__dirname, "..", "src", "lib", "priceUpdater.ts");
const apiAppPath = path.join(__dirname, "..", "src", "app.ts");
const apiPackagePath = path.join(__dirname, "..", "package.json");
const apiWatchdogPath = path.join(__dirname, "..", "watchdog.sh");
const apiStartPath = path.join(__dirname, "..", "..", "..", "start.mjs");
const supportSettingsPath = path.join(__dirname, "..", "..", "bsv-dex", "src", "pages", "admin", "SupportSettings.tsx");

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

test("order cancellation is wallet-signed and bound to the exact order", async () => {
  const src = await read(ordersPath);

  assert.match(src, /sameWalletAddress\(existingOrder\.walletAddress, String\(body\.walletAddress\)\)/);
  assert.match(src, /buildOrderActionAuthMessage\(\{/);
  assert.match(src, /action: "cancel"/);
  assert.match(src, /verifyWalletMessageSignature\(/);
  assert.match(src, /CANCEL_AUTH_REPLAYED/);
  assert.match(src, /verifyEvmOrderbookCancelTx\(/);
});

test("market trade history uses canonical fills and excludes pending HTLCs", async () => {
  const orders = await read(ordersPath);
  const markets = await read(path.join(__dirname, "..", "src", "routes", "markets.ts"));

  assert.match(orders, /db\.insert\(tradesTable\)\.values\(\{/);
  assert.match(orders, /settlementIsPending/);
  assert.match(markets, /\.from\(tradesTable\)/);
  assert.match(markets, /NOT LIKE 'htlc-pending-%'/);
  assert.match(markets, /inArray\(ordersTable\.status, \["open", "filled"\]\)/);
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
  assert.match(src, /if \(params\.ledgerOnly\)[\s\S]*?Wallet-to-wallet order settlement is paused/);
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

test("admin integration secrets are not returned to the browser", async () => {
  const [routesSrc, pageSrc] = await Promise.all([
    read(adminRoutesPath),
    read(adminIntegrationsPath),
  ]);
  const getRoute = routesSrc.match(/router\.get\("\/integrations"[\s\S]*?\n\}\);/)?.[0];
  const saveRoute = routesSrc.match(/router\.put\("\/integrations"[\s\S]*?\n\}\);/)?.[0];

  assert.ok(getRoute, "integration settings GET route exists");
  assert.ok(saveRoute, "integration settings PUT route exists");
  assert.match(getRoute, /SECRET_INTEGRATION_KEYS/);
  assert.match(getRoute, /configuredSecrets/);
  assert.match(getRoute, /result\[key\] = ""/);
  assert.match(getRoute, /Cache-Control", "no-store"/);
  assert.match(saveRoute, /value\.trim\(\)\.length === 0/);
  assert.match(saveRoute, /clearKeys/);
  assert.match(pageSrc, /Never retain a secret returned by an older API version/);
  assert.match(pageSrc, /Remove saved value on Save All/);
});

test("admin key panels never return or render private wallet keys", async () => {
  const [routesSrc, pageSrc] = await Promise.all([
    read(adminRoutesPath),
    read(adminSecuritySettingsPath),
  ]);
  const vaultRoute = routesSrc.match(/router\.get\("\/security-vault"[\s\S]*?\n\}\);/)?.[0];
  const totpSetupRoute = routesSrc.match(/router\.get\("\/auth\/totp-uri"[\s\S]*?\n\}\);/)?.[0];

  assert.ok(vaultRoute, "security vault route exists");
  assert.ok(totpSetupRoute, "TOTP enrollment route exists");
  assert.match(vaultRoute, /Cache-Control", "no-store"/);
  assert.doesNotMatch(vaultRoute, /\bwif\s*:|\bprivKeyHex\s*:|\btotpSecret\s*:/);
  assert.doesNotMatch(pageSrc, /vault\.bsvWallet\.(?:wif|privKeyHex)|vault\.totpSecret/);
  assert.match(totpSetupRoute, /isAdminTotpEnabled\(\)/);
  assert.match(totpSetupRoute, /status\(409\)/);
});

test("admin setup guide masks stored credentials while showing configured status", async () => {
  const src = await read(adminSetupGuidePath);

  assert.match(src, /HIDDEN_INTEGRATION_KEYS/);
  assert.match(src, /Configured; the saved value is hidden/);
  assert.match(src, /_configuredSecrets/);
  assert.match(src, /if \(source === "int" && HIDDEN_INTEGRATION_KEYS\.has\(k\)\) return ""/);
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
    totpRoute.indexOf("pendingTotpChallenges.get") < totpRoute.indexOf("tryGenerateAdminToken"),
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

test("BSV wallet encryption verification returns only safe aggregate results", async () => {
  const [walletSrc, adminSrc, securityUiSrc] = await Promise.all([
    read(path.join(__dirname, "..", "src", "lib", "internalBsvWallet.ts")),
    read(path.join(__dirname, "..", "src", "routes", "admin.ts")),
    read(path.join(__dirname, "../../bsv-dex/src/pages/admin/SecuritySettings.tsx")),
  ]);
  const verificationRoute = adminSrc.match(
    /router\.get\("\/security-vault\/bsv-wallet-encryption-check"[\s\S]*?\n\}\);/,
  )?.[0];

  assert.match(walletSrc, /export async function verifyStoredBsvWalletEncryption/);
  assert.match(walletSrc, /ORDER BY created_at ASC\s+LIMIT \$1/);
  assert.match(walletSrc, /status: rows\.length === 0 \? "empty" : failed === 0 \? "verified" : "failed"/);
  assert.ok(verificationRoute, "admin verification endpoint exists");
  assert.match(verificationRoute, /verifyStoredBsvWalletEncryption/);
  assert.doesNotMatch(verificationRoute, /privateKeyHex|encrypted_key|\.wif/);
  assert.match(securityUiSrc, /Verify stored wallets/);
  assert.match(securityUiSrc, /Only counts are returned; private keys stay on the server/);
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

test("Ethereum orderbook orders require confirmed escrow proof and settlement pairing", async () => {
  const [ordersSrc, escrowSrc] = await Promise.all([
    read(ordersPath),
    read(path.join(__dirname, "..", "src", "lib", "evmOrderbookEscrow.ts")),
  ]);

  assert.match(ordersSrc, /router\.get\("\/orders\/evm-settlement\/config"/);
  assert.match(ordersSrc, /verifyEvmOrderLock\(\{/);
  assert.match(ordersSrc, /ORDERBOOK_LOCK_REQUIRED/);
  assert.match(ordersSrc, /ledgerOnly:\s*walletSource\s*===\s*"external"\s*&&\s*networkType\s*===\s*"evm"/);
  assert.match(ordersSrc, /candidateClaimsOrderbookEscrow !== Boolean\(incomingOrderbookFunding\)/);
  assert.match(ordersSrc, /settleEvmOrderFill\(\{/);
  assert.match(ordersSrc, /verifyEvmOrderbookCancelTx\(\{/);
  assert.match(escrowSrc, /MIN_CONFIRMATIONS/);
  assert.match(escrowSrc, /OrderOpened/);
  assert.match(escrowSrc, /configuredEscrow\.toLowerCase\(\) !== params\.escrowAddress\.toLowerCase\(\)/);
});

test("withdrawal history and notification reads require single-use wallet proofs", async () => {
  const [withdrawalsSrc, routesSrc, socialSrc] = await Promise.all([
    read(withdrawalPath),
    read(routesIndexPath),
    read(socialNftPath),
  ]);

  assert.match(withdrawalsSrc, /verifyWalletRequestProof/);
  assert.match(withdrawalsSrc, /resource:\s*"withdrawal-history"/);
  assert.doesNotMatch(withdrawalsSrc, /x-wallet-address[\s\S]{0,120}===\s*paramWallet/);
  assert.match(routesSrc, /verifyWalletRequestProof[\s\S]*resource:\s*"notifications"/);
  assert.match(socialSrc, /verifyWalletRequestProof[\s\S]*resource:\s*"social-notifications"/);
});

test("personal API-key CRUD is wallet-authorized and reveals raw keys only at creation", async () => {
  const [routesSrc, serviceSrc, challengeSrc, uiSrc] = await Promise.all([
    read(routesIndexPath),
    read(personalApiKeysPath),
    read(walletRequestAuthPath),
    read(userApiKeysPath),
  ]);
  assert.match(routesSrc, /router\.get\("\/user\/api-keys"/);
  assert.match(routesSrc, /router\.post\("\/user\/api-keys"/);
  assert.match(routesSrc, /router\.delete\("\/user\/api-keys\/:id"/);
  assert.match(routesSrc, /resource:\s*"personal-api-keys"/);
  assert.match(routesSrc, /personalApiKeyRequestContext/);
  assert.match(challengeSrc, /DELETE FROM platform_settings[\s\S]*RETURNING value/);
  assert.match(challengeSrc, /stored\.context !== params\.context/);
  assert.match(serviceSrc, /createHash\("sha256"\)/);
  assert.match(serviceSrc, /keyHash:\s*hashPersonalApiKey\(key\)/);
  assert.doesNotMatch(serviceSrc, /key:\s*key,/);
  assert.match(serviceSrc, /keyPreview/);
  assert.match(uiSrc, /oneTimeReveal/);
  assert.match(uiSrc, /Shown once/);
  assert.doesNotMatch(uiSrc, /queryFn:\s*async\s*\(\)\s*=>\s*\[\]/);
});

test("personal API keys enforce scopes, owner matching, and durable per-key limits", async () => {
  const [authSrc, serviceSrc, ordersSrc, withdrawalsSrc] = await Promise.all([
    read(apiKeyAuthPath),
    read(personalApiKeysPath),
    read(ordersPath),
    read(withdrawalPath),
  ]);
  assert.match(authSrc, /authenticatePersonalApiKey/);
  assert.match(authSrc, /checkPersonalApiKeyScope/);
  assert.match(authSrc, /sameWalletAddress/);
  assert.match(authSrc, /status\(429\)/);
  assert.match(authSrc, /\/api\/orders/);
  assert.match(serviceSrc, /rate_window_calls = CASE/);
  assert.match(serviceSrc, /WHERE key_hash = \$1 AND status = 'active'/);
  assert.match(ordersSrc, /verifyWalletMessageSignature\(/);
  assert.match(withdrawalsSrc, /verifyWithdrawSignature|verifyBsvWithdrawSignature|verifySolWithdrawSignature/);
});

test("wallet authorization preserves case-sensitive addresses and binds key-creation details", async () => {
  const challengeSrc = await read(walletRequestAuthPath);
  assert.match(challengeSrc, /return \/\^0x\[0-9a-fA-F\]\{40\}\$\/\.test\(trimmed\) \? trimmed\.toLowerCase\(\) : trimmed/);
  assert.match(challengeSrc, /Request: \$\{params\.context\}/);
  assert.match(challengeSrc, /resourceId/);
  assert.match(challengeSrc, /personal-api-keys/);
});

test("public transaction relays are disabled instead of proxying or fabricating broadcasts", async () => {
  const [routesSrc, v1Src] = await Promise.all([read(routesIndexPath), read(v1RoutesPath)]);
  assert.match(routesSrc, /router\.post\("\/bsv\/broadcast", \(_req, res\) => \{\s*res\.status\(410\)/);
  assert.match(v1Src, /router\.post\("\/tx\/broadcast", \(_req, res\) => \{\s*res\.status\(410\)/);
  assert.doesNotMatch(v1Src, /mockHash/);
  assert.doesNotMatch(v1Src, /arcBroadcast/);
});

test("admin sessions are hashed, capped, and fail closed if persistence fails", async () => {
  const src = await read(adminAuthPath);
  assert.match(src, /TOKEN_PREFIX = "admin_session_hash:"/);
  assert.match(src, /hashToken\(token\)/);
  assert.match(src, /MAX_ADMIN_SESSIONS/);
  assert.match(src, /Unable to persist the admin session/);
  assert.doesNotMatch(src, /values\(\{ key: `\$\{LEGACY_TOKEN_PREFIX\}\$\{token\}`/);
});

test("third-party paymail fetches pin public DNS results and reject redirects/private IPs", async () => {
  const src = await read(safeFetchPath);
  assert.match(src, /await lookup\(hostname, \{ all: true, verbatim: true \}\)/);
  assert.match(src, /addresses\.some\(\(a\) => !isPublicAddress/);
  assert.match(src, /callback\(null, selected\.address, selected\.family\)/);
  assert.match(src, /Redirects are not followed/);
  assert.match(src, /169\.254\.0\.0\/16/);
  assert.match(src, /fc00::\/7/);
  assert.match(src, /normalized\.startsWith\("::ffff:"\)/);
  assert.match(src, /maxBytes = options\.maxBytes \?\? 64 \* 1024/);
});

test("email and payment webhooks fail closed without verification secrets", async () => {
  const [routesSrc, webhookSrc] = await Promise.all([read(routesIndexPath), read(webhookHandlersPath)]);
  assert.match(routesSrc, /EMAIL_INBOUND_WEBHOOK_SECRET/);
  assert.match(routesSrc, /if \(!webhookSecret\)/);
  assert.match(routesSrc, /typeof suppliedSecret !== "string"/);
  assert.match(webhookSrc, /STRIPE_WEBHOOK_SECRET is required/);
  assert.doesNotMatch(webhookSrc, /NODE_ENV !== "production"[\s\S]{0,160}fulfillOrder/);
});

test("passkey transfer codes are hashed, short-lived, one-time POST secrets", async () => {
  const [routesSrc, clientSrc] = await Promise.all([read(routesIndexPath), read(path.join(__dirname, "..", "..", "bsv-dex", "src", "lib", "passkeyWallet.ts"))]);
  assert.match(routesSrc, /while \(code\.length < 12\)/);
  assert.match(routesSrc, /pk_tc:\$\{codeHash\}/);
  assert.match(routesSrc, /DELETE FROM platform_settings WHERE key = \$1 RETURNING value/);
  assert.match(routesSrc, /passkey\/transfer\/redeem/);
  assert.match(routesSrc, /2 \* 60 \* 1000/);
  assert.match(clientSrc, /12-char one-time code valid for 2 min/);
  assert.match(routesSrc, /router\.get\("\/passkey\/transfer\/:code",[\s\S]*?res\.status\(410\)/);
});

test("admin email content is isolated from the app origin", async () => {
  const emailSrc = await read(emailInboxPath);
  assert.match(emailSrc, /sandbox=""|sandbox=\{\s*""\s*\}/);
  assert.doesNotMatch(emailSrc, /sandbox="allow-same-origin/);
});

test("legacy HTLC deployment is blocked and new sessions retain a reveal safety margin", async () => {
  const [deploySrc, htlcSrc] = await Promise.all([read(htlcDeployPath), read(evmHtlcPath)]);
  assert.match(deploySrc, /Deployment blocked: contracts\/OrahDEXHTLC\.sol is the legacy keccak256 variant/);
  assert.match(htlcSrc, /BUYER_TIMELOCK_SECS\s*<=\s*SELLER_TIMELOCK_SECS\s*\+\s*HTLC_REVEAL_SAFETY_MARGIN_SECS/);
  assert.match(htlcSrc, /seller leg reveals first/);
  assert.match(htlcSrc, /export function isSafeHtlcRevealWindow/);
  assert.match(htlcSrc, /buyerTimelockUnix > nowUnix \+ 2 \* HTLC_REVEAL_SAFETY_MARGIN_SECS/);
  assert.match(htlcSrc, /refusing reveal because the paired lock window violates the required safety margin/);
});

test("Git automation requires an interactive explicit push confirmation", async () => {
  const root = path.join(__dirname, "..", "..", "..");
  const scripts = await Promise.all(["push.sh", "update-readme.sh", "remove-agents-from-git.sh", "remove-canvas-assets.sh"]
    .map((name) => read(path.join(root, name))));
  for (const src of scripts) {
    assert.match(src, /ORAHDEX_CONFIRM_GIT_PUSH/);
    assert.match(src, /PUSH TO ORIGIN MAIN/);
    assert.match(src, /git push origin Main/);
  }
  const ignore = await read(gitignorePath);
  assert.match(ignore, /backups\//);
  assert.match(ignore, /\*\.sql\.gz/);
});

test("internal admin metadata and authentication state have bounded capacity", async () => {
  const [adminSrc, walletAuthSrc, boundedMapSrc] = await Promise.all([
    read(adminRoutesPath),
    read(path.join(__dirname, "..", "src", "lib", "walletAuth.ts")),
    read(path.join(__dirname, "..", "src", "lib", "boundedMap.ts")),
  ]);
  assert.match(adminSrc, /new BoundedMap<string, \{ nonce: string; message: string; expiresAt: number \}>\(10_000\)/);
  assert.match(adminSrc, /AUTH_ACCOUNT_MAX_FAILURES/);
  assert.match(walletAuthSrc, /new BoundedMap<string, WithdrawNonce>\(10_000\)/);
  assert.match(walletAuthSrc, /new BoundedMap<string, TradeNonce>\(10_000\)/);
  assert.match(boundedMapSrc, /this\.size >= this\.maxEntries/);
});

test("public health reports real worker states and does not call an empty registry healthy", async () => {
  const [src, monitorSrc] = await Promise.all([read(healthHandlerPath), read(selfHealingPath)]);
  assert.match(src, /getHealthReport\(\)\.map/);
  assert.doesNotMatch(src, /getAiProviderHealth/);
  assert.match(src, /services\.length === 0[\s\S]*?"unknown"/);
  assert.match(src, /status,\s*uptime:[\s\S]*services,\s*alerts/);
  assert.match(monitorSrc, /if \(!e\.lastRunAt\)[\s\S]*?status = "starting"/);
  assert.doesNotMatch(src, /anyCriticalDead/);
});

test("status page shows current checks without fabricated historical uptime", async () => {
  const src = await read(statusPagePath);
  assert.match(src, /historical uptime is not tracked/);
  assert.match(src, /health\.status === "unknown"/);
  assert.doesNotMatch(src, /generateBars|calcUptime|% uptime|< 30 DAYS AGO/);
});

test("candle caches are bounded and symbols/payloads are validated", async () => {
  const candleSrc = await read(candleFetcherPath);
  assert.match(candleSrc, /HISTORY_CACHE_MAX_ENTRIES = 24/);
  assert.match(candleSrc, /setHistoryCache\(cacheKey/);
  assert.match(candleSrc, /coingeckoOhlcCache = new BoundedMap/);
  assert.match(candleSrc, /candleRefreshBackoff = new BoundedMap/);
});

test("public chat storage is bounded and privileged channels require server auth", async () => {
  const [chatSrc, supportUi] = await Promise.all([read(chatRoutesPath), read(supportSettingsPath)]);
  assert.match(chatSrc, /new BoundedMap<ChannelId, ChatMessage\[\]>\(MAX_CHAT_CHANNELS\)/);
  assert.match(chatSrc, /normalizeChannel/);
  assert.match(chatSrc, /MAX_SSE_CLIENTS_TOTAL = 500/);
  assert.match(chatSrc, /role: "trader"/);
  assert.match(chatSrc, /router\.post\("\/system", requireAdminToken/);
  assert.doesNotMatch(chatSrc, /ADMIN_KEY.*admin-secret|expectedKey = .*admin-secret/);
  assert.match(supportUi, /adminFetch\(`\/api\/chat\/system`/);
  assert.doesNotMatch(supportUi, /adminKey/);
});

test("high-cardinality quote and withdrawal caches have fixed capacity", async () => {
  const [swapSrc, withdrawalSrc, lifiSrc] = await Promise.all([
    read(swapRoutesPath),
    read(withdrawalsRoutesPath),
    read(lifiClientPath),
  ]);
  assert.match(swapSrc, /_rateCache\s*=\s*new BoundedMap/);
  assert.match(swapSrc, /_rateInFlight\s*=\s*new BoundedMap/);
  assert.match(withdrawalSrc, /_withdrawRateMap\s*=\s*new BoundedMap/);
  assert.match(lifiSrc, /tokensCache = new BoundedMap/);
});

test("public coin lookups cap retained data and reject oversized identifiers", async () => {
  const [dexSrc, priceUpdaterSrc] = await Promise.all([
    read(dexRoutesPath),
    read(priceUpdaterPath),
  ]);
  assert.match(dexSrc, /tickerCache = new BoundedMap/);
  assert.match(dexSrc, /detailCache = new BoundedMap/);
  assert.match(dexSrc, /cgCoinCache\s*=\s*new BoundedMap/);
  assert.match(dexSrc, /cgSearchCache\s*=\s*new BoundedMap/);
  assert.match(dexSrc, /contractLookupCache = new BoundedMap/);
  assert.match(dexSrc, /fullCache = new BoundedMap/);
  assert.match(dexSrc, /cgIdMap = new BoundedMap/);
  assert.match(dexSrc, /MAX_IN_FLIGHT_ENRICHMENTS/);
  assert.match(dexSrc, /Invalid coin symbol/);
  assert.match(dexSrc, /0x\[0-9a-f\]\{40\}/);
  assert.match(priceUpdaterSrc, /_cgIdMissCache = new BoundedMap/);
  assert.match(priceUpdaterSrc, /cgMarketCapCache = new BoundedMap/);
});

test("API heap usage is observable and its default heap budget is bounded", async () => {
  const [appSrc, packageSrc, watchdogSrc, startSrc] = await Promise.all([
    read(apiAppPath),
    read(apiPackagePath),
    read(apiWatchdogPath),
    read(apiStartPath),
  ]);
  assert.match(appSrc, /v8\.getHeapStatistics\(\)\.heap_size_limit/);
  assert.match(appSrc, /API request completed during memory pressure/);
  assert.match(appSrc, /\}, 30_000\)\.unref\(\)/);
  assert.match(packageSrc, /API_MAX_OLD_SPACE_MB:-1024/);
  assert.match(watchdogSrc, /API_MAX_OLD_SPACE_MB:-1024/);
  assert.match(startSrc, /API_MAX_OLD_SPACE_MB/);
  assert.match(startSrc, /max-old-space-size=\$\{API_HEAP_MB\}/);
  assert.doesNotMatch(startSrc, /max-old-space-size=4096/);
});
