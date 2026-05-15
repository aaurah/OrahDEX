/**
 * GridPlus Lattice1 hardware wallet integration.
 *
 * Connection flow:
 *  1. User enters their Lattice1 device ID (shown on device under Settings > Device ID).
 *  2. SDK connects to the GridPlus relay server and routes to the device.
 *  3. On first connection the device shows a 6-digit pairing code.
 *  4. User enters the pairing code in the app — establishes a long-lived pair.
 *  5. After pairing, addresses are fetched from the device.
 */

export interface GridPlusAccount {
  address: string;
  index: number;
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

/**
 * Step 1: connect to the device.
 * @returns true if already paired (skip pairing step), false if pairing required.
 */
export async function gridPlusConnect(deviceId: string): Promise<boolean> {
  const client = await getClient();
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

  // BIP44 path: m/44'/60'/0'/0/i
  const startPath = [
    0x80000000 + 44,
    0x80000000 + 60,
    0x80000000 + 0,
    0,
    0,
  ];

  const addresses: string[] = await client.getAddresses({
    startPath,
    n: count,
    flag: 0,
  });

  return addresses.map((address: string, index: number) => ({ address, index }));
}

export function gridPlusErrMsg(err: unknown): string {
  if (!err) return "Unknown error";
  const msg: string = (err as any)?.message ?? String(err);
  if (msg.includes("deviceId")) return "Invalid Device ID — check Settings > Device ID on your Lattice1.";
  if (msg.includes("pairing") || msg.includes("pair")) return "Pairing failed — check the code shown on your device.";
  if (msg.includes("timeout") || msg.includes("ECONNREFUSED")) return "Device not responding — ensure it is online and connected.";
  if (msg.includes("cancelled")) return "Action cancelled on device.";
  return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
}
