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
      return "bg-slate-400";
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
      return "text-slate-400";
    case "verification-failed":
      return "text-destructive";
    case "disconnected":
    default:
      return "text-slate-400";
  }
}

export function getRelayStatusSurfaceClass(status: RelayConnectionStatus): string {
  switch (status) {
    case "connected":
      return "bg-success/15 text-success";
    case "read-only":
      return "bg-sky-500/15 text-sky-500";
    case "connecting":
      return "bg-warning/15 text-warning";
    case "verification-failed":
      return "bg-destructive/15 text-destructive";
    case "connection-error":
    case "disconnected":
    default:
      return "bg-slate-400/15 text-slate-400";
  }
}
