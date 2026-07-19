import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "../../lib/utils";

// Thin wrapper around Radix Tooltip — the app's one shared tooltip primitive.
// Radix Tooltip only opens on hover/focus; it does NOT open on touch tap
// (it explicitly ignores touch pointerdown to avoid double-firing with click
// handlers). Callers that need tap-to-open on mobile (e.g. MenuTagBadges)
// must use the controlled `open`/`onOpenChange` props and toggle it
// themselves from an onClick handler on the trigger.
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold text-background shadow-lg animate-in fade-in-0 zoom-in-95",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
