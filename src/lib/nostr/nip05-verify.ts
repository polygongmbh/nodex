interface NostrWellKnownPayload {
  names?: Record<string, string>;
  relays?: Record<string, string[]>;
}

async function fetchNip05Payload(nip05: string): Promise<{ name: string; payload: NostrWellKnownPayload } | null> {
  const [rawName, domain] = nip05.split("@");
  const name = rawName?.trim().toLowerCase();
  if (!name || !domain) return null;

  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const payload = await response.json() as NostrWellKnownPayload;
  return { name, payload };
}

export async function verifyNip05(nip05: string, pubkey: string): Promise<boolean> {
  try {
    const result = await fetchNip05Payload(nip05);
    if (!result) return false;
    const expectedPubkey = pubkey.trim().toLowerCase();
    const resolvedPubkey = (result.payload.names?.[result.name] || "").trim().toLowerCase();
    return Boolean(resolvedPubkey) && resolvedPubkey === expectedPubkey;
  } catch {
    return false;
  }
}

export async function resolveVerifiedNip05RelayUrls(nip05: string, pubkey: string): Promise<string[]> {
  try {
    const result = await fetchNip05Payload(nip05);
    if (!result) return [];
    const expectedPubkey = pubkey.trim().toLowerCase();
    const resolvedPubkey = (result.payload.names?.[result.name] || "").trim().toLowerCase();
    if (!resolvedPubkey || resolvedPubkey !== expectedPubkey) return [];
    const relayUrls = result.payload.relays?.[resolvedPubkey] || [];
    return relayUrls.map((value) => value.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
