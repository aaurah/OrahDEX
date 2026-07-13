---
name: TRON BIP44 derivation path
description: OrahDEX TRON address must use m/44'/195'/0'/0/0, not EVM key conversion — matches MetaMask snap, Trust Wallet, Ledger
---

## Rule
Always derive TRON addresses at m/44'/195'/0'/0/0 (BIP44 coin type 195), NOT by converting the EVM address via `evmToTronAddress(evm)`.

## Why
The old code used `evmToTronAddress(evm)` which takes the EVM key at m/44'/60'/0'/0/0 and re-encodes it with TRON's 0x41 prefix. This gives a valid TRON address for that key, but it is a DIFFERENT private key than what MetaMask TRON snap, Trust Wallet, Ledger, and all standard BIP44 wallets use for TRON. Users saw two different TRON addresses — one in MetaMask, one in OrahDEX.

## How to apply
In `seedPhrase.ts` → `deriveAllAddresses()`:
```typescript
const tronKey = root.derive("m/44'/195'/0'/0/0");
const tron = deriveTronAddressFromHdKey(tronKey);
```

`deriveTronAddressFromHdKey()` does:
1. Decompress the 33-byte secp256k1 pubkey → 65-byte uncompressed (via `secp256k1.ProjectivePoint.fromHex().toRawBytes(false)`)
2. `keccak_256(uncompressed.slice(1))` — skip the 0x04 prefix byte, hash 64 bytes
3. Last 20 bytes → hex → `evmToTronAddress(hex)` for TRON Base58Check encoding

**Note**: This is a breaking address change for any existing user whose internalTronAddress was stored with the old derivation. The old address is still recoverable using the EVM private key in any TRON wallet.
