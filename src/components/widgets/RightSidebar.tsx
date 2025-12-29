import { Search } from "lucide-react";
import { TrendingWidget } from "./TrendingWidget";
import { RelayStatusWidget } from "./RelayStatusWidget";

export function RightSidebar() {
  return (
    <aside className="w-80 h-screen sticky top-0 py-4 pr-4 hidden lg:block overflow-y-auto scrollbar-thin">
      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search posts, tags, people..."
            className="w-full bg-card border border-border rounded-full py-3 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
        </div>
      </div>

      <div className="space-y-4">
        <TrendingWidget />
        <RelayStatusWidget />
      </div>

      {/* Footer Links */}
      <div className="mt-6 px-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Terms of Service · Privacy Policy · About
          <br />
          <span className="opacity-50">© 2024 NostrChat</span>
        </p>
      </div>
    </aside>
  );
}
