/**
 * GridPlus Lattice1 hardware wallet integration.
 *
 * Connection flow:
 *  1. User enters their Lattice1 device ID (shown on device under Settings > Device ID).
 *  2. SDK connects to the GridPlus relay server and routes to the device.
 *  3. On first connection the device shows a 6-digit pairing code.
 *  4. User enters the pairing code in the app — establishes a long-lived pair.
 *  5. After pairing, addresses are fetched and signing is available.
 */

import type { EvmTxParams, TypedDataPayload } from "./orahSigner";

export interface GridPlusAccount {
  address: string;
  index:   number;
}

export type GridPlusStatus =
  | "idle"
  | "connecting"
  | "pairing"
  | "fetching"
  | "ready"
  | "error";

let _client: any = null;

async function getClient(name = "OrahDEX") {
  if (_client) return _client;
  const { Client } = await import("gridplus-sdk");
  _client = new Client({ name });
  return _client;
}

export function clearGridPlusClient() {
  _client = null;
}

// ── BIP-32 path as integer array for the GridPlus SDK ────────────────────────

function bip44EvmPath(index: number): number[] {
  return [
    0x80000000 + 44,  // purpose: 44'
    0x80000000 + 60,  // coin: 60' (ETH)
    0x80000000 + 0,   // account: 0'
    0,                // change: 0
    index,            // address index
  ];
}

// ── Connection ────────────────────────────────────────────────────────────────

/**
 * Step 1: connect to the device.
 * @returns true if already paired (skip pairing step), false if pairing required.
 */
export async function gridPlusConnect(deviceId: string): Promise<boolean> {
  const client   = await getClient();
  const isPaired = await client.connect(deviceId.trim());
  return !!isPaired;
}

/**
 * Step 2 (only if not paired): submit the pairing code shown on the device.
 */
export async function gridPlusPair(pairingCode: string): Promise<void> {
  const client = await getClient();
  await client.pair(pairingCode.trim());
}

/**
 * Step 3: fetch EVM accounts from the paired device.
 */
export async function gridPlusGetAccounts(count = 5): Promise<GridPlusAccount[]> {
  const client = await getClient();

  const addresses: string[] = await client.getAddresses({
    startPath: bip44EvmPath(0),
    n:         count,
    flag:      0,
  });

  return addresses.map((address: string, index: number) => ({ address, index }));
}

// ── EIP-712 typed data signing ────────────────────────────────────────────────
/**
 * Sign EIP-712 typed data.
 * The Lattice1 shows the human-readable fields on its secure display.
 */
export async function gridPlusSignTypedData(
  accountIndex: number,
  payload:      TypedDataPayload,
): Promise<`0x${string}`> {
  const client = await getClient();

  const domainFields: { name: string; type: string }[] = [];
  if (payload.domain.name)              domainFields.push({ name: "name",              type: "string"  });
  if (payload.domain.version)           domainFields.push({ name: "version",           type: "string"  });
  if (payload.domain.chainId)           domainFields.push({ name: "chainId",           type: "uint256" });
  if (payload.domain.verifyingContract) domainFields.push({ name: "verifyingContract", type: "address" });

  const result = await client.sign({
    data: {
      type:        "eip712",
      primaryType: payload.primaryType,
      types: {
        EIP712Domain: domainFields,
        ...payload.types,
      },
      domain:  payload.domain,
      message: payload.message,
    },
    wallet: { path: bip44EvmPath(accountIndex) },
  });

  if (!result?.sig) throw new Error("GridPlus: no signature returned");

  const r = Buffer.from(result.sig.r).toString("hex").padStart(64, "0");
  const s = Buffer.from(result.sig.s).toString("hex").padStart(64, "0");
  const v = result.sig.v.toString(16).padStart(2, "0");
  return `0x${r}${s}${v}`;
}

// ── EVM transaction signing ───────────────────────────────────────────────────
/**
 * Sign an EVM transaction.
 * Returns the signed raw transaction hex (ready to broadcast via sendRawTransaction).
 */
export async function gridPlusSignTransaction(
  accountIndex: number,
  tx:           EvmTxParams,
): Promise<string> {
  const client    = await getClient();
  const isEip1559 = tx.maxFeePerGas !== undefined;

  const txPayload: Record<string, unknown> = {
    // GridPlus SDK expects type 1 = legacy, 2 = EIP-1559
    type:     isEip1559 ? 2 : 1,
    chainId:  tx.chainId,
    to:       tx.to,
    value:    `0x${(tx.value ?? 0n).toString(16)}`,
    data:     tx.data ?? "0x",
    nonce:    tx.nonce ?? 0,
    gasLimit: `0x${(tx.gasLimit ?? 200_000n).toString(16)}`,
  };

  if (isEip1559) {
    txPayload.maxFeePerGas         = `0x${tx.maxFeePerGas!.toString(16)}`;
    txPayload.maxPriorityFeePerGas = `0x${(tx.maxPriorityFeePerGas ?? 1_000_000_000n).toString(16)}`;
  } else {
    txPayload.gasPrice = `0x${(tx.gasPrice ?? 50_000_000_000n).toString(16)}`;
  }

  const result = await client.sign({
    data:   txPayload,
    wallet: { path: bip44EvmPath(accountIndex) },
  });

  if (!result?.sig) throw new Error("GridPlus: no signature returned");

  const { serializeTransaction } = await import("viem");
  const r = `0x${Buffer.from(result.sig.r).toString("hex").padStart(64, "0")}` as `0x${string}`;
  const s = `0x${Buffer.from(result.sig.s).toString("hex").padStart(64, "0")}` as `0x${string}`;
  const v = BigInt(result.sig.v);

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
      { r, s, yParity: v % 2n === 0n ? 0 : 1 },
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
      { r, s, v },
    );
  }
}

// ── Error normalisation ───────────────────────────────────────────────────────

export function gridPlusErrMsg(err: unknown): string {
  if (!err) return "Unknown error";
  const msg = String((err as any)?.message ?? err);
  if (msg.includes("deviceId"))                              return "Invalid Device ID — check Settings > Device ID on your Lattice1.";
  if (msg.includes("pairing") || msg.includes("pair"))      return "Pairing failed — check the code shown on your device.";
  if (msg.includes("timeout") || msg.includes("ECONNREFUSED")) return "Device not responding — ensure it is online and connected.";
  if (msg.includes("cancelled"))                             return "Action cancelled on device.";
  return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
}
