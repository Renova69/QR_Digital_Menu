import React from "react";

// Sesame seeds — scattered small ellipses, distinct from MustardIcon's round
// filled dots and CeleryIcon's stalk lines.
export const SesameIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <ellipse
      cx="8"
      cy="9"
      rx="2.2"
      ry="1.3"
      transform="rotate(-20 8 9)"
      fill="currentColor"
      stroke="none"
    />
    <ellipse
      cx="15"
      cy="7.5"
      rx="2.2"
      ry="1.3"
      transform="rotate(15 15 7.5)"
      fill="currentColor"
      stroke="none"
    />
    <ellipse
      cx="12"
      cy="13"
      rx="2.2"
      ry="1.3"
      transform="rotate(-5 12 13)"
      fill="currentColor"
      stroke="none"
    />
    <ellipse
      cx="7"
      cy="16"
      rx="2.2"
      ry="1.3"
      transform="rotate(25 7 16)"
      fill="currentColor"
      stroke="none"
    />
    <ellipse
      cx="16"
      cy="16.5"
      rx="2.2"
      ry="1.3"
      transform="rotate(-15 16 16.5)"
      fill="currentColor"
      stroke="none"
    />
  </svg>
);
