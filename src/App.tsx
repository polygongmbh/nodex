import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { NDKProvider } from "@/infrastructure/nostr/ndk-context";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { resolveStartupRelayBootstrap, readStartupRelayBootstrap } from "@/infrastructure/nostr/startup-relays";
import { readStartupNoasBootstrap, resolveStartupNoasBootstrap } from "@/infrastructure/nostr/startup-noas";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function NostrBootstrapProvider({ children }: { children: ReactNode }) {
  const initialBootstrap = readStartupRelayBootstrap();
  const initialNoasBootstrap = readStartupNoasBootstrap();
  const [relayUrls, setRelayUrls] = useState(initialBootstrap.relayUrls);
  const [defaultNoasHostUrl, setDefaultNoasHostUrl] = useState(initialNoasBootstrap.defaultHostUrl);

  useEffect(() => {
    if (!initialBootstrap.needsAsyncFallback) return;

    let cancelled = false;
    void (async () => {
      const resolvedBootstrap = await resolveStartupRelayBootstrap();
      if (cancelled) return;
      setRelayUrls(resolvedBootstrap.relayUrls);
      if (resolvedBootstrap.relayUrls.length > 0) {
        nostrDevLog("relay", "Resolved startup relays from app bootstrap", {
          source: resolvedBootstrap.source,
          relayUrls: resolvedBootstrap.relayUrls,
        });
        return;
      }
      console.warn("No default relays configured and no host-derived relay was reachable");
    })();

    return () => {
      cancelled = true;
    };
  }, [initialBootstrap.needsAsyncFallback]);

  useEffect(() => {
    if (!initialNoasBootstrap.needsAsyncFallback) return;

    let cancelled = false;
    void (async () => {
      const resolvedBootstrap = await resolveStartupNoasBootstrap();
      if (cancelled) return;
      setDefaultNoasHostUrl(resolvedBootstrap.defaultHostUrl);
      if (resolvedBootstrap.defaultHostUrl) {
        nostrDevLog("noas", "Resolved startup NoaS host from app bootstrap", {
          source: resolvedBootstrap.source,
          defaultHostUrl: resolvedBootstrap.defaultHostUrl,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialNoasBootstrap.needsAsyncFallback]);

  return (
    <NDKProvider defaultRelays={relayUrls} defaultNoasHostUrl={defaultNoasHostUrl}>
      {children}
    </NDKProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <NostrBootstrapProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/feed" replace />} />
              <Route path="/signin" element={<Index />} />
              <Route path="/signup" element={<Index />} />
              <Route path="/:view" element={<Index />} />
              <Route path="/:view/:taskId" element={<Index />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </NostrBootstrapProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
