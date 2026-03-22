import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SidebarInsetProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  children: ReactNode;
}

export function SidebarInset({ className, children, ...props }: SidebarInsetProps) {
  return (
    <div {...props} className={cn("px-1 lg:px-2", className)}>
      {children}
    </div>
  );
}
