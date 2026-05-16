/**
 * Trezor hardware wallet integration via TrezorConnect web popup.
 * TrezorConnect is loaded dynamically to keep the initial bundle small.
 */

import type { EvmTxParams, TypedDataPayload } from "./orahSigner";

export interface TrezorAccount {
  path:    string;
  address: string;
  label:   string;
}

export function isTrezorSupported(): boolean {
  return typeof window !== "undefined";
}

async function getTrezorConnect() {
  const mod          = await import("@trezor/connect-web");
  const TrezorConnect = mod.default;
  try {
    await TrezorConnect.init({
      manifest: {
        appName: "OrahDEX",
        email:   "support@orahdex.org",
        appUrl:  "https://orahdex.org",
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

// ── Address derivation ────────────────────────────────────────────────────────

export async function getTrezorAccounts(): Promise<TrezorAccount[]> {
  const TrezorConnect = await getTrezorConnect();

  const results = await Promise.allSettled(
    TREZOR_PATHS.map(async ({ path, label }) => {
      const result = await TrezorConnect.ethereumGetAddress({ path, showOnTrezor: false } as any);
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

export async function getTrezorSingleAddress(
  path          = "m/44'/60'/0'/0/0",
  showOnTrezor  = true,
): Promise<string> {
  const TrezorConnect = await getTrezorConnect();
  const result = await TrezorConnect.ethereumGetAddress({ path, showOnTrezor } as any);
  if (!result.success) throw new Error((result as any).payload?.error ?? "Trezor error");
  return (result as any).payload.address as string;
}

// ── EIP-712 typed data signing ────────────────────────────────────────────────
/**
 * Sign EIP-712 typed data.
 * Trezor shows each field on its screen — full human-readable clear sign.
 */
export async function trezorSignTypedData(
  path:    string,
  payload: TypedDataPayload,
): Promise<`0x${string}`> {
  const TrezorConnect = await getTrezorConnect();

  const domainFields: { name: string; type: string }[] = [];
  if (payload.domain.name)              domainFields.push({ name: "name",              type: "string"  });
  if (payload.domain.version)           domainFields.push({ name: "version",           type: "string"  });
  if (payload.domain.chainId)           domainFields.push({ name: "chainId",           type: "uint256" });
  if (payload.domain.verifyingContract) domainFields.push({ name: "verifyingContract", type: "address" });

  const result = await TrezorConnect.ethereumSignTypedData({
    path,
    data: {
      types:       { EIP712Domain: domainFields, ...payload.types },
      primaryType: payload.primaryType,
      domain:      payload.domain,
      message:     payload.message,
    },
    metamask_v4_compat: true,
  } as any);

  if (!result.success) {
    throw new Error((result as any).payload?.error ?? "Trezor EIP-712 signing failed");
  }

  const sig = (result as any).payload.signature as string;
  // Trezor returns the full 0x-prefixed signature
  return (sig.startsWith("0x") ? sig : `0x${sig}`) as `0x${string}`;
}

// ── Personal sign ─────────────────────────────────────────────────────────────

export async function trezorSignMessage(path: string, message: string): Promise<`0x${string}`> {
  const TrezorConnect = await getTrezorConnect();

  const result = await TrezorConnect.ethereumSignMessage({
    path,
    message,
    hex: false,
  } as any);

  if (!result.success) {
    throw new Error((result as any).payload?.error ?? "Trezor sign message failed");
  }

  const sig = (result as any).payload.signature as string;
  return (sig.startsWith("0x") ? sig : `0x${sig}`) as `0x${string}`;
}

// ── EVM transaction signing ───────────────────────────────────────────────────
/**
 * Sign an EVM transaction.
 * Returns the signed raw transaction hex (ready to broadcast via sendRawTransaction).
 */
export async function trezorSignTransaction(path: string, tx: EvmTxParams): Promise<string> {
  const TrezorConnect = await getTrezorConnect();

  const isEip1559 = tx.maxFeePerGas !== undefined;

  const txData: Record<string, unknown> = {
    to:       tx.to,
    value:    `0x${(tx.value ?? 0n).toString(16)}`,
    data:     tx.data ?? "0x",
    nonce:    `0x${(tx.nonce ?? 0).toString(16)}`,
    gasLimit: `0x${(tx.gasLimit ?? 200_000n).toString(16)}`,
    chainId:  tx.chainId,
  };

  if (isEip1559) {
    txData.maxFeePerGas         = `0x${tx.maxFeePerGas!.toString(16)}`;
    txData.maxPriorityFeePerGas = `0x${(tx.maxPriorityFeePerGas ?? 1_000_000_000n).toString(16)}`;
  } else {
    txData.gasPrice = `0x${(tx.gasPrice ?? 50_000_000_000n).toString(16)}`;
  }

  const result = await TrezorConnect.ethereumSignTransaction({ path, transaction: txData } as any);
  if (!result.success) {
    throw new Error((result as any).payload?.error ?? "Trezor transaction signing failed");
  }

  const { r, s, v } = (result as any).payload as { r: string; s: string; v: string };

  // Reconstruct the signed transaction using viem
  const { serializeTransaction } = await import("viem");
  const rHex = `0x${r.replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;
  const sHex = `0x${s.replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;
  const vInt = parseInt(v, 16);

  if (isEip1559) {
    return serializeTransaction(
      {
        type:                 "eip1559",
        chainId:              tx.chainId,
        to:                   tx.to,
        value:                tx.value ?? 0n,
        data:                 tx.data ?? "0x",
        nonce:                tx.nonce ?? 0,
        gas:                  tx.gasLimit ?? 200_000n,
        maxFeePerGas:         tx.maxFeePerGas!,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? 1_000_000_000n,
      },
      { r: rHex, s: sHex, yParity: vInt % 2 === 0 ? 0 : 1 },
    );
  } else {
    return serializeTransaction(
      {
        type:     "legacy",
        chainId:  tx.chainId,
        to:       tx.to,
        value:    tx.value ?? 0n,
        data:     tx.data ?? "0x",
        nonce:    tx.nonce ?? 0,
        gas:      tx.gasLimit ?? 200_000n,
        gasPrice: tx.gasPrice ?? 50_000_000_000n,
      },
      { r: rHex, s: sHex, v: BigInt(vInt) },
    );
  }
}

// ── Error normalisation ───────────────────────────────────────────────────────

export function trezorErrMsg(err: unknown): string {
  if (!err) return "Unknown error";
  const msg = String((err as any)?.message ?? err);
  if (msg.includes("Popup closed"))       return "Trezor popup was closed. Try again.";
  if (msg.includes("Cancelled"))          return "Cancelled on device.";
  if (msg.includes("not connected") || msg.includes("bridge"))
    return "Trezor Bridge not found — install Trezor Suite and try again.";
  if (msg.includes("Firmware"))           return "Outdated firmware — update via Trezor Suite.";
  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
