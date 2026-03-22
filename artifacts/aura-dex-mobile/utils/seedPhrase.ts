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

export function generateMnemonic(wordCount: 12 | 24 = 12): string[] {
  const words: string[] = [];
  const pool = [...WORDLIST];
  for (let i = 0; i < wordCount; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    words.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return words;
}

export function deriveAddress(mnemonic: string[], network: "evm" | "bsv"): string {
  const seed = mnemonic.join("").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = (max: number) => {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return Math.abs(s) % max;
    };
  };
  if (network === "evm") {
    const r = rng(16);
    const hex = "0123456789abcdef";
    return "0x" + Array.from({ length: 40 }, () => hex[r()]).join("");
  }
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const r = rng(chars.length);
  return "1" + Array.from({ length: 33 }, () => chars[r()]).join("");
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
