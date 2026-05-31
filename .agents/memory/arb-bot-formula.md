---
name: Arb bot triangular arbitrage formula
description: The correct formula for computing gross return on each leg of triangular arb in arbBot.ts
---

The triangular arb bot operates on markets where `priceAB` = price of asset A quoted in asset B (how many B per 1 A).

**Route 1 — USDT → A → B → USDT:**
Gross return = `(priceAB * priceBUSDT) / priceAUSDT`

**Route 2 — USDT → B → A → USDT:**
Gross return = `priceAUSDT / (priceAB * priceBUSDT)`

**Why:** The original code used `priceBUSDT / (priceAUSDT * priceAB)` (Route 1) and `(priceAUSDT * priceAB) / priceBUSDT` (Route 2), which are mathematically wrong. For tokens with near-zero USD prices (PIT, BABYDOGE), `priceAUSDT * priceAB` underflows toward zero making the ratio blow up to e+31 levels.

**How to apply:** Anytime you touch findOpportunities() in arbBot.ts, verify the formula against: in an efficient market with priceAUSDT = priceAB * priceBUSDT, both routes should return ≈1.0 (before fees).
