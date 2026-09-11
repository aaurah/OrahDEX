/**
 * orahSigner.ts — Unified OrahDEX hardware-grade signing interface
 *
 * Core principle (document Rule 1–5):
 *   • Keys never leave their secure container
 *   • OrahDEX builds transactions; wallets ONLY sign
 *   • One signing API across all chains and devices
 *   • Watch-only mode for cold-wallet behavior
 *   • Ledger / Trezor / GridPlus are first-class signers
 *
 * Usage:
 *   const signer = getSignerForAddress(address);
 *   const { signature } = await signer.sign({ ... });
 */

// ── Core types ───────────────────────────────────────────────────────────────

export type OrahChainType  = 'EVM' | 'BSV';
export type OrahSignerKind = 'software' | 'ledger' | 'trezor' | 'gridplus' | 'keystone' | 'walletconnect' | 'watch-only';
export type OrahAction     = 'SEND' | 'SWAP' | 'LP_ADD' | 'LP_REMOVE' | 'BRIDGE' | 'STAKE' | 'APPROVE' | 'TYPED_DATA' | 'PERSONAL_SIGN';

/** Shared EVM tx parameters — passed to every signer adapter */
export interface EvmTxParams {
  chainId:              number;
  to:                   `0x${string}`;
  value?:               bigint;
  data?:                `0x${string}`;
  nonce?:               number;
  gasLimit?:            bigint;
  maxFeePerGas?:        bigint;
  maxPriorityFeePerGas?:bigint;
  gasPrice?:            bigint;
}

/** EIP-712 typed data structure */
export interface TypedDataPayload {
  domain:      Record<string, unknown>;
  types:       Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message:     Record<string, unknown>;
}

/**
 * Signing request sent from OrahDEX to any signer.
 * Hardware wallets render display.lines on their screen.
 */
export interface OrahSignRequest {
  chainType: OrahChainType;
  action:    OrahAction;

  /* EVM fields (mutually exclusive groups — use the one that matches action) */
  evmTx?:      EvmTxParams;       // for SEND / APPROVE / raw contract calls
  typedData?:  TypedDataPayload;  // for SWAP / LP / BRIDGE / STAKE intent signing
  message?:    string;            // for PERSONAL_SIGN

  /* BSV fields */
  bsvParams?: {
    senderAddress:    string;
    recipientAddress: string;
    amountSat:        number;
  };

  /** What the user sees on hardware wallet screen / PIN confirm dialog */
  display: {
    title: string;
    lines: string[];
  };
}

/** Signing response — caller is responsible for broadcasting signedTx if present */
export interface OrahSignResponse {
  signature?: `0x${string}`;  // EIP-712 / personal sign
  signedTx?:  string;         // raw signed tx hex — broadcast via publicClient.sendRawTransaction
  txHash?:    string;         // set when the signer broadcasts (WalletConnect)
  bsvTxid?:   string;         // BSV txid after broadcast
}

/** The unified signer interface — implemented by every wallet type */
export interface OrahSigner {
  id:      string;            // "software:0xABCD", "ledger:0xABCD", etc.
  label:   string;
  kind:    OrahSignerKind;
  address: string;
  path?:   string;            // BIP-32 derivation path (hardware wallets)
  sign(request: OrahSignRequest): Promise<OrahSignResponse>;
}

// ── Global registry ──────────────────────────────────────────────────────────

const _registry = new Map<string, OrahSigner>();

export function registerSigner(signer: OrahSigner): void {
  _registry.set(signer.id, signer);
}

export function unregisterSigner(id: string): void {
  _registry.delete(id);
}

export function getSigner(id: string): OrahSigner | undefined {
  return _registry.get(id);
}

export function listSigners(): OrahSigner[] {
  return [..._registry.values()];
}

/**
 * Resolve the best available signer for an EVM/BSV address.
 * Hardware wallets are preferred; watch-only is last resort.
 */
export function getSignerForAddress(address: string): OrahSigner | null {
  const lower = address.toLowerCase();
  const matches = listSigners().filter(s => s.address.toLowerCase() === lower);
  if (!matches.length) return null;
  const priority: OrahSignerKind[] = [
    'ledger', 'trezor', 'gridplus', 'keystone',
    'software', 'walletconnect', 'watch-only',
  ];
  return matches.sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind))[0] ?? null;
}

// ── EIP-712 domain builder (shared by all adapters) ──────────────────────────

export function buildEip712Domain(domain: Record<string, unknown>): {
  name?: string; version?: string; chainId?: number; verifyingContract?: string;
} {
  return {
    ...(domain.name             ? { name:              String(domain.name)                      } : {}),
    ...(domain.version          ? { version:           String(domain.version)                   } : {}),
    ...(domain.chainId          ? { chainId:           Number(domain.chainId)                   } : {}),
    ...(domain.verifyingContract ? { verifyingContract: String(domain.verifyingContract)         } : {}),
  };
}

/** Build the EIP712Domain field entries from a domain object */
export function eip712DomainFields(domain: Record<string, unknown>): { name: string; type: string }[] {
  const fields: { name: string; type: string }[] = [];
  if (domain.name)              fields.push({ name: 'name',              type: 'string'  });
  if (domain.version)           fields.push({ name: 'version',           type: 'string'  });
  if (domain.chainId)           fields.push({ name: 'chainId',           type: 'uint256' });
  if (domain.verifyingContract) fields.push({ name: 'verifyingContract', type: 'address' });
  return fields;
}

// ── Helper: assemble r/s/v into a hex signature ───────────────────────────────

export function assembleSignature(sig: { v: number | string; r: string; s: string }): `0x${string}` {
  const v = typeof sig.v === 'number'
    ? sig.v.toString(16).padStart(2, '0')
    : parseInt(sig.v, 16).toString(16).padStart(2, '0');
  const r = sig.r.replace(/^0x/, '').padStart(64, '0');
  const s = sig.s.replace(/^0x/, '').padStart(64, '0');
  return `0x${r}${s}${v}`;
}

// ── 1. Software signer adapter (passkey + PIN) ────────────────────────────────

export function createSoftwareSigner(address: string, label = 'OrahDEX Wallet'): OrahSigner {
  return {
    id:      `software:${address.toLowerCase()}`,
    label,
    kind:    'software',
    address,

    async sign(req: OrahSignRequest): Promise<OrahSignResponse> {
      if (req.chainType === 'BSV') {
        return _softwareBsvSign(req);
      }

      const { getViemAccountForAddress } = await import('./walletSigner');
      const account = await getViemAccountForAddress(address, {
        title:    req.display.title,
        subtitle: req.display.lines[0] ?? '',
      });

      // EIP-712 typed data
      if (req.typedData) {
        const { createWalletClient, http } = await import('viem');
        const { mainnet } = await import('viem/chains');
        const client = createWalletClient({ account, chain: mainnet, transport: http() });
        const sig = await client.signTypedData({
          account,
          domain:      req.typedData.domain as any,
          types:       req.typedData.types as any,
          primaryType: req.typedData.primaryType as any,
          message:     req.typedData.message as any,
        });
        return { signature: sig };
      }

      // Personal sign
      if (req.message) {
        const { createWalletClient, http } = await import('viem');
        const { mainnet } = await import('viem/chains');
        const client = createWalletClient({ account, chain: mainnet, transport: http() });
        const sig = await client.signMessage({ account, message: req.message });
        return { signature: sig };
      }

      // Raw EVM transaction
      if (req.evmTx) {
        const tx = req.evmTx;
        const signed = await account.signTransaction!({
          chainId:              tx.chainId,
          to:                   tx.to,
          value:                tx.value ?? 0n,
          data:                 tx.data ?? '0x',
          nonce:                tx.nonce ?? 0,
          gas:                  tx.gasLimit ?? 200_000n,
          ...(tx.maxFeePerGas !== undefined
            ? { type: 'eip1559' as const, maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? 1_000_000_000n }
            : { type: 'legacy' as const, gasPrice: tx.gasPrice ?? 50_000_000_000n }),
        });
        return { signedTx: signed };
      }

      throw new Error('OrahSigner (software): request has no signable payload');
    },
  };
}

async function _softwareBsvSign(req: OrahSignRequest): Promise<OrahSignResponse> {
  if (!req.bsvParams) throw new Error('BSV signing requires bsvParams');
  const { buildSignBroadcastBsvTx, hexToBytes } = await import('./bsvTx');
  const { getImportedWallet, unlockWithPin, unlockWithPasskey } = await import('./walletPin');
  const { usePinPromptStore } = await import('@/store/usePinPromptStore');

  const rec = getImportedWallet(req.bsvParams.senderAddress);
  if (!rec) throw new Error('BSV signing: no imported wallet found for ' + req.bsvParams.senderAddress);

  let secret: string;
  if (rec.protectedBy === 'pin') {
    secret = await usePinPromptStore.getState().prompt<string>({
      address:  rec.address,
      title:    req.display.title,
      subtitle: req.display.lines[0] ?? 'Unlock to send BSV',
      verify:   (pin) => unlockWithPin(rec.address, pin),
    });
  } else {
    secret = await unlockWithPasskey(rec.address);
  }

  let privateKey: Uint8Array;
  if (secret.startsWith('0x')) {
    privateKey = hexToBytes(secret.slice(2));
  } else {
    const { HDKey }              = await import('@scure/bip32');
    const { mnemonicToSeedSync } = await import('@scure/bip39');
    const seed    = mnemonicToSeedSync(secret.trim());
    const root    = HDKey.fromMasterSeed(seed);
    const derived = root.derive("m/44'/236'/0'/0/0");
    if (!derived.privateKey) throw new Error('BSV key derivation failed');
    privateKey = derived.privateKey;
  }

  const result = await buildSignBroadcastBsvTx(
    req.bsvParams.senderAddress,
    req.bsvParams.recipientAddress,
    req.bsvParams.amountSat,
    privateKey,
  );
  return { bsvTxid: result.txid, signedTx: result.txHex };
}

// ── 2. Ledger adapter ─────────────────────────────────────────────────────────

export function createLedgerSigner(
  address: string,
  path:    string,
  eth:     import('@ledgerhq/hw-app-eth').default,
  label =  'Ledger',
): OrahSigner {
  return {
    id:      `ledger:${address.toLowerCase()}`,
    label,
    kind:    'ledger',
    address,
    path,

    async sign(req: OrahSignRequest): Promise<OrahSignResponse> {
      const hw = await import('./ledgerHardware');

      if (req.typedData) {
        const sig = await hw.ledgerSignTypedData(eth, path, req.typedData);
        return { signature: sig };
      }

      if (req.message) {
        const sig = await hw.ledgerSignMessage(eth, path, req.message);
        return { signature: sig as `0x${string}` };
      }

      if (req.evmTx) {
        const signedTx = await hw.ledgerSignTransaction(eth, path, req.evmTx);
        return { signedTx };
      }

      throw new Error('Ledger signer: request has no signable payload');
    },
  };
}

// ── 2b. Ledger DMK adapter (Device Management Kit — current official SDK) ─────
/**
 * Creates an OrahSigner backed by the new Ledger Device Management Kit.
 * Preferred over createLedgerSigner for all new integrations.
 *
 * The DMK provides:
 *   - Native Clear Signing (human-readable tx fields on device screen)
 *   - Observable-based DeviceAction API
 *   - EIP-712 normalization bug fixes (May 2026)
 *   - Forward-compatible with Ledger Stax, Flex, and future devices
 *
 * @param address   — EVM address derived from the device
 * @param path      — BIP-32 derivation path (e.g. "m/44'/60'/0'/0/0")
 * @param sessionId — DMKSession.sessionId from dmkConnect()
 * @param label     — display name (default: "Ledger")
 * @param originToken — optional Ledger partner program token for full Clear Signing
 */
export function createLedgerDMKSigner(
  address:      string,
  path:         string,
  sessionId:    string,
  label =       'Ledger',
  originToken?: string,
): OrahSigner {
  return {
    id:      `ledger:${address.toLowerCase()}`,
    label,
    kind:    'ledger',
    address,
    path,

    async sign(req: OrahSignRequest): Promise<OrahSignResponse> {
      const dmk = await import('./ledgerDMK');

      if (req.typedData) {
        const sig = await dmk.dmkSignTypedData(sessionId, path, req.typedData, originToken);
        return { signature: sig };
      }

      if (req.message) {
        const sig = await dmk.dmkSignMessage(sessionId, path, req.message);
        return { signature: sig };
      }

      if (req.evmTx) {
        const signedTx = await dmk.dmkSignTransaction(sessionId, path, req.evmTx, originToken);
        return { signedTx };
      }

      throw new Error('Ledger DMK signer: request has no signable payload');
    },
  };
}

// ── 3. Trezor adapter ─────────────────────────────────────────────────────────

export function createTrezorSigner(address: string, path: string, label = 'Trezor'): OrahSigner {
  return {
    id:      `trezor:${address.toLowerCase()}`,
    label,
    kind:    'trezor',
    address,
    path,

    async sign(req: OrahSignRequest): Promise<OrahSignResponse> {
      const hw = await import('./trezorHardware');

      if (req.typedData) {
        const sig = await hw.trezorSignTypedData(path, req.typedData);
        return { signature: sig };
      }

      if (req.evmTx) {
        const signedTx = await hw.trezorSignTransaction(path, req.evmTx);
        return { signedTx };
      }

      if (req.message) {
        // Trezor personal sign — use ethereumSignMessage
        const sig = await hw.trezorSignMessage(path, req.message);
        return { signature: sig };
      }

      throw new Error('Trezor signer: request has no signable payload');
    },
  };
}

// ── 4. GridPlus adapter ───────────────────────────────────────────────────────

export function createGridPlusSigner(
  address: string,
  index:   number,
  label =  'GridPlus Lattice1',
): OrahSigner {
  return {
    id:      `gridplus:${address.toLowerCase()}`,
    label,
    kind:    'gridplus',
    address,
    path:    `m/44'/60'/0'/0/${index}`,

    async sign(req: OrahSignRequest): Promise<OrahSignResponse> {
      const hw = await import('./gridplusHardware');

      if (req.typedData) {
        const sig = await hw.gridPlusSignTypedData(index, req.typedData);
        return { signature: sig };
      }

      if (req.evmTx) {
        const signedTx = await hw.gridPlusSignTransaction(index, req.evmTx);
        return { signedTx };
      }

      throw new Error('GridPlus signer: request has no signable payload');
    },
  };
}

// ── 5. WalletConnect adapter (imToken, Rainbow, MetaMask Mobile, etc.) ────────

export function createWalletConnectSigner(address: string, label = 'WalletConnect'): OrahSigner {
  return {
    id:      `wc:${address.toLowerCase()}`,
    label,
    kind:    'walletconnect',
    address,

    async sign(req: OrahSignRequest): Promise<OrahSignResponse> {
      // WalletConnect signing delegates to the connected mobile wallet via Reown/wagmi.
      // The wagmi hooks (useSignTypedData, useSignMessage, useSendTransaction) are
      // the correct integration point — they handle the WC session internally.
      // This adapter is a stub that surfaces a clear error when called outside those hooks.
      throw new Error(
        'WC_USE_WAGMI: WalletConnect signing must be triggered through the wagmi hooks ' +
        '(useSignTypedData / useSendTransaction). Use the swap / trade UI which calls them directly.',
      );
    },
  };
}

// ── 6. Watch-only adapter (read-only — no signing) ────────────────────────────

export function createWatchOnlySigner(address: string, label = 'Watch-only'): OrahSigner {
  return {
    id:      `watch:${address.toLowerCase()}`,
    label:   `${label} (read-only)`,
    kind:    'watch-only',
    address,

    async sign(_req: OrahSignRequest): Promise<OrahSignResponse> {
      throw new Error(
        `WATCH_ONLY: "${label}" is a read-only address. ` +
        'Connect a hardware wallet, passkey, or import your seed phrase to sign transactions.',
      );
    },
  };
}

// ── Convenience: build a sign request for common DEX actions ─────────────────

export function makeSwapSignRequest(params: {
  tokenInSymbol:  string;
  tokenOutSymbol: string;
  amountIn:       string;
  minAmountOut:   string;
  route:          string[];
  typedData:      TypedDataPayload;
}): OrahSignRequest {
  const routeStr = params.route.join(' → ');
  return {
    chainType:  'EVM',
    action:     'SWAP',
    typedData:  params.typedData,
    display: {
      title: 'Confirm Swap',
      lines: [
        `Swap ${params.amountIn} ${params.tokenInSymbol}`,
        `for min. ${params.minAmountOut} ${params.tokenOutSymbol}`,
        `Route: ${routeStr}`,
      ],
    },
  };
}

export function makeBridgeSignRequest(params: {
  symbol:     string;
  amount:     string;
  fromChain:  string;
  toChain:    string;
  protocol:   string;
  typedData:  TypedDataPayload;
}): OrahSignRequest {
  return {
    chainType: 'EVM',
    action:    'BRIDGE',
    typedData: params.typedData,
    display: {
      title: 'Confirm Bridge',
      lines: [
        `Bridge ${params.amount} ${params.symbol}`,
        `${params.fromChain} → ${params.toChain}`,
        `via ${params.protocol}`,
      ],
    },
  };
}

export function makeSendSignRequest(params: {
  symbol:  string;
  amount:  string;
  to:      string;
  evmTx:   EvmTxParams;
}): OrahSignRequest {
  return {
    chainType: 'EVM',
    action:    'SEND',
    evmTx:     params.evmTx,
    display: {
      title: 'Confirm Send',
      lines: [
        `Send ${params.amount} ${params.symbol}`,
        `To: ${params.to.slice(0, 8)}…${params.to.slice(-6)}`,
      ],
    },
  };
}

export function makeBsvSendSignRequest(params: {
  amountSat:        number;
  senderAddress:    string;
  recipientAddress: string;
}): OrahSignRequest {
  const bsv = (params.amountSat / 1e8).toFixed(8);
  return {
    chainType:  'BSV',
    action:     'SEND',
    bsvParams:  { senderAddress: params.senderAddress, recipientAddress: params.recipientAddress, amountSat: params.amountSat },
    display: {
      title: 'Confirm BSV Send',
      lines: [
        `Send ${bsv} BSV`,
        `To: ${params.recipientAddress.slice(0, 8)}…${params.recipientAddress.slice(-6)}`,
      ],
    },
  };
}
