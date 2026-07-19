import React from "react";

// Lucide has no celery glyph — hand-drawn to match lucide's stroke language
// (24x24 viewBox, round caps, currentColor) so it sits flush with Wheat/Milk/etc.
export const CeleryIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21V10c0-2.5 1-4.5 2-6" />
    <path d="M12 21V9c0-2.5.8-4.3 1.8-6" />
    <path d="M15 21V10.5c0-2 .7-3.7 1.5-5.5" />
    <path d="M9 10c-1.5-.5-2.3-1.7-2.5-3" />
    <path d="M15 10.5c1.5-.4 2.3-1.6 2.6-2.9" />
  </svg>
);
