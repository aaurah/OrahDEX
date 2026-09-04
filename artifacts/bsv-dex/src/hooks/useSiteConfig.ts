import { useMemo } from "react";

const DEFAULTS = {
  siteName: "OrahDEX",
  tagline: "Trade means DEX",
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
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("orahdex_site_settings") ?? "{}") };
    } catch {
      return DEFAULTS;
    }
  }, []);
}

export type { SiteConfig };
