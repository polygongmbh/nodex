export type RelayConnectionStatus =
  | "connected"
  | "read-only"
  | "connecting"
  | "disconnected"
  | "connection-error"
  | "verification-failed";

export function getRelayStatusDotClass(status: RelayConnectionStatus): string {
  switch (status) {
    case "connected":
      return "bg-success";
    case "read-only":
      return "bg-sky-500";
    case "connecting":
      return "bg-warning animate-pulse";
    case "connection-error":
    case "verification-failed":
      return "bg-destructive";
    case "disconnected":
    default:
      return "bg-slate-400";
  }
}

export function getRelayStatusTextClass(status: RelayConnectionStatus): string {
  switch (status) {
    case "connected":
      return "text-success";
    case "read-only":
      return "text-sky-500";
    case "connecting":
      return "text-warning";
    case "connection-error":
    case "verification-failed":
      return "text-destructive";
    case "disconnected":
    default:
      return "text-slate-400";
  }
}
