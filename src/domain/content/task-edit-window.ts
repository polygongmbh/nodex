import type { Post } from "@/types";

const ENV_KEY = "VITE_EDIT_WINDOW_MINUTES";
const DEFAULT_MINUTES = 7 * 24 * 60;

export function resolveEditWindowMinutes(env: Record<string, unknown> = import.meta.env): number {
  const raw = env[ENV_KEY];
  if (raw === undefined || raw === null || raw === "") return DEFAULT_MINUTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MINUTES;
  return Math.floor(parsed);
}

export type MutationBlockedReason = "disabled" | "not-owner" | "has-children" | "out-of-window";

export interface MutationGate {
  canDelete: boolean;
  canRecompose: boolean;
  reason?: MutationBlockedReason;
}

export interface CanAuthorMutateInput {
  task: Pick<Post, "author" | "timestamp">;
  currentUserPubkey?: string;
  hasChildren: boolean;
  now?: Date;
  editWindowMinutes?: number;
}

const DENIED = (reason: MutationBlockedReason): MutationGate => ({
  canDelete: false,
  canRecompose: false,
  reason,
});

export function canAuthorMutate(input: CanAuthorMutateInput): MutationGate {
  const editWindowMinutes = input.editWindowMinutes ?? resolveEditWindowMinutes();
  if (editWindowMinutes <= 0) return DENIED("disabled");

  const userPubkey = input.currentUserPubkey?.trim().toLowerCase() || "";
  const ownerPubkey = input.task.author.pubkey.trim().toLowerCase();
  if (!userPubkey || userPubkey !== ownerPubkey) return DENIED("not-owner");

  if (input.hasChildren) return DENIED("has-children");

  const now = input.now ?? new Date();
  const elapsedMs = now.getTime() - input.task.timestamp.getTime();
  if (elapsedMs > editWindowMinutes * 60_000) return DENIED("out-of-window");

  return { canDelete: true, canRecompose: true };
}
