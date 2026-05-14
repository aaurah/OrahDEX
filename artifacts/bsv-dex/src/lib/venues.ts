export const VENUE_LABELS: Record<string, string> = {
  letsexchange: "OrahRouter",
  changenow:    "OrahBridge",
  simpleswap:   "OrahSwap",
  stealthex:    "OrahLink",
  changelly:    "OrahPath",
};

export const VENUE_COLORS: Record<string, string> = {
  letsexchange: "text-violet-400",
  changenow:    "text-sky-400",
  simpleswap:   "text-emerald-400",
  stealthex:    "text-orange-400",
  changelly:    "text-pink-400",
};

export function venueLabel(venue: string | null | undefined): string {
  if (!venue) return "OrahBridge";
  return VENUE_LABELS[venue] ?? venue;
}
