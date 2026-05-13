/**
 * Probe a NIP-05 identifier to produce a human-readable diagnostic when
 * the regular validation (NDK's validateNip05) returns null or throws.
 *
 * Distinguishes: malformed input, unreachable host, HTTP error,
 * malformed JSON, missing entry, and pubkey mismatch.
 */
export async function diagnoseNip05(nip05: string, expectedPubkey?: string): Promise<string> {
  const trimmed = nip05.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) {
    return "Address must be in name@domain format";
  }
  const name = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "network error";
    return `Could not reach ${domain} (${detail})`;
  }

  if (!response.ok) {
    return `${domain} returned HTTP ${response.status}`;
  }

  let data: { names?: Record<string, string> };
  try {
    data = await response.json();
  } catch {
    return `${domain} returned invalid JSON`;
  }

  const recorded = data.names?.[name] || data.names?.[name.toLowerCase()];
  if (!recorded) {
    return `No entry for "${name}" at ${domain}`;
  }

  if (expectedPubkey && recorded.toLowerCase() !== expectedPubkey.toLowerCase()) {
    return `Address points to a different public key (${recorded.slice(0, 8)}…)`;
  }

  return `Could not verify ${trimmed}`;
}
