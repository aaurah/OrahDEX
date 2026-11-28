export interface BsvWalletCipherRecord {
  evm_address: string;
  bsv_address: string;
  encrypted_key: string;
}

export interface BsvWalletVerificationResult {
  status: "verified" | "failed" | "empty";
  checked: number;
  verified: number;
  failed: number;
}

export interface BsvWalletCipherUpdate {
  evm_address: string;
  expected_ciphertext: string;
  encrypted_key: string;
}

export function encryptBsvWalletKey(plaintext: string, secret: string): string;
export function decryptBsvWalletKey(stored: string, secret: string): string;
export function bsvAddressFromPrivateKey(privateKeyHex: string): string;
export function privateKeyMatchesBsvAddress(privateKeyHex: string, address: string): boolean;
export function verifyBsvWalletRecords(
  rows: BsvWalletCipherRecord[],
  secrets: string[],
): BsvWalletVerificationResult;
export function prepareBsvWalletReencryption(
  rows: BsvWalletCipherRecord[],
  currentSecret: string,
  nextSecret: string,
): BsvWalletCipherUpdate[];
