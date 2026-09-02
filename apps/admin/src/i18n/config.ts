/**
 * i18n configuration (next-intl, "without i18n routing" setup).
 *
 * Only `en` is active for now. The structure is ready for `ar` + RTL later:
 * add the locale to `SUPPORTED_LOCALES`, drop a `messages/ar.json` catalog in
 * place, and `localeDir` already maps `ar` to `rtl` for the root layout.
 */
export const DEFAULT_LOCALE = "en";

export const SUPPORTED_LOCALES = ["en"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const RTL_LOCALES = new Set<string>(["ar", "he", "fa", "ur"]);

/** Text direction for a locale — `rtl` for Arabic/Hebrew/Persian/Urdu, else `ltr`. */
export function localeDir(locale: string): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
