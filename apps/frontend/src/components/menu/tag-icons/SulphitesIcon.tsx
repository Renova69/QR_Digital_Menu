import React from "react";

// Sulphites (SO2 preservative, common in wine/dried fruit) — lab flask,
// the closest recognizable metaphor lucide doesn't ship.
export const SulphitesIcon: React.FC<{ className?: string }> = ({
  className,
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 2v6.5L4.5 19a1.8 1.8 0 0 0 1.6 2.6h11.8a1.8 1.8 0 0 0 1.6-2.6L14 8.5V2" />
    <path d="M9 2h6" />
    <path d="M7.5 15h9" />
  </svg>
);
