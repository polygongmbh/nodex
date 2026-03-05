export function isDemoFeedEnabled(rawValue: string | undefined): boolean {
  return (rawValue || "").trim().toLowerCase() === "true";
}
