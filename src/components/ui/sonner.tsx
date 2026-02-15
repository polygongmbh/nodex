import { Toaster as Sonner, toast } from "sonner";
import { useThemeMode } from "@/components/theme/ThemeProvider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { mode } = useThemeMode();

  return (
    <Sonner
      theme={(mode === "auto" ? "system" : mode) as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      closeButton
      expand={false}
      visibleToasts={2}
      offset={12}
      mobileOffset={{ top: 56, left: 12, right: 12, bottom: 12 }}
      toastOptions={{
        duration: 2800,
        dismissible: true,
        closeButton: true,
        classNames: {
          toast:
            "group toast cursor-pointer group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
