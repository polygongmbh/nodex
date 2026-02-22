import { Toaster as Sonner, toast } from "sonner";
import { useEffect, useState } from "react";
import { useThemeMode } from "@/components/theme/ThemeProvider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { mode } = useThemeMode();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);
    updateIsMobile();
    mediaQuery.addEventListener("change", updateIsMobile);
    return () => mediaQuery.removeEventListener("change", updateIsMobile);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const toastElement = target.closest("[data-sonner-toast]");
      if (!toastElement) return;
      toast.dismiss();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <Sonner
      theme={(mode === "auto" ? "system" : mode) as ToasterProps["theme"]}
      className="toaster group"
      position={isMobile ? "top-center" : "bottom-right"}
      closeButton
      expand={false}
      visibleToasts={2}
      offset={12}
      mobileOffset={{ top: 12, left: 12, right: 12 }}
      toastOptions={{
        duration: isMobile ? 1800 : 2800,
        dismissible: true,
        closeButton: true,
        classNames: {
          toast:
            "group toast cursor-pointer group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-2xl group-[.toaster]:ring-1 group-[.toaster]:ring-black/10 dark:group-[.toaster]:ring-white/10",
          success:
            "group-[.toaster]:border-success/90 group-[.toaster]:bg-success/55 group-[.toaster]:text-success-foreground",
          info:
            "group-[.toaster]:border-primary/80 group-[.toaster]:bg-primary/55 group-[.toaster]:text-primary-foreground",
          warning:
            "group-[.toaster]:border-warning/85 group-[.toaster]:bg-warning/55 group-[.toaster]:text-warning-foreground",
          error:
            "group-[.toaster]:border-destructive/85 group-[.toaster]:bg-destructive/55 group-[.toaster]:text-destructive-foreground",
          description: "group-[.toast]:text-current/90",
          actionButton:
            "group-[.toast]:bg-foreground group-[.toast]:text-background group-[.toast]:border group-[.toast]:border-foreground/20",
          cancelButton:
            "group-[.toast]:bg-background/90 group-[.toast]:text-foreground group-[.toast]:border group-[.toast]:border-foreground/20",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
