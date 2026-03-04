import { defineConfig, loadEnv } from "vite";
import type { RollupLog } from "rollup";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const uploadUrl = (env.VITE_NIP96_UPLOAD_URL || "").trim();
  const defaultRelayList = (env.VITE_DEFAULT_RELAYS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const defaultRelayDomain = (env.VITE_DEFAULT_RELAY_DOMAIN || "").trim();
  const defaultRelayProtocol = (env.VITE_DEFAULT_RELAY_PROTOCOL || "").trim() || "wss";
  const defaultRelayPort = (env.VITE_DEFAULT_RELAY_PORT || "").trim();
  const debugAttachmentsEnabled = String(env.VITE_DEBUG_ATTACHMENTS || "").toLowerCase() === "true";
  const hasUploadUrl = Boolean(uploadUrl);
  const hasRelayList = defaultRelayList.length > 0;
  const hasRelayDomain = Boolean(defaultRelayDomain);

  console.info("[vite] Startup config", {
    mode,
    nip96UploadConfigured: hasUploadUrl,
    debugAttachmentsEnabled,
    defaultRelaysConfiguredViaList: hasRelayList,
    defaultRelaysListCount: defaultRelayList.length,
    defaultRelayDomainConfigured: hasRelayDomain,
    defaultRelayProtocol,
    defaultRelayPortConfigured: Boolean(defaultRelayPort),
    relaySource: hasRelayList ? "VITE_DEFAULT_RELAYS" : hasRelayDomain ? "VITE_DEFAULT_RELAY_DOMAIN" : "fallback",
  });

  if (!hasUploadUrl) {
    console.warn(
      "[vite] VITE_NIP96_UPLOAD_URL is not set. Attachment upload UI will be hidden."
    );
  }
  if (hasRelayList && hasRelayDomain) {
    console.info(
      "[vite] Both VITE_DEFAULT_RELAYS and VITE_DEFAULT_RELAY_DOMAIN are set. VITE_DEFAULT_RELAYS takes precedence."
    );
  }

  let hasLoggedSuppressedEvalWarning = false;

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // Keep build output warnings focused on app-controlled issues.
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("@nostr-dev-kit") || id.includes("nostr-tools")) {
              return "nostr-vendor";
            }
            if (id.includes("@radix-ui") || id.includes("lucide-react")) {
              return "ui-vendor";
            }
            if (
              id.includes("react-router-dom") ||
              id.includes("@tanstack/react-query") ||
              id.includes("react-dom")
            ) {
              return "app-vendor";
            }
            if (id.includes("date-fns") || id.includes("i18next") || id.includes("react-i18next")) {
              return "intl-vendor";
            }
            return undefined;
          },
        },
        onwarn(warning: RollupLog, warn) {
          if (
            warning.code === "EVAL" &&
            typeof warning.id === "string" &&
            warning.id.includes("node_modules/tseep/lib/task-collection/bake-collection.js")
          ) {
            if (!hasLoggedSuppressedEvalWarning) {
              hasLoggedSuppressedEvalWarning = true;
              console.info(
                "[vite] Suppressing known third-party EVAL warning from tseep bake-collection.js during build."
              );
            }
            return;
          }
          warn(warning);
        },
      },
    },
  };
});
