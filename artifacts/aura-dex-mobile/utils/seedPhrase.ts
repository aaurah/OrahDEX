import * as ExpoCrypto from "expo-crypto";

const WORDLIST = [
  "abandon","ability","able","about","above","absent","absorb","abstract","absurd","abuse",
  "access","accident","account","accuse","achieve","acid","acoustic","acquire","across","act",
  "action","actor","actress","actual","adapt","add","addict","address","adjust","admit",
  "adult","advance","advice","aerobic","afford","afraid","again","age","agent","agree",
  "ahead","aim","air","airport","aisle","alarm","album","alcohol","alert","alien",
  "all","alley","allow","almost","alone","alpha","already","also","alter","always",
  "amateur","amazing","among","amount","amused","analyst","anchor","ancient","anger","angle",
  "angry","animal","ankle","announce","annual","answer","antenna","antique","anxiety","apart",
  "apple","approve","april","arch","arctic","arena","argue","arm","armed","armor",
  "army","around","arrange","arrest","arrive","arrow","art","artefact","artist","artwork",
  "aspect","assault","asset","assist","assume","asthma","athlete","atom","audit","august",
  "aunt","author","auto","autumn","average","avocado","avoid","awake","aware","away",
  "awesome","awful","awkward","axis","baby","balance","bamboo","banana","banner","barely",
  "bargain","barrel","base","basic","basket","battle","beach","beauty","because","become",
  "beef","begin","behave","behind","believe","below","belt","bench","benefit","best",
  "betray","better","between","beyond","bicycle","bid","bike","bind","biology","bird",
  "birth","bitter","black","blade","blame","blanket","blast","bleak","bless","blind",
  "blood","blossom","blouse","blue","blur","blush","board","boat","body","boil",
  "bomb","bone","book","boost","border","boring","borrow","boss","bottom","bounce",
  "box","boy","bracket","brain","brand","brave","bread","breeze","brick","bridge",
];

/**
 * Return a cryptographically-random integer in [0, max).
 * Uses expo-crypto.getRandomValues — backed by SecureRandom on Android
 * and Security.framework on iOS.  Never uses Math.random().
 */
function cryptoRandIndex(max: number): number {
  const bytes = new Uint8Array(4);
  ExpoCrypto.getRandomValues(bytes);
  const uint32 = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  return uint32 % max;
}

export function generateMnemonic(wordCount: 12 | 24 = 12): string[] {
  const words: string[] = [];
  const pool = [...WORDLIST];
  for (let i = 0; i < wordCount; i++) {
    const idx = cryptoRandIndex(pool.length);
    words.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return words;
}

/**
 * Derive a display address from a mnemonic for the given network.
 *
 * NOTE: This is a lightweight deterministic helper for the demo wallet
 * preview.  Production key derivation must use a full BIP-32/BIP-44 library
 * (e.g. @scure/bip32 + @scure/bip39).  The derivation here is intentionally
 * NOT a real HD-wallet derivation path and MUST NOT be used to control
 * on-chain funds.  We use SHA-256 of the mnemonic bytes as the seed so that
 * the mapping is at least cryptographically non-reversible.
 */
export async function deriveAddress(mnemonic: string[], network: "evm" | "bsv"): Promise<string> {
  const input = mnemonic.join(" ");
  const hash = await ExpoCrypto.digestStringAsync(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    input,
    { encoding: ExpoCrypto.CryptoEncoding.HEX },
  );
  if (network === "evm") {
    return "0x" + hash.slice(0, 40);
  }
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = Uint8Array.from({ length: 33 }, (_, i) => parseInt(hash.slice(i * 2, i * 2 + 2), 16));
  return "1" + Array.from(bytes, b => chars[b % chars.length]).join("");
}

export function validateMnemonic(input: string): { valid: boolean; words: string[]; error?: string } {
  const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length !== 12 && words.length !== 24) {
    return { valid: false, words, error: `Enter 12 or 24 words (you entered ${words.length})` };
  }
  const invalid = words.filter((w) => !WORDLIST.includes(w));
  if (invalid.length > 0) {
    return { valid: false, words, error: `Unknown word${invalid.length > 1 ? "s" : ""}: ${invalid.slice(0, 3).join(", ")}` };
  }
  return { valid: true, words };
}
