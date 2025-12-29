import { Sparkles, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

type FeedView = "latest" | "trending" | "for-you";

export function FeedHeader() {
  const [activeView, setActiveView] = useState<FeedView>("latest");

  const views: { id: FeedView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "latest", label: "Latest", icon: Clock },
    { id: "trending", label: "Trending", icon: TrendingUp },
    { id: "for-you", label: "For You", icon: Sparkles },
  ];

  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="flex items-center">
        {views.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-4 font-medium text-sm transition-colors relative",
              activeView === id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
            {activeView === id && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>
    </header>
  );
}
