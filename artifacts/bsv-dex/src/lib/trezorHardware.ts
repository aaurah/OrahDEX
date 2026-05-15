/**
 * Trezor hardware wallet integration via TrezorConnect web popup.
 * TrezorConnect is loaded dynamically to keep the initial bundle small.
 */

export interface TrezorAccount {
  path: string;
  address: string;
  label: string;
}

export function isTrezorSupported(): boolean {
  return typeof window !== "undefined";
}

async function getTrezorConnect() {
  const mod = await import("@trezor/connect-web");
  const TrezorConnect = mod.default;
  try {
    await TrezorConnect.init({
      manifest: {
        appName: "OrahDEX",
        email: "support@orahdex.org",
        appUrl: "https://orahdex.org",
      },
      lazyLoad: true,
    });
  } catch {
    // init may throw if already initialised — safe to ignore
  }
  return TrezorConnect;
}

const TREZOR_PATHS = [
  { label: "Account 1", path: "m/44'/60'/0'/0/0" },
  { label: "Account 2", path: "m/44'/60'/0'/0/1" },
  { label: "Account 3", path: "m/44'/60'/0'/0/2" },
  { label: "Account 4", path: "m/44'/60'/0'/0/3" },
  { label: "Account 5", path: "m/44'/60'/0'/0/4" },
];

export async function getTrezorAccounts(): Promise<TrezorAccount[]> {
  const TrezorConnect = await getTrezorConnect();

  const results = await Promise.allSettled(
    TREZOR_PATHS.map(async ({ path, label }) => {
      const result = await TrezorConnect.ethereumGetAddress({
        path,
        showOnTrezor: false,
      } as any);
      if (!result.success) throw new Error((result as any).payload?.error ?? "Failed");
      return { path, address: (result as any).payload.address as string, label };
    })
  );

  const accounts: TrezorAccount[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") accounts.push(r.value);
  }
  if (accounts.length === 0) throw new Error("No accounts returned from Trezor.");
  return accounts;
}

export async function getTrezorSingleAddress(path = "m/44'/60'/0'/0/0", showOnTrezor = true): Promise<string> {
  const TrezorConnect = await getTrezorConnect();
  const result = await TrezorConnect.ethereumGetAddress({ path, showOnTrezor } as any);
  if (!result.success) throw new Error((result as any).payload?.error ?? "Trezor error");
  return (result as any).payload.address as string;
}

export function trezorErrMsg(err: unknown): string {
  if (!err) return "Unknown error";
  const msg: string = (err as any)?.message ?? String(err);
  if (msg.includes("Popup closed")) return "Trezor popup was closed. Try again.";
  if (msg.includes("Cancelled")) return "Cancelled on device.";
  if (msg.includes("not connected") || msg.includes("bridge")) return "Trezor Bridge not found — install Trezor Suite and try again.";
  if (msg.includes("Firmware")) return "Outdated firmware — update via Trezor Suite.";
  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
