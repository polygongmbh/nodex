export interface RelayInformationDocument {
  supported_nips?: number[];
  limitation?: {
    auth_required?: boolean;
    payment_required?: boolean;
  };
  limitations?: {
    auth_required?: boolean;
    payment_required?: boolean;
  };
  [key: string]: unknown;
}

export interface RelayInfoSummary {
  authRequired: boolean;
  supportsNip42: boolean;
}

export interface RelayInfoFetchResult {
  document: RelayInformationDocument;
  summary: RelayInfoSummary;
}

export function relayWebsocketUrlToHttpUrl(relayUrl: string): string | null {
  try {
    const parsed = new URL(relayUrl);
    if (parsed.protocol === "wss:") parsed.protocol = "https:";
    else if (parsed.protocol === "ws:") parsed.protocol = "http:";
    else return null;
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/";
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function summarizeRelayInfo(doc: RelayInformationDocument): RelayInfoSummary {
  const authRequired = Boolean(doc.limitations?.auth_required ?? doc.limitation?.auth_required);
  const supportsNip42 = (doc.supported_nips ?? []).includes(42) || authRequired;
  return {
    authRequired,
    supportsNip42,
  };
}

export async function fetchRelayInfo(relayUrl: string): Promise<RelayInfoFetchResult | null> {
  const infoUrl = relayWebsocketUrlToHttpUrl(relayUrl);
  if (!infoUrl) return null;

  try {
    const response = await fetch(infoUrl, {
      method: "GET",
      headers: {
        Accept: "application/nostr+json",
      },
    });
    if (!response.ok) return null;
    const document = await response.json() as RelayInformationDocument;
    return { document, summary: summarizeRelayInfo(document) };
  } catch {
    return null;
  }
}
