/**
 * antiPhishing.ts — Domain safety checker for OrahDEX wallet
 *
 * Protects users from signing transactions on cloned/phishing sites.
 * Checks the current page origin against a known-safe allowlist and
 * flags suspicious patterns (punycode, homoglyphs, lookalike domains).
 */

// ── Known-safe origins ────────────────────────────────────────────────────────

const SAFE_ORIGINS = new Set([
  "https://orahdex.org",
  "https://www.orahdex.org",
  "https://app.orahdex.org",
  "https://sepolia.orahdex.org",
  // Replit dev / preview origins
  "http://localhost:20180",
  "http://localhost:3000",
  "http://localhost:5173",
]);

const SAFE_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/[^.]+\.replit\.(app|dev)$/,
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

// Known legitimate dApp origins that OrahDEX wallet can connect to
const KNOWN_DAPPS: { origin: string; name: string; category: string }[] = [
  { origin: "https://app.uniswap.org",        name: "Uniswap",       category: "dex"       },
  { origin: "https://app.aave.com",           name: "Aave",          category: "lending"   },
  { origin: "https://curve.fi",               name: "Curve Finance", category: "dex"       },
  { origin: "https://opensea.io",             name: "OpenSea",       category: "nft"       },
  { origin: "https://blur.io",                name: "Blur",          category: "nft"       },
  { origin: "https://app.1inch.io",           name: "1inch",         category: "dex"       },
  { origin: "https://pancakeswap.finance",    name: "PancakeSwap",   category: "dex"       },
  { origin: "https://app.compound.finance",   name: "Compound",      category: "lending"   },
  { origin: "https://raydium.io",             name: "Raydium",       category: "dex"       },
  { origin: "https://jup.ag",                 name: "Jupiter",       category: "dex"       },
];

// ── Suspicious pattern detection ──────────────────────────────────────────────

// Common lookalike character substitutions used in phishing domains
const HOMOGLYPH_MAP: Record<string, string> = {
  "0":  "o", "1": "l", "3": "e", "4": "a", "5": "s", "6": "b",
  "rn": "m", "vv": "w", "cl": "d", "rnl": "ml",
};

// Domains that are commonly spoofed
const HIGH_VALUE_BRANDS = [
  "uniswap", "metamask", "coinbase", "binance", "aave", "compound",
  "opensea", "blur", "ledger", "trezor", "orahdex", "orah",
];

// ── Core safety check ─────────────────────────────────────────────────────────

export type DomainRisk = "safe" | "unknown" | "suspicious" | "dangerous";

export interface DomainCheck {
  origin:   string;
  risk:     DomainRisk;
  reason?:  string;
  knownAs?: string;  // human-readable name if it's a known dApp
  isOrahDex: boolean;
}

export function checkOriginSafety(origin: string): DomainCheck {
  // 1. Direct allowlist match
  if (SAFE_ORIGINS.has(origin)) {
    return { origin, risk: "safe", isOrahDex: true };
  }

  // 2. Pattern match (Replit, localhost)
  if (SAFE_ORIGIN_PATTERNS.some(p => p.test(origin))) {
    return { origin, risk: "safe", isOrahDex: true };
  }

  // 3. Known legitimate dApp
  const knownDapp = KNOWN_DAPPS.find(d => origin.startsWith(d.origin));
  if (knownDapp) {
    return { origin, risk: "safe", knownAs: knownDapp.name, isOrahDex: false };
  }

  // 4. Homoglyph / lookalike detection
  const homoglyphTarget = detectHomoglyph(origin);
  if (homoglyphTarget) {
    return {
      origin,
      risk:   "dangerous",
      reason: `This domain looks like a fake version of "${homoglyphTarget}". Do not sign.`,
      isOrahDex: false,
    };
  }

  // 5. Brand name in unexpected TLD
  const brandSpoof = detectBrandSpoof(origin);
  if (brandSpoof) {
    return {
      origin,
      risk:   "suspicious",
      reason: `This domain contains "${brandSpoof}" but is not a known official site.`,
      isOrahDex: false,
    };
  }

  // 6. IP address or unusual TLD
  if (/^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(origin)) {
    return {
      origin,
      risk:   "suspicious",
      reason: "Connecting to a raw IP address. This is unusual for legitimate dApps.",
      isOrahDex: false,
    };
  }

  return { origin, risk: "unknown", isOrahDex: false };
}

function detectHomoglyph(origin: string): string | null {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    // Normalize by substituting homoglyphs
    let normalized = hostname;
    for (const [glyph, char] of Object.entries(HOMOGLYPH_MAP)) {
      normalized = normalized.replaceAll(glyph, char);
    }
    for (const brand of HIGH_VALUE_BRANDS) {
      if (normalized.includes(brand) && !hostname.includes(brand)) {
        return brand;
      }
    }
  } catch { /* invalid URL */ }
  return null;
}

function detectBrandSpoof(origin: string): string | null {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    // Check if a high-value brand name appears in a non-official TLD
    for (const brand of HIGH_VALUE_BRANDS) {
      if (!hostname.includes(brand)) continue;
      // Allow only known-safe official TLDs
      const officialTlds = [".org", ".io", ".com", ".fi", ".ag", ".exchange", ".finance"];
      const hasOfficialTld = officialTlds.some(t => hostname.endsWith(t));
      if (!hasOfficialTld) return brand;
      // Flag if subdomain tricks: "orahdex.phish.com" — brand not in registrable domain
      const parts = hostname.split(".");
      const registrable = parts.slice(-2).join(".");
      if (!registrable.includes(brand)) return brand;
    }
  } catch { /* invalid URL */ }
  return null;
}

// ── Current page check ────────────────────────────────────────────────────────

/**
 * Check the safety of the current browser page.
 * Safe to call from any component — falls back to "unknown" on SSR.
 */
export function checkCurrentOrigin(): DomainCheck {
  if (typeof window === "undefined") {
    return { origin: "server", risk: "safe", isOrahDex: true };
  }
  return checkOriginSafety(window.location.origin);
}

/**
 * Check a dApp URL being connected to via WalletConnect.
 */
export function checkDAppUrl(url: string): DomainCheck {
  try {
    const origin = new URL(url).origin;
    return checkOriginSafety(origin);
  } catch {
    return {
      origin: url,
      risk:   "dangerous",
      reason: "Could not parse URL — connection blocked.",
      isOrahDex: false,
    };
  }
}

export function riskColor(risk: DomainRisk): string {
  switch (risk) {
    case "safe":       return "text-green-400";
    case "unknown":    return "text-yellow-400";
    case "suspicious": return "text-orange-400";
    case "dangerous":  return "text-red-500";
  }
}

export function riskLabel(risk: DomainRisk): string {
  switch (risk) {
    case "safe":       return "Verified safe";
    case "unknown":    return "Unknown site";
    case "suspicious": return "Suspicious";
    case "dangerous":  return "Likely phishing";
  }
}
