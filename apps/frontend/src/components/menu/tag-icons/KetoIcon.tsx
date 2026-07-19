import React from "react";

// Keto — avocado silhouette (common diet-shorthand), no lucide equivalent.
export const KetoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3c3.5 0 6 3.8 6 8.5S15.5 21 12 21s-6-4.8-6-9.5S8.5 3 12 3Z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);
