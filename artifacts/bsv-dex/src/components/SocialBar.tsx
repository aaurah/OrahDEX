import { useSiteConfig } from "@/hooks/useSiteConfig";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const SOCIALS = [
  { key: "twitterUrl",   label: "X",         emoji: "𝕏" },
  { key: "telegramUrl",  label: "Telegram",   emoji: "✈" },
  { key: "discordUrl",   label: "Discord",    emoji: "💬" },
  { key: "githubUrl",    label: "GitHub",     emoji: "⌥" },
  { key: "linkedinUrl",  label: "LinkedIn",   emoji: "in" },
  { key: "facebookUrl",  label: "Facebook",   emoji: "f" },
  { key: "instagramUrl", label: "Instagram",  emoji: "◎" },
  { key: "youtubeUrl",   label: "YouTube",    emoji: "▶" },
  { key: "mediumUrl",    label: "Medium",     emoji: "M" },
  { key: "redditUrl",    label: "Reddit",     emoji: "r/" },
] as const;

interface SocialBarProps {
  className?: string;
  iconSize?: "sm" | "md";
}

export function SocialBar({ className, iconSize = "md" }: SocialBarProps) {
  const config = useSiteConfig();

  const active = SOCIALS.filter(s => {
    const url = (config as Record<string, string>)[s.key];
    return url && url.startsWith("http");
  });

  if (active.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-2", className)}>
      {active.map(s => {
        const url = (config as Record<string, string>)[s.key];
        return (
          <a
            key={s.key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={s.label}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/30 transition-all group",
              iconSize === "sm"
                ? "px-2.5 py-1.5 text-[11px]"
                : "px-3 py-2 text-xs",
            )}
          >
            <span className={cn(
              "font-bold text-foreground/70 group-hover:text-foreground transition-colors",
              iconSize === "sm" ? "text-[11px]" : "text-sm",
            )}>
              {s.emoji}
            </span>
            <span className="text-muted-foreground group-hover:text-foreground transition-colors font-medium">
              {s.label}
            </span>
            <ExternalLink className={cn(
              "opacity-0 group-hover:opacity-50 transition-opacity",
              iconSize === "sm" ? "w-2.5 h-2.5" : "w-3 h-3",
            )} />
          </a>
        );
      })}
    </div>
  );
}
