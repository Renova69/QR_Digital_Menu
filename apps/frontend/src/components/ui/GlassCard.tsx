import React from "react";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  radius?: string;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = "",
  radius = "1.75rem",
  onClick,
}) => {
  return (
    <div
      className={`glass-panel transition-all duration-300 ${onClick ? "cursor-pointer hover:shadow-xl active:scale-[0.98]" : ""} ${className}`}
      style={{ borderRadius: radius }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
    >
      {children}
    </div>
  );
};
