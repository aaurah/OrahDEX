import { useEffect, useRef } from "react";
import { usePriceAlertsStore } from "@/store/usePriceAlertsStore";
import { useNotificationStore } from "@/store/useNotificationStore";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const POLL_MS = 30_000;

/**
 * Polls /api/prices and fires `price_alert` notifications when any user-defined
 * alert's condition is satisfied. Each alert fires once (marked triggered);
 * the user can re-arm it from the dialog.
 */
export function usePriceAlertsWatcher() {
  const enabled = usePriceAlertsStore((s) => s.enabled);
  const alerts = usePriceAlertsStore((s) => s.alerts);
  const markTriggered = usePriceAlertsStore((s) => s.markTriggered);
  const addNotification = useNotificationStore((s) => s.addNotification);

  // Hold latest references so the interval callback always reads fresh data.
  const stateRef = useRef({ enabled, alerts, markTriggered, addNotification });
  stateRef.current = { enabled, alerts, markTriggered, addNotification };

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const { enabled, alerts, markTriggered, addNotification } = stateRef.current;
      if (!enabled) return;
      const armed = alerts.filter((a) => a.triggeredAt === null);
      if (armed.length === 0) return;

      try {
        const res = await fetch(`${BASE}/api/prices`, { cache: "no-store" });
        if (!res.ok) return;
        const prices = (await res.json()) as Record<string, number>;
        if (cancelled) return;

        for (const a of armed) {
          const price = prices[a.symbol];
          if (typeof price !== "number" || !(price > 0)) continue;
          const hit =
            (a.condition === "above" && price >= a.target) ||
            (a.condition === "below" && price <= a.target);
          if (!hit) continue;

          markTriggered(a.id, price);
          addNotification({
            type: "price_alert",
            title: `${a.symbol} ${a.condition === "above" ? "↑" : "↓"} $${a.target}`,
            body: `${a.symbol} is now $${price.toLocaleString("en-US", {
              maximumFractionDigits: price < 1 ? 6 : 2,
            })} (${a.condition} your target of $${a.target}).`,
          });
        }
      } catch {
        /* network blip — try next tick */
      }
    }

    // Run immediately, then on interval.
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
}
