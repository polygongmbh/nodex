import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { OVERLAY_SCRIM_FADE_MS } from "@/components/ui/overlay-scrim";

/** Inline style applied to overlay/content so all dialog surfaces share the
 * same gentle fade timing as the onboarding intro popover, keeping
 * cross-overlay transitions visually consistent. */
const dialogFadeStyle: React.CSSProperties = {
  animationDuration: `${OVERLAY_SCRIM_FADE_MS}ms`,
  animationTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
};

type PointerDownOutsideHandler = NonNullable<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>["onPointerDownOutside"]
>;
type InteractOutsideHandler = NonNullable<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>["onInteractOutside"]
>;
type PointerDownOutsideEvent = Parameters<PointerDownOutsideHandler>[0];
type InteractOutsideEvent = Parameters<InteractOutsideHandler>[0];
type OutsideInteractionEvent = PointerDownOutsideEvent | InteractOutsideEvent;

export function handleDialogOutsideInteraction<TEvent extends OutsideInteractionEvent>(
  dismissOnOutsideInteract: boolean,
  event: TEvent,
  handler?: (event: TEvent) => void,
) {
  if (!dismissOnOutsideInteract) {
    event.preventDefault();
  }
  handler?.(event);
}

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, style, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[200] bg-overlay-scrim data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    style={{ ...dialogFadeStyle, ...style }}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
    dismissOnOutsideInteract?: boolean;
  }
>(({ className, children, showCloseButton = true, dismissOnOutsideInteract = true, onInteractOutside, onPointerDownOutside, style, ...props }, ref) => (
  <DialogPortal>
    {/* Overlay is rendered identically regardless of dismissOnOutsideInteract so that
     * toggling that flag (e.g. as form dirtiness changes) does not unmount/remount the
     * overlay and re-trigger its fade-in animation, which would look like a background blink.
     * Outside-click dismissal is handled via onPointerDownOutside / onInteractOutside below. */}
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Unified overlay motion: fade + subtle zoom only. Avoid stacking radix slide-from-top with
        // the legacy `motion-popup` keyframes — combining them caused a visible vertical "jiggle"
        // when opening dialogs (e.g. the auth modal launched from the onboarding intro).
        "fixed left-[50%] top-[50%] z-[210] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      style={{ ...dialogFadeStyle, ...style }}
      onPointerDownOutside={(event) =>
        handleDialogOutsideInteraction(dismissOnOutsideInteract, event, onPointerDownOutside)
      }
      onInteractOutside={(event) =>
        handleDialogOutsideInteraction(dismissOnOutsideInteract, event, onInteractOutside)
      }
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close className="absolute right-2 top-2 z-20 rounded-md border border-border/70 bg-background/90 p-1 text-muted-foreground opacity-80 shadow-sm backdrop-blur-sm ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

interface DialogScrollBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  innerClassName?: string;
}

const DialogScrollBody = React.forwardRef<HTMLDivElement, DialogScrollBodyProps>(
  ({ className, innerClassName, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("min-h-0 flex-1 overflow-y-auto pr-1", className)}
      {...props}
    >
      <div className={cn("px-1 sm:px-1.5", innerClassName)}>{children}</div>
    </div>
  ),
);
DialogScrollBody.displayName = "DialogScrollBody";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogScrollBody,
};
