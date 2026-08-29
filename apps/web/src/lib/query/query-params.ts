/**
 * Converts a params object into clean API query values (omits undefined/null/empty).
 */
export function serializeQueryParams(
  params: object,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (typeof value === "boolean") {
      result[key] = value ? "true" : "false";
      continue;
    }

    result[key] = String(value);
  }

  return result;
}
