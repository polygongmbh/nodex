import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SidebarInset } from "./SidebarInset";

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
    <SidebarInset
      data-sidebar-item={itemId}
      className={cn(
        "w-full flex items-center pl-6 sm:pl-[1.625rem] lg:pl-7 transition-all group hover:bg-sidebar-accent/50",
        isKeyboardFocused && "ring-2 ring-primary ring-inset bg-sidebar-accent",
        className
      )}
    >
      {children}
    </SidebarInset>
  );
}
