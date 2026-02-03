import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { NDKProvider } from "@/lib/nostr/ndk-context";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const DEFAULT_NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
];

const App = () => (
  <QueryClientProvider client={queryClient}>
    <NDKProvider defaultRelays={DEFAULT_NOSTR_RELAYS}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/tree" replace />} />
            <Route path="/:view" element={<Index />} />
            <Route path="/:view/:taskId" element={<Index />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </NDKProvider>
  </QueryClientProvider>
);

export default App;
