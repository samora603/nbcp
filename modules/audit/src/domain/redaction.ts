/** Keys stripped from metadata at ingest (secrets / credentials). */
export const METADATA_DENY_LIST: readonly string[] = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cardNumber",
  "cvv",
  "secret",
  "rawToken",
  "sessionToken",
];

const MAX_METADATA_JSON_BYTES = 32_768;

export function redactMetadata(
  input: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  const deny = new Set(METADATA_DENY_LIST.map((k) => k.toLowerCase()));
  for (const [key, value] of Object.entries(input)) {
    if (deny.has(key.toLowerCase())) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = value;
  }
  const encoded = JSON.stringify(out);
  if (encoded.length > MAX_METADATA_JSON_BYTES) {
    return {
      _truncated: true,
      _originalBytes: encoded.length,
      preview: encoded.slice(0, 256),
    };
  }
  return out;
}
