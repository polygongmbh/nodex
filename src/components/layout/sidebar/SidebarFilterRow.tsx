import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SidebarFilterRowProps {
  itemId: string;
  isKeyboardFocused?: boolean;
  className?: string;
  children: ReactNode;
}

export function SidebarFilterRow({
  itemId,
  isKeyboardFocused = false,
  className,
  children,
}: SidebarFilterRowProps) {
  return (
    <div
      data-sidebar-item={itemId}
      className={cn(
        "w-full flex items-center px-3 pl-7 transition-all group hover:bg-sidebar-accent/50",
        isKeyboardFocused && "ring-2 ring-primary ring-inset bg-sidebar-accent",
        className
      )}
    >
      {children}
    </div>
  );
}
