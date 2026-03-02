export async function verifyNip05(nip05: string, pubkey: string): Promise<boolean> {
  try {
    const [name, domain] = nip05.split("@");
    if (!name || !domain) return false;

    const url = `https://${domain}/.well-known/nostr.json?name=${name}`;
    const response = await fetch(url);
    if (!response.ok) return false;

    const data = await response.json();
    return data.names?.[name] === pubkey;
  } catch {
    return false;
  }
}
