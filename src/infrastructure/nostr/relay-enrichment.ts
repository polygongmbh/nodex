import { ensureRelayProtocol } from "@/infrastructure/nostr/relay-url";

type ComplementaryRelaySource = "nip65" | "nip05" | null;

function normalizeRelayCandidates(relayUrls: string[]): string[] {
  const normalized = relayUrls
    .map((value) => ensureRelayProtocol(value, "wss"))
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

export function extractRelayUrlsFromNip65Tags(tags: string[][]): string[] {
  return normalizeRelayCandidates(
    tags
      .filter((tag) => tag[0] === "r")
      .map((tag) => tag[1] || "")
  );
}

export function selectComplementaryRelayUrls(options: {
  nip65RelayUrls: string[];
  nip05RelayUrls: string[];
}): { source: ComplementaryRelaySource; relayUrls: string[] } {
  const nip65RelayUrls = normalizeRelayCandidates(options.nip65RelayUrls);
  if (nip65RelayUrls.length > 0) {
    return { source: "nip65", relayUrls: nip65RelayUrls };
  }

  const nip05RelayUrls = normalizeRelayCandidates(options.nip05RelayUrls);
  if (nip05RelayUrls.length > 0) {
    return { source: "nip05", relayUrls: nip05RelayUrls };
  }

  return { source: null, relayUrls: [] };
}
