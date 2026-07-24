import { Router, Request, Response } from "express";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

const router = Router();

const CDP_API_HOST = "api.developer.coinbase.com";
const TOKEN_PATH   = "/onramp/v1/token";
const TOKEN_URL    = `https://${CDP_API_HOST}${TOKEN_PATH}`;

async function makeCdpJwt(method: string, path: string): Promise<string> {
  const keyName   = process.env.COINBASE_CDP_KEY_NAME   ?? "";
  const keySecret = process.env.COINBASE_CDP_KEY_SECRET ?? "";
  if (!keyName || !keySecret) throw new Error("CDP credentials not configured");
  return generateJwt({
    apiKeyId:      keyName,
    apiKeySecret:  keySecret,
    requestMethod: method,
    requestHost:   CDP_API_HOST,
    requestPath:   path,
    expiresIn:     120,
  });
}

router.post("/coinbase/onramp-token", async (req: Request, res: Response) => {
  try {
    const { address, blockchains, clientIp } = req.body as {
      address?: string;
      blockchains?: string[];
      clientIp?: string;
    };

    const jwt = await makeCdpJwt("POST", TOKEN_PATH);

    const body: Record<string, unknown> = {
      clientIp: clientIp ?? "127.0.0.1",
    };
    if (address) {
      body.addresses = [{ address, blockchains: blockchains ?? ["ethereum", "base"] }];
    }

    const upstream = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json() as { token?: string; message?: string };
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: data.message ?? "Coinbase token error" });
      return;
    }

    res.json({ token: data.token });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("not configured") ? 503 : 500;
    res.status(status).json({ error: msg });
  }
});

router.get("/coinbase/onramp-config", (_req: Request, res: Response) => {
  const configured = !!(
    process.env.COINBASE_CDP_KEY_NAME && process.env.COINBASE_CDP_KEY_SECRET
  );
  res.json({ configured });
});

export default router;
