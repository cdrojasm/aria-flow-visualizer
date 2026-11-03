// Dataset rows can carry a "historical" column whose value is a JSON-encoded
// string (sometimes a list whose own items are JSON-encoded strings again -
// see the backend's historical_features._history()) rather than plain text.
// Shown raw, that's an escaped blob; this recursively parses any string
// field that looks like JSON so the row renders as real nested JSON instead.
export function parseRowForJsonView(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, deepParseValue(value)]),
  );
}

function deepParseValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return value;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(deepParseValue);
    if (parsed !== null && typeof parsed === "object") {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, deepParseValue(v)]),
      );
    }
    return parsed;
  } catch {
    return value;
  }
}
