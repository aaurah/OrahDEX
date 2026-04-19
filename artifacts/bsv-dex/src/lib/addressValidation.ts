/**
 * addressValidation.ts
 *
 * Per-network address format validators for 25+ blockchain networks.
 * Returns true if the address matches the expected pattern for the given network.
 * Uses a permissive fallback for unknown networks (length > 5, no spaces).
 */

export function validateAltChainAddress(net: string, addr: string): boolean {
  const n = net.toLowerCase();
  const a = addr.trim();
  if (!a || a.length < 4) return false;

  if (n === "xrp")                                                    return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a);
  if (n === "tron" || n === "trx")                                    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
  if (n === "ltc")                                                    return /^[LMltc][a-km-zA-HJ-NP-Z1-9]{25,40}$|^ltc1[a-z0-9]{39,87}$/.test(a);
  if (n === "doge")                                                   return /^D[5-9A-HJ-NP-Za-km-z]{33}$/.test(a);
  if (n === "dash")                                                   return /^X[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
  if (n === "zec")                                                    return /^t[13][a-km-zA-HJ-NP-Z1-9]{33}$|^zs[a-z0-9]{76}$/.test(a);
  if (n === "xmr")                                                    return /^4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}$/.test(a);
  if (n === "xlm")                                                    return /^G[A-Z2-7]{55}$/.test(a);
  if (n === "ton")                                                    return /^(EQ|UQ)[a-zA-Z0-9_-]{46}$|^0:[0-9a-fA-F]{64}$/.test(a);
  if (n === "hbar")                                                   return /^\d+\.\d+\.\d+$/.test(a);
  if (n === "eos")                                                    return /^[a-z1-5.]{1,12}$/.test(a);
  if (n === "near")                                                   return /^[a-zA-Z0-9_-]{2,64}(\.near)?$/.test(a) || /^[0-9a-fA-F]{64}$/.test(a);
  if (n === "ada")                                                    return /^addr1[a-z0-9]{98}$|^stake1[a-z0-9]{53}$|^[A-Z][a-zA-Z0-9]{58,103}$/.test(a);
  if (n === "algo")                                                   return /^[A-Z2-7]{58}$/.test(a);
  if (n === "dot" || n === "ksm")                                     return /^[1-9A-HJ-NP-Za-km-z]{46,50}$/.test(a);
  if (n === "fil")                                                    return /^[ft][0-9][a-zA-Z0-9]{38,}$/.test(a);
  if (n === "kas")                                                    return /^kaspa:[a-z0-9]+$/.test(a);
  if (n === "stx")                                                    return /^S[MPT][A-Z0-9]{39}$/.test(a);
  if (n === "vet")                                                    return /^0x[0-9a-fA-F]{40}$/.test(a);
  if (n === "sui" || n === "apt")                                     return /^0x[0-9a-fA-F]{1,64}$/.test(a);
  if (n === "egld")                                                   return /^erd1[a-z0-9]{58}$/.test(a);
  if (n === "icp")                                                    return a.length >= 5 && a.length <= 64;
  if (["cosmos","atom","osmo","inj","sei","tia","dydx","rune","rune_n"].includes(n))
    return /^[a-z]{1,20}1[a-z0-9]{38,45}$/.test(a);
  if (n === "btc")                                                    return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(a);
  if (n === "bch")                                                    return /^(bitcoincash:)?(q|p)[a-z0-9]{41}$|^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a);
  // Permissive fallback
  return a.length >= 5 && !/\s/.test(a);
}
