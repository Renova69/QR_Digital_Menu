import React from "react";

// Mustard seeds — small round cluster, fill-based to read distinctly from
// SesameIcon's elongated ovals at pill size.
export const MustardIcon: React.FC<{ className?: string }> = ({
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
    <path d="M7 20c-2-1-3-3-3-5a5 5 0 0 1 10 0c0 2-1 4-3 5" />
    <circle cx="9" cy="8" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="13.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="10.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
