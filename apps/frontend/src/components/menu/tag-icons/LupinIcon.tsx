import React from "react";

// Lupin — legume pod, drawn distinct from lucide's rounder Bean (used for soy).
export const LupinIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 13c0-5 3-9 8-10 1 5-1 9-4 11" />
    <path d="M6 13c-1.5 3-1 6 1 8 3-1 5-3.5 5-7" />
    <circle cx="9.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="8" cy="16" r="0.8" fill="currentColor" stroke="none" />
  </svg>
);
