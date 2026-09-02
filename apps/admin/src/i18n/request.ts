import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE } from "./config";

/**
 * Request-scoped i18n config for next-intl.
 *
 * Single active locale (`en`) with no `[locale]` routing segment. Switching the
 * `DEFAULT_LOCALE` constant (and adding the matching `messages/<locale>.json`)
 * flips every string rendered from the catalogs.
 */
export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
