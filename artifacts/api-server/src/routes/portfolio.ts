import { Router, type IRouter } from "express";
import { generatePortfolio, generateWalletTransactions } from "../lib/mockData.js";

const router: IRouter = Router();

router.get("/portfolio", (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  res.json(generatePortfolio(walletAddress));
});

router.get("/wallet/connect", (req, res) => {
  res.json({ message: "Use POST to connect" });
});

router.post("/wallet/connect", (req, res) => {
  const body = req.body;
  if (!body.address || !body.provider) {
    res.status(400).json({ error: "address and provider are required" });
    return;
  }
  res.json({
    address: body.address,
    provider: body.provider,
    connected: true,
    connectedAt: new Date().toISOString(),
    publicKey: body.publicKey || null,
  });
});

router.get("/wallet/transactions", (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  res.json(generateWalletTransactions(walletAddress, limit));
});

export default router;
