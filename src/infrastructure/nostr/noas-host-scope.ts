function isIpAddress(hostname: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname.includes(":");
}

export function resolveNoasRootDomainHostname(hostname: string): string {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!normalizedHostname || normalizedHostname === "localhost" || isIpAddress(normalizedHostname)) {
    return normalizedHostname;
  }

  const labels = normalizedHostname.split(".").filter(Boolean);
  if (labels.length >= 3) {
    return labels.slice(1).join(".");
  }
  return normalizedHostname;
}

export function resolveCurrentNoasHostScopeKey(): string {
  if (typeof window === "undefined" || !window.location.hostname) return "";
  return resolveNoasRootDomainHostname(window.location.hostname);
}
