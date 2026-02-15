export function isNostrEventId(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^[a-f0-9]{64}$/i.test(value);
}
