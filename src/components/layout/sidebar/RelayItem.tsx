import { Building2, Users, Gamepad2, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay } from "@/types";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "building-2": Building2,
  users: Users,
  "gamepad-2": Gamepad2,
  cpu: Cpu,
};

interface RelayItemProps {
  relay: Relay;
  onToggle: () => void;
}

export function RelayItem({ relay, onToggle }: RelayItemProps) {
  const Icon = iconMap[relay.icon] || Building2;

  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 pl-7 transition-all group hover:bg-sidebar-accent/50",
        relay.isActive && "bg-sidebar-accent"
      )}
    >
      <div className="relative">
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
            relay.isActive
              ? "bg-primary/20 text-primary"
              : "bg-muted/50 text-muted-foreground group-hover:text-sidebar-foreground"
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        {relay.isActive && (
          <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </div>
      <div className="flex-1 text-left">
        <span
          className={cn(
            "text-sm transition-colors",
            relay.isActive ? "text-foreground font-medium" : "text-sidebar-foreground"
          )}
        >
          {relay.name}
        </span>
      </div>
      {relay.postCount && relay.postCount > 0 && (
        <span className="text-xs text-muted-foreground">{relay.postCount}</span>
      )}
    </button>
  );
}
