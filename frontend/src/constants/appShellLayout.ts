import { cn } from "../utils/cn";

/**
 * Horizontal alignment source of truth: My Network (`ConnectionsPage`).
 * Navbar and main content columns share this max width + padding.
 */
export const APP_SHELL_MAX_WIDTH_CLASS = "max-w-[1280px]";
export const APP_SHELL_PAD_X_CLASS = "px-3 md:px-4";

/** Default `<main>` / single-column pages: centered column inside `PageWrapper`. */
export const APP_SHELL_MAIN_COLUMN_CLASS = cn(
  "mx-auto w-full",
  APP_SHELL_MAX_WIDTH_CLASS,
  APP_SHELL_PAD_X_CLASS
);

/** Background / content breakout from padded `<main>` (full viewport width trick). */
export const APP_SHELL_BREAKOUT_CLASS = "relative left-1/2 w-screen -translate-x-1/2";

/** Inner row used inside breakout (sidebar + feed, invitations, etc.). */
export function appShellInnerRowClass(className?: string) {
  return cn("mx-auto flex w-full", APP_SHELL_MAX_WIDTH_CLASS, APP_SHELL_PAD_X_CLASS, className);
}

/** Inner grid (job detail loading, search results, etc.). */
export function appShellInnerGridClass(className?: string) {
  return cn("mx-auto grid w-full", APP_SHELL_MAX_WIDTH_CLASS, APP_SHELL_PAD_X_CLASS, className);
}
