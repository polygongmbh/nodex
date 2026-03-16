const UMLAUT_MAP: Record<string, string> = {
  ä: "a",
  ö: "o",
  ü: "u",
  ß: "ss",
};

export function sanitizeProfileUsername(value?: string | null): string {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[äöüß]/g, (character) => UMLAUT_MAP[character] || "")
    .replace(/[ _]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+|[.-]+$/g, "");

  return normalized;
}
