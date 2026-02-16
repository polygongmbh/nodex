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
  onExclusive: () => void;
  isKeyboardFocused?: boolean;
}

export function RelayItem({ relay, onToggle, onExclusive, isKeyboardFocused = false }: RelayItemProps) {
  const Icon = iconMap[relay.icon] || Building2;

  return (
    <div
      data-sidebar-item={`relay-${relay.id}`}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-1.5 pl-7 transition-all group hover:bg-sidebar-accent/50",
        relay.isActive && "bg-sidebar-accent",
        isKeyboardFocused && "ring-2 ring-primary ring-inset bg-sidebar-accent"
      )}
    >
      {/* Icon - click for exclusive */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExclusive();
        }}
        className="relative"
        title={`Show only ${relay.name}`}
        aria-label={`Show only ${relay.name}`}
      >
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:ring-2 hover:ring-primary/50",
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
      </button>

      {/* Name - click for toggle */}
      <button
        onClick={onToggle}
        className="flex-1 text-left"
        title={`Toggle ${relay.name}`}
        aria-label={`Toggle ${relay.name}`}
      >
        <span
          className={cn(
            "text-sm transition-colors hover:text-primary",
            relay.isActive ? "text-foreground font-medium" : "text-sidebar-foreground"
          )}
        >
          {relay.name}
        </span>
      </button>

      {relay.postCount && relay.postCount > 0 && (
        <span className="text-xs text-muted-foreground">{relay.postCount}</span>
      )}
    </div>
  );
}
