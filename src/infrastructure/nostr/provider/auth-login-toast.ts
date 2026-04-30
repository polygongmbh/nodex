import i18n from "@/lib/i18n/config";
import { toast } from "sonner";
import type { AuthMethod } from "./contracts";

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

export function showLoginSuccessToast(params: {
  authMethod: Exclude<AuthMethod, null>;
  noasUsername?: string;
  noasApiBaseUrl?: string;
}) {
  switch (params.authMethod) {
    case "extension":
      toast.success(i18n.t("auth.modal.success.extension"));
      return;
    case "privateKey":
      toast.success(i18n.t("auth.modal.success.privateKey"));
      return;
    case "guest":
      toast.success(i18n.t("auth.modal.success.guest"));
      return;
    case "nostrConnect":
      toast.success(i18n.t("auth.modal.success.signer"));
      return;
    case "noas": {
      const handle = resolveNoasLoginHandle(params.noasUsername || "", params.noasApiBaseUrl || "");
      toast.success(i18n.t("auth.modal.success.noas"), {
        description: i18n.t("auth.modal.success.noasDescription", { handle }),
      });
      return;
    }
  }
}
