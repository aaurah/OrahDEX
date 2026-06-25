import { darkTheme, lightTheme } from "thirdweb/react";
import { useThemeStore } from "@/store/useThemeStore";

export const orahDexSwapThemeDark = darkTheme({
  colors: {
    modalBg:                 "hsl(216 20% 5%)",
    primaryText:             "hsl(210 20% 90%)",
    secondaryText:           "hsl(215 16% 55%)",
    borderColor:             "hsl(216 15% 16%)",
    separatorLine:           "hsl(216 15% 16%)",
    accentText:              "hsl(142 71% 58%)",
    accentButtonBg:          "hsl(142 71% 58%)",
    accentButtonText:        "hsl(216 20% 5%)",
    primaryButtonBg:         "hsl(142 71% 58%)",
    primaryButtonText:       "hsl(216 20% 5%)",
    secondaryButtonBg:       "hsl(216 15% 16%)",
    secondaryButtonHoverBg:  "hsl(216 15% 20%)",
    secondaryButtonText:     "hsl(210 20% 90%)",
    secondaryIconColor:      "hsl(215 16% 55%)",
    secondaryIconHoverBg:    "hsl(216 15% 16%)",
    secondaryIconHoverColor: "hsl(210 20% 90%)",
    connectedButtonBg:       "hsl(216 15% 9%)",
    connectedButtonBgHover:  "hsl(216 15% 16%)",
    inputAutofillBg:         "hsl(216 15% 9%)",
    skeletonBg:              "hsl(216 15% 16%)",
    scrollbarBg:             "hsl(216 15% 16%)",
    tertiaryBg:              "hsl(216 15% 16% / 0.6)",
    tooltipBg:               "hsl(216 15% 9%)",
    tooltipText:             "hsl(210 20% 90%)",
    selectedTextBg:          "hsl(142 71% 58%)",
    selectedTextColor:       "hsl(216 20% 5%)",
    success:                 "hsl(142 71% 58%)",
    danger:                  "hsl(360 72% 55%)",
    modalOverlayBg:          "rgba(0, 0, 0, 0.8)",
  },
});

export const orahDexSwapThemeLight = lightTheme({
  colors: {
    modalBg:                 "hsl(210 20% 98%)",
    primaryText:             "hsl(216 20% 10%)",
    secondaryText:           "hsl(215 16% 40%)",
    borderColor:             "hsl(210 16% 86%)",
    separatorLine:           "hsl(210 16% 86%)",
    accentText:              "hsl(142 71% 42%)",
    accentButtonBg:          "hsl(142 71% 42%)",
    accentButtonText:        "hsl(0 0% 100%)",
    primaryButtonBg:         "hsl(142 71% 42%)",
    primaryButtonText:       "hsl(0 0% 100%)",
    secondaryButtonBg:       "hsl(210 16% 93%)",
    secondaryButtonHoverBg:  "hsl(210 16% 88%)",
    secondaryButtonText:     "hsl(216 20% 10%)",
    secondaryIconColor:      "hsl(215 16% 40%)",
    secondaryIconHoverBg:    "hsl(210 16% 93%)",
    secondaryIconHoverColor: "hsl(216 20% 10%)",
    connectedButtonBg:       "hsl(0 0% 100%)",
    connectedButtonBgHover:  "hsl(210 16% 93%)",
    inputAutofillBg:         "hsl(0 0% 100%)",
    skeletonBg:              "hsl(210 16% 93%)",
    scrollbarBg:             "hsl(210 16% 93%)",
    tertiaryBg:              "hsl(210 16% 93% / 0.6)",
    tooltipBg:               "hsl(0 0% 100%)",
    tooltipText:             "hsl(216 20% 10%)",
    selectedTextBg:          "hsl(142 71% 42%)",
    selectedTextColor:       "hsl(0 0% 100%)",
    success:                 "hsl(142 71% 42%)",
    danger:                  "hsl(360 72% 55%)",
    modalOverlayBg:          "rgba(0, 0, 0, 0.5)",
  },
});

export const orahDexSwapThemeAmoled = darkTheme({
  colors: {
    modalBg:                 "hsl(0 0% 0%)",
    primaryText:             "hsl(210 20% 92%)",
    secondaryText:           "hsl(215 16% 50%)",
    borderColor:             "hsl(0 0% 10%)",
    separatorLine:           "hsl(0 0% 10%)",
    accentText:              "hsl(142 71% 58%)",
    accentButtonBg:          "hsl(142 71% 58%)",
    accentButtonText:        "hsl(0 0% 0%)",
    primaryButtonBg:         "hsl(142 71% 58%)",
    primaryButtonText:       "hsl(0 0% 0%)",
    secondaryButtonBg:       "hsl(0 0% 7%)",
    secondaryButtonHoverBg:  "hsl(0 0% 12%)",
    secondaryButtonText:     "hsl(210 20% 92%)",
    secondaryIconColor:      "hsl(215 16% 50%)",
    secondaryIconHoverBg:    "hsl(0 0% 10%)",
    secondaryIconHoverColor: "hsl(210 20% 92%)",
    connectedButtonBg:       "hsl(0 0% 3%)",
    connectedButtonBgHover:  "hsl(0 0% 10%)",
    inputAutofillBg:         "hsl(0 0% 3%)",
    skeletonBg:              "hsl(0 0% 7%)",
    scrollbarBg:             "hsl(0 0% 7%)",
    tertiaryBg:              "hsl(0 0% 7% / 0.6)",
    tooltipBg:               "hsl(0 0% 3%)",
    tooltipText:             "hsl(210 20% 92%)",
    selectedTextBg:          "hsl(142 71% 58%)",
    selectedTextColor:       "hsl(0 0% 0%)",
    success:                 "hsl(142 71% 58%)",
    danger:                  "hsl(360 72% 55%)",
    modalOverlayBg:          "rgba(0, 0, 0, 0.95)",
  },
});

export function useSwapWidgetTheme() {
  const theme = useThemeStore(s => s.theme);
  if (theme === "light") return orahDexSwapThemeLight;
  if (theme === "amoled") return orahDexSwapThemeAmoled;
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? orahDexSwapThemeDark : orahDexSwapThemeLight;
  }
  return orahDexSwapThemeDark;
}
