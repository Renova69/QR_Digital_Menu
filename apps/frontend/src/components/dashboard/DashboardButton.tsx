import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const dashboardButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold leading-tight whitespace-normal transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      density: {
        action: "min-h-11 px-4 py-2",
        tab: "min-h-11 px-3 py-2",
        compact: "min-h-11 px-3 sm:h-9 sm:min-h-9",
        icon: "h-11 w-11 shrink-0 p-0",
      },
    },
    defaultVariants: {
      density: "action",
    },
  },
);

export interface DashboardButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof dashboardButtonVariants> {}

export const DashboardButton = React.forwardRef<
  HTMLButtonElement,
  DashboardButtonProps
>(({ className, density, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(dashboardButtonVariants({ density }), className)}
    {...props}
  />
));

DashboardButton.displayName = "DashboardButton";
