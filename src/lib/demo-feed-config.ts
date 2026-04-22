export const DEMO_RELAY_ID = "demo";

export function isDemoFeedEnabled(rawValue: string | undefined): boolean {
  return (rawValue || "").trim().toLowerCase() === "true";
}
