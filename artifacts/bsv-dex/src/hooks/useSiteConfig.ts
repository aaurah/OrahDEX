import { useMemo } from "react";

const DEFAULTS = {
  siteName: "OrahDEX",
  tagline: "Trade Means DEX",
  twitterUrl: "",
  telegramUrl: "",
  discordUrl: "",
  githubUrl: "",
  linkedinUrl: "",
  facebookUrl: "",
  instagramUrl: "",
  youtubeUrl: "",
  mediumUrl: "",
  redditUrl: "",
};

type SiteConfig = typeof DEFAULTS;

export function useSiteConfig(): SiteConfig {
  return useMemo(() => {
    try {
      const saved = localStorage.getItem("orahdex_site_settings") ?? "{}";
      const normalized = saved.replaceAll("Trade means DEX", "Trade Means DEX");
      if (normalized !== saved) localStorage.setItem("orahdex_site_settings", normalized);
      return { ...DEFAULTS, ...JSON.parse(normalized) };
    } catch {
      return DEFAULTS;
    }
  }, []);
}

export type { SiteConfig };
