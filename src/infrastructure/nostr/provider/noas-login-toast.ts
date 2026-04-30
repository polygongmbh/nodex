import i18n from "@/lib/i18n/config";
import { toast } from "sonner";

export function resolveNoasLoginHandle(username: string, apiBaseUrl: string): string {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return "";
  if (normalizedUsername.includes("@")) return normalizedUsername;

  try {
    const domain = new URL(apiBaseUrl).hostname;
    return domain ? `${normalizedUsername}@${domain}` : normalizedUsername;
  } catch {
    return normalizedUsername;
  }
}

export function showNoasLoginToast(params: { username: string; apiBaseUrl: string }) {
  const handle = resolveNoasLoginHandle(params.username, params.apiBaseUrl);
  toast.success(i18n.t("auth.modal.success.noas"), {
    description: i18n.t("auth.modal.success.noasDescription", { handle }),
  });
}
