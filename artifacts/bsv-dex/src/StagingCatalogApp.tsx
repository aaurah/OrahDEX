import { useEffect, useState } from "react";

type Coin = {
  symbol: string;
  name?: string;
  network?: string;
};

export default function StagingCatalogApp() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [status, setStatus] = useState("Checking staging API...");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [health, catalog] = await Promise.all([
          fetch("/api/health", {
            signal: controller.signal,
          }),
          fetch("/api/simpleswap/currencies", {
            signal: controller.signal,
          }),
        ]);

        if (!health.ok || !catalog.ok) {
          throw new Error("Staging API unavailable");
        }

        const h = await health.json();
        const c = await catalog.json();

        if (!Array.isArray(c)) {
          throw new Error("Invalid catalog response");
        }

        setStatus(h.status === "ok"
          ? "Staging API online"
          : "Staging API status unknown");

        setCoins(c);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      }
    }

    load();

    return () => controller.abort();
  }, []);

  return (
    <main style={{
      minHeight: "100vh",
      background: "#070e20",
      color: "#f0f6ff",
      padding: "32px",
      fontFamily: "system-ui, sans-serif"
    }}>
      <h1>OrahDEX Cloud Preview</h1>
      <p>Read-only cross-chain currency catalog</p>

      <p>{status}</p>
      {error && <p role="alert">{error}</p>}

      <h2>{coins.length.toLocaleString()} catalog entries</h2>

      <p>
        Demonstration only. Wallet connections,
        trading and withdrawals are disabled.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "12px"
      }}>
        {coins.slice(0, 100).map((coin, index) => (
          <article
            key={`${coin.symbol}-${coin.network}-${index}`}
            style={{
              padding: "16px",
              border: "1px solid #26385b",
              borderRadius: "12px",
              background: "#101c35"
            }}
          >
            <strong>{coin.symbol}</strong>
            <p>{coin.name || "Unknown asset"}</p>
            <small>{coin.network || "Unknown network"}</small>
          </article>
        ))}
      </div>
    </main>
  );
}
