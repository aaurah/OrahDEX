import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  optionsContractsTable,
  optionsPositionsTable,
  optionsOrdersTable,
  marketsTable,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "../lib/logger.js";
import { blackScholes, getTimeToExpiry } from "../lib/optionsPricing.js";
import { parseUnits, formatUnits, mulPriceQty } from "../lib/money.js";

const router: IRouter = Router();

const CONTRACT_MULTIPLIER = 100; // 1 contract = 100 units of underlying
const LEDGER_DECIMALS = 18;

function formatContract(c: typeof optionsContractsTable.$inferSelect, liveGreeks?: ReturnType<typeof blackScholes>) {
  return {
    id:                c.id,
    underlyingSymbol:  c.underlyingSymbol,
    optionType:        c.optionType,
    strike:            parseFloat(c.strike),
    expiry:            c.expiry.toISOString(),
    settlementPrice:   c.settlementPrice ? parseFloat(c.settlementPrice) : null,
    impliedVolatility: parseFloat(c.impliedVolatility),
    openInterest:      parseFloat(c.openInterest),
    delta:             liveGreeks ? liveGreeks.delta  : parseFloat(c.delta),
    gamma:             liveGreeks ? liveGreeks.gamma  : parseFloat(c.gamma),
    theta:             liveGreeks ? liveGreeks.theta  : parseFloat(c.theta),
    vega:              liveGreeks ? liveGreeks.vega   : parseFloat(c.vega),
    rho:               liveGreeks ? liveGreeks.rho    : parseFloat(c.rho),
    premium:           liveGreeks ? liveGreeks.premium : null,
    status:            c.status,
    createdAt:         c.createdAt.toISOString(),
  };
}

async function getSpotPrice(symbol: string): Promise<number | null> {
  const baseSymbol = symbol.includes("/") ? symbol : `${symbol}/USDT`;
  const [market] = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.symbol, baseSymbol));
  if (!market) return null;
  const price = parseFloat(market.lastPrice);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function getUserUsdtBalance(walletAddress: string): Promise<string> {
  const { rows } = await pool.query<{ available: string }>(
    `SELECT available FROM user_balances WHERE wallet_address = $1 AND asset_symbol = 'USDT'`,
    [walletAddress.toLowerCase()],
  );
  return rows[0]?.available ?? "0";
}

async function debitUserBalance(walletAddress: string, amount: string | number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances WHERE wallet_address = $1 AND asset_symbol = 'USDT' FOR UPDATE`,
      [walletAddress.toLowerCase()],
    );
    const amountRaw = parseUnits(String(amount), LEDGER_DECIMALS);
    const availRaw = parseUnits(rows[0]?.available ?? "0", LEDGER_DECIMALS);
    if (availRaw < amountRaw) {
      throw new Error(
        `INSUFFICIENT_BALANCE: need ${formatUnits(amountRaw, LEDGER_DECIMALS)} USDT, ` +
        `have ${formatUnits(availRaw, LEDGER_DECIMALS)}`,
      );
    }
    await client.query(
      `UPDATE user_balances SET available = available - $1, updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = 'USDT'`,
      [formatUnits(amountRaw, LEDGER_DECIMALS), walletAddress.toLowerCase()],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function creditUserBalance(walletAddress: string, amount: string | number): Promise<void> {
  const amountRaw = parseUnits(String(amount), LEDGER_DECIMALS);
  await pool.query(
    `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
     VALUES ($1, 'USDT', $2, 0, now())
     ON CONFLICT (wallet_address, asset_symbol)
     DO UPDATE SET available = user_balances.available + $2, updated_at = now()`,
    [walletAddress.toLowerCase(), formatUnits(amountRaw, LEDGER_DECIMALS)],
  );
}

// ── GET /options/contracts ────────────────────────────────────────────────────
router.get("/options/contracts", async (req, res) => {
  try {
    const underlying = (req.query.underlying as string | undefined)?.toUpperCase();
    const expiryParam = req.query.expiry as string | undefined;

    const allContracts = await db
      .select()
      .from(optionsContractsTable)
      .where(eq(optionsContractsTable.status, "active"))
      .orderBy(optionsContractsTable.expiry, optionsContractsTable.strike);

    const filtered = allContracts.filter((c) => {
      if (underlying && c.underlyingSymbol !== underlying) return false;
      if (expiryParam) {
        const target = expiryParam.slice(0, 7); // "YYYY-MM"
        const contractMonth = c.expiry.toISOString().slice(0, 7);
        if (contractMonth !== target) return false;
      }
      return true;
    });

    // Build a spot-price cache for each symbol we encounter
    const spotCache: Record<string, number | null> = {};
    for (const c of filtered) {
      if (!(c.underlyingSymbol in spotCache)) {
        spotCache[c.underlyingSymbol] = await getSpotPrice(c.underlyingSymbol);
      }
    }

    const result = filtered.map((c) => {
      const spot = spotCache[c.underlyingSymbol];
      if (!spot) return formatContract(c);
      const tte = getTimeToExpiry(c.expiry);
      const greeks = blackScholes({
        spot,
        strike:       parseFloat(c.strike),
        expiry:       tte,
        riskFreeRate: 0.05,
        volatility:   parseFloat(c.impliedVolatility),
        optionType:   c.optionType as "call" | "put",
      });
      return formatContract(c, greeks);
    });

    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to get options contracts");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /options/contracts (admin only) ──────────────────────────────────────
router.post("/options/contracts", async (req, res) => {
  const adminToken = req.headers["x-admin-token"];
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const { underlyingSymbol, optionType, strike, expiry, impliedVolatility } = req.body;
    if (!underlyingSymbol || !optionType || !strike || !expiry || !impliedVolatility) {
      res.status(400).json({ error: "Missing required fields: underlyingSymbol, optionType, strike, expiry, impliedVolatility" });
      return;
    }
    if (!["call", "put"].includes(optionType)) {
      res.status(400).json({ error: "optionType must be 'call' or 'put'" });
      return;
    }

    const strikeNum    = parseFloat(strike);
    const ivNum        = parseFloat(impliedVolatility);
    const expiryDate   = new Date(expiry);

    if (!Number.isFinite(strikeNum) || strikeNum <= 0) {
      res.status(400).json({ error: "strike must be a positive number" });
      return;
    }
    if (!Number.isFinite(ivNum) || ivNum <= 0) {
      res.status(400).json({ error: "impliedVolatility must be a positive number" });
      return;
    }
    if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
      res.status(400).json({ error: "expiry must be a future date" });
      return;
    }

    const spot = await getSpotPrice(underlyingSymbol);
    const tte  = getTimeToExpiry(expiryDate);

    const greeks = spot
      ? blackScholes({ spot, strike: strikeNum, expiry: tte, riskFreeRate: 0.05, volatility: ivNum, optionType })
      : null;

    const id = crypto.randomUUID();
    const [inserted] = await db
      .insert(optionsContractsTable)
      .values({
        id,
        underlyingSymbol: underlyingSymbol.toUpperCase(),
        optionType,
        strike:           strikeNum.toFixed(8),
        expiry:           expiryDate,
        impliedVolatility: ivNum.toFixed(6),
        openInterest:     "0",
        delta:            (greeks?.delta  ?? 0).toFixed(6),
        gamma:            (greeks?.gamma  ?? 0).toFixed(6),
        theta:            (greeks?.theta  ?? 0).toFixed(6),
        vega:             (greeks?.vega   ?? 0).toFixed(6),
        rho:              (greeks?.rho    ?? 0).toFixed(6),
        status:           "active",
      })
      .returning();

    res.status(201).json(formatContract(inserted!, greeks ?? undefined));
  } catch (err) {
    logger.error({ err }, "Failed to create options contract");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /options/order ───────────────────────────────────────────────────────
router.post("/options/order", async (req, res) => {
  try {
    const { walletAddress, contractId, side, quantity, limitPremium } = req.body;

    if (!walletAddress || !contractId || !side || !quantity) {
      res.status(400).json({ error: "Missing required fields: walletAddress, contractId, side, quantity" });
      return;
    }
    if (!["buy", "sell"].includes(side)) {
      res.status(400).json({ error: "side must be 'buy' or 'sell'" });
      return;
    }
    let qtyRaw: bigint;
    try {
      qtyRaw = parseUnits(String(quantity), LEDGER_DECIMALS);
    } catch {
      res.status(400).json({ error: "quantity must be a positive decimal string" });
      return;
    }
    if (qtyRaw <= 0n) {
      res.status(400).json({ error: "quantity must be positive" });
      return;
    }
    const qtyStr = formatUnits(qtyRaw, LEDGER_DECIMALS);

    const [contract] = await db
      .select()
      .from(optionsContractsTable)
      .where(eq(optionsContractsTable.id, contractId));

    if (!contract) {
      res.status(404).json({ error: "Contract not found" });
      return;
    }
    if (contract.status !== "active") {
      res.status(400).json({ error: `Contract is ${contract.status}` });
      return;
    }
    if (getTimeToExpiry(contract.expiry) <= 0) {
      res.status(400).json({ error: "Contract has expired" });
      return;
    }

    const spot = await getSpotPrice(contract.underlyingSymbol);
    const tte  = getTimeToExpiry(contract.expiry);
    const greeks = spot
      ? blackScholes({
          spot,
          strike:       parseFloat(contract.strike),
          expiry:       tte,
          riskFreeRate: 0.05,
          volatility:   parseFloat(contract.impliedVolatility),
          optionType:   contract.optionType as "call" | "put",
        })
      : null;

    const marketPremium = greeks?.premium ?? 0;
    const effectivePremiumRaw = limitPremium
      ? parseUnits(String(limitPremium), LEDGER_DECIMALS)
      : parseUnits(marketPremium.toFixed(LEDGER_DECIMALS), LEDGER_DECIMALS);
    const isMarketOrder = !limitPremium;

    const premiumQtyRaw = mulPriceQty({
      priceRaw: effectivePremiumRaw,
      priceDecimals: LEDGER_DECIMALS,
      quantityRaw: qtyRaw,
      quantityDecimals: LEDGER_DECIMALS,
      outputDecimals: LEDGER_DECIMALS,
      rounding: "ceil",
    });
    const requiredCollateralRaw =
      premiumQtyRaw *
      BigInt(side === "buy" ? CONTRACT_MULTIPLIER : CONTRACT_MULTIPLIER * 10);
    const requiredCollateralStr = formatUnits(requiredCollateralRaw, LEDGER_DECIMALS);

    const usdtBalanceRaw = parseUnits(await getUserUsdtBalance(walletAddress), LEDGER_DECIMALS);
    if (usdtBalanceRaw < requiredCollateralRaw) {
      res.status(400).json({
        error:
          `Insufficient USDT balance. Required: ${requiredCollateralStr}, ` +
          `available: ${formatUnits(usdtBalanceRaw, LEDGER_DECIMALS)}`,
        code: "INSUFFICIENT_BALANCE",
      });
      return;
    }

    await debitUserBalance(walletAddress, requiredCollateralStr);

    const orderId = crypto.randomUUID();
    const [order] = await db
      .insert(optionsOrdersTable)
      .values({
        id:            orderId,
        walletAddress,
        contractId,
        side,
        quantity:      qtyStr,
        limitPremium:  limitPremium ? formatUnits(parseUnits(String(limitPremium), LEDGER_DECIMALS), LEDGER_DECIMALS) : undefined,
        status:        isMarketOrder ? "filled" : "open",
        filledQuantity: isMarketOrder ? qtyStr : "0",
      })
      .returning();

    let position: typeof optionsPositionsTable.$inferSelect | undefined;

    if (isMarketOrder) {
      const positionId = crypto.randomUUID();
      const positionSide = side === "buy" ? "long" : "short";

      const [inserted] = await db
        .insert(optionsPositionsTable)
        .values({
          id:            positionId,
          walletAddress,
          contractId,
          side:          positionSide,
          quantity:      qtyStr,
          entryPremium:  formatUnits(parseUnits(marketPremium.toFixed(LEDGER_DECIMALS), LEDGER_DECIMALS), LEDGER_DECIMALS),
          currentPremium: formatUnits(parseUnits(marketPremium.toFixed(LEDGER_DECIMALS), LEDGER_DECIMALS), LEDGER_DECIMALS),
          unrealizedPnl: "0",
          realizedPnl:   "0",
          collateral:    requiredCollateralStr,
          status:        "open",
        })
        .returning();

      position = inserted;

      // Increment open interest
      await db
        .update(optionsContractsTable)
        .set({
          openInterest: formatUnits(
            parseUnits(contract.openInterest, LEDGER_DECIMALS) + qtyRaw,
            LEDGER_DECIMALS,
          ),
        })
        .where(eq(optionsContractsTable.id, contractId));
    }

    res.status(201).json({
      order: {
        id:            order!.id,
        walletAddress: order!.walletAddress,
        contractId:    order!.contractId,
        side:          order!.side,
        quantity:      parseFloat(order!.quantity),
        limitPremium:  order!.limitPremium ? parseFloat(order!.limitPremium) : null,
        status:        order!.status,
        filledQuantity: parseFloat(order!.filledQuantity),
        createdAt:     order!.createdAt.toISOString(),
      },
      position: position
        ? {
            id:            position.id,
            contractId:    position.contractId,
            side:          position.side,
            quantity:      parseFloat(position.quantity),
            entryPremium:  parseFloat(position.entryPremium),
            currentPremium: position.currentPremium ? parseFloat(position.currentPremium) : null,
            collateral:    parseFloat(position.collateral),
            status:        position.status,
          }
        : null,
      marketPremium,
      requiredCollateral: Number(requiredCollateralStr),
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to create options order");
    if (err?.message?.startsWith("INSUFFICIENT_BALANCE")) {
      res.status(400).json({ error: err.message, code: "INSUFFICIENT_BALANCE" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// ── GET /options/positions ────────────────────────────────────────────────────
router.get("/options/positions", async (req, res) => {
  try {
    const walletAddress = req.query.walletAddress as string | undefined;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const positions = await db
      .select()
      .from(optionsPositionsTable)
      .where(
        and(
          eq(optionsPositionsTable.walletAddress, walletAddress),
          eq(optionsPositionsTable.status, "open"),
        ),
      );

    if (positions.length === 0) {
      res.json([]);
      return;
    }

    // Fetch all contracts for these positions
    const contractIds = [...new Set(positions.map((p) => p.contractId))];
    const contracts: Record<string, typeof optionsContractsTable.$inferSelect> = {};
    for (const cid of contractIds) {
      const cidStr = cid as string;
      const [c] = await db.select().from(optionsContractsTable).where(eq(optionsContractsTable.id, cidStr));
      if (c) contracts[cidStr] = c;
    }

    const spotCache: Record<string, number | null> = {};
    const result = await Promise.all(
      positions.map(async (pos) => {
        const contract = contracts[pos.contractId];
        if (!contract) return null;

        if (!(contract.underlyingSymbol in spotCache)) {
          spotCache[contract.underlyingSymbol] = await getSpotPrice(contract.underlyingSymbol);
        }
        const spot = spotCache[contract.underlyingSymbol];
        const tte  = getTimeToExpiry(contract.expiry);

        let currentPremium = pos.currentPremium ? parseFloat(pos.currentPremium) : 0;
        let unrealizedPnl  = 0;

        if (spot && tte > 0) {
          const greeks = blackScholes({
            spot,
            strike:       parseFloat(contract.strike),
            expiry:       tte,
            riskFreeRate: 0.05,
            volatility:   parseFloat(contract.impliedVolatility),
            optionType:   contract.optionType as "call" | "put",
          });
          currentPremium = greeks.premium;
          const qty      = parseFloat(pos.quantity);
          const entry    = parseFloat(pos.entryPremium);
          unrealizedPnl =
            pos.side === "long"
              ? (currentPremium - entry) * qty * CONTRACT_MULTIPLIER
              : (entry - currentPremium) * qty * CONTRACT_MULTIPLIER;
        }

        return {
          id:             pos.id,
          walletAddress:  pos.walletAddress,
          contractId:     pos.contractId,
          contract:       formatContract(contract),
          side:           pos.side,
          quantity:       parseFloat(pos.quantity),
          entryPremium:   parseFloat(pos.entryPremium),
          currentPremium,
          unrealizedPnl,
          realizedPnl:    parseFloat(pos.realizedPnl),
          collateral:     parseFloat(pos.collateral),
          status:         pos.status,
          createdAt:      pos.createdAt.toISOString(),
        };
      }),
    );

    res.setHeader("Cache-Control", "no-store");
    res.json(result.filter(Boolean));
  } catch (err) {
    logger.error({ err }, "Failed to get options positions");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /options/exercise/:positionId ───────────────────────────────────────
router.post("/options/exercise/:positionId", async (req, res) => {
  try {
    const { positionId } = req.params;
    const { walletAddress } = req.body;

    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const [pos] = await db
      .select()
      .from(optionsPositionsTable)
      .where(
        and(
          eq(optionsPositionsTable.id, positionId),
          eq(optionsPositionsTable.walletAddress, walletAddress),
        ),
      );

    if (!pos) {
      res.status(404).json({ error: "Position not found" });
      return;
    }
    if (pos.status !== "open") {
      res.status(400).json({ error: `Position is already ${pos.status}` });
      return;
    }
    if (pos.side !== "long") {
      res.status(400).json({ error: "Only long positions can be exercised" });
      return;
    }

    const [contract] = await db
      .select()
      .from(optionsContractsTable)
      .where(eq(optionsContractsTable.id, pos.contractId));

    if (!contract) {
      res.status(404).json({ error: "Contract not found" });
      return;
    }

    const tte    = getTimeToExpiry(contract.expiry);
    const strike = parseFloat(contract.strike);

    // Must be within 24h of expiry
    const hoursToExpiry = tte * 365.25 * 24;
    if (hoursToExpiry > 24) {
      res.status(400).json({ error: "Option can only be exercised within 24 hours of expiry" });
      return;
    }

    const spot = await getSpotPrice(contract.underlyingSymbol);
    if (!spot) {
      res.status(503).json({ error: "Unable to fetch current price for settlement" });
      return;
    }

    // Check if in the money
    const isCall = contract.optionType === "call";
    const isITM  = isCall ? spot > strike : spot < strike;
    if (!isITM) {
      res.status(400).json({ error: "Option is out of the money and cannot be exercised" });
      return;
    }

    const spotRaw = parseUnits(spot.toFixed(LEDGER_DECIMALS), LEDGER_DECIMALS);
    const strikeRaw = parseUnits(contract.strike, LEDGER_DECIMALS);
    const qtyRaw = parseUnits(pos.quantity, LEDGER_DECIMALS);
    const intrinsicRaw = isCall
      ? (spotRaw > strikeRaw ? spotRaw - strikeRaw : 0n)
      : (strikeRaw > spotRaw ? strikeRaw - spotRaw : 0n);
    const profitRaw =
      mulPriceQty({
        priceRaw: intrinsicRaw,
        priceDecimals: LEDGER_DECIMALS,
        quantityRaw: qtyRaw,
        quantityDecimals: LEDGER_DECIMALS,
        outputDecimals: LEDGER_DECIMALS,
        rounding: "floor",
      }) * BigInt(CONTRACT_MULTIPLIER);
    const collateralRaw = parseUnits(pos.collateral, LEDGER_DECIMALS);

    await db
      .update(optionsPositionsTable)
      .set({
        status:       "exercised",
        realizedPnl:  formatUnits(profitRaw, LEDGER_DECIMALS),
        unrealizedPnl: "0",
        exercisedAt:  new Date(),
        updatedAt:    new Date(),
      })
      .where(eq(optionsPositionsTable.id, positionId));

    // Credit profit + return collateral
    const totalCreditRaw = profitRaw + collateralRaw;
    await creditUserBalance(walletAddress, formatUnits(totalCreditRaw, LEDGER_DECIMALS));

    res.json({
      positionId,
      exercised:       true,
      optionType:      contract.optionType,
      strike,
      settlementPrice: spot,
      quantity:        formatUnits(qtyRaw, LEDGER_DECIMALS),
      profit:          formatUnits(profitRaw, LEDGER_DECIMALS),
      collateral:      formatUnits(collateralRaw, LEDGER_DECIMALS),
      totalCredit:     formatUnits(totalCreditRaw, LEDGER_DECIMALS),
    });
  } catch (err) {
    logger.error({ err }, "Failed to exercise option");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /options/chain/:symbol ────────────────────────────────────────────────
router.get("/options/chain/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    const contracts = await db
      .select()
      .from(optionsContractsTable)
      .where(
        and(
          eq(optionsContractsTable.underlyingSymbol, symbol),
          eq(optionsContractsTable.status, "active"),
        ),
      )
      .orderBy(optionsContractsTable.expiry, optionsContractsTable.strike);

    const spot = await getSpotPrice(symbol);

    // Group by expiry
    const byExpiry: Record<string, {
      expiry: string;
      calls: ReturnType<typeof formatContract>[];
      puts:  ReturnType<typeof formatContract>[];
    }> = {};

    for (const c of contracts) {
      const expiryKey = c.expiry.toISOString();

      if (!byExpiry[expiryKey]) {
        byExpiry[expiryKey] = { expiry: expiryKey, calls: [], puts: [] };
      }

      let greeks: ReturnType<typeof blackScholes> | undefined;
      if (spot) {
        const tte = getTimeToExpiry(c.expiry);
        greeks = blackScholes({
          spot,
          strike:       parseFloat(c.strike),
          expiry:       tte,
          riskFreeRate: 0.05,
          volatility:   parseFloat(c.impliedVolatility),
          optionType:   c.optionType as "call" | "put",
        });
      }

      const formatted = formatContract(c, greeks);
      if (c.optionType === "call") {
        byExpiry[expiryKey]!.calls.push(formatted);
      } else {
        byExpiry[expiryKey]!.puts.push(formatted);
      }
    }

    res.json({
      symbol,
      spotPrice: spot ?? null,
      expirations: Object.values(byExpiry).sort((a, b) =>
        new Date(a.expiry).getTime() - new Date(b.expiry).getTime(),
      ),
    });
  } catch (err) {
    logger.error({ err }, "Failed to get options chain");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
