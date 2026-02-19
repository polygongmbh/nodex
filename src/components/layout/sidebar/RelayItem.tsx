import { Building2, Users, Gamepad2, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay } from "@/types";
import { SidebarFilterRow } from "./SidebarFilterRow";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const Icon = iconMap[relay.icon] || Building2;
  const isConnectionActive = relay.id === "demo" || relay.connectionStatus === "connected" || !relay.connectionStatus;

  return (
    <SidebarFilterRow
      itemId={`relay-${relay.id}`}
      isKeyboardFocused={isKeyboardFocused}
      className={cn(
        "gap-3 py-1.5",
        relay.isActive && "bg-sidebar-accent",
        relay.isActive && !isConnectionActive && "bg-warning/10"
      )}
    >
      {/* Icon - click for toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="relative"
        title={t("sidebar.filters.toggleRelay", { name: relay.name })}
        aria-label={t("sidebar.filters.toggleRelay", { name: relay.name })}
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

      {/* Name - click for exclusive */}
      <button
        onClick={onExclusive}
        className="flex-1 text-left"
        title={t("sidebar.filters.showOnlyRelay", { name: relay.name })}
        aria-label={t("sidebar.filters.showOnlyRelay", { name: relay.name })}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-sm transition-colors hover:text-primary",
            relay.isActive ? "text-foreground font-medium" : "text-sidebar-foreground"
          )}
        >
          {relay.name}
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              isConnectionActive ? "bg-success" : "bg-warning"
            )}
            title={isConnectionActive ? "connected" : relay.connectionStatus || "disconnected"}
            aria-label={isConnectionActive ? "connected" : relay.connectionStatus || "disconnected"}
          />
        </span>
      </button>

      {relay.postCount && relay.postCount > 0 && (
        <span className="text-xs text-muted-foreground">{relay.postCount}</span>
      )}
    </SidebarFilterRow>
  );
}
