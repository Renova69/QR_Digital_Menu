import React from "react";

// Kosher — circled "K", the conventional certification mark. Text is part of
// the glyph (not translated) since it's a fixed symbol, not a word.
export const KosherIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <text
      x="12"
      y="16.5"
      textAnchor="middle"
      fontSize="11"
      fontWeight="700"
      fill="currentColor"
      stroke="none"
      fontFamily="sans-serif"
    >
      K
    </text>
  </svg>
);
