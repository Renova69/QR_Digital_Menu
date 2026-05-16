import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** CSS border-radius. Defaults to 2.5rem */
  radius?: string;
  /** Optional click handler — adds cursor-pointer & hover effect */
  onClick?: () => void;
}

/**
 * Glass-morphism card used as the base surface primitive across the dashboard.
 * Combines the `glass-panel` utility with consistent padding, border radius,
 * and an animated accent bar on hover.
 */
export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  radius = '2.5rem',
  onClick,
}) => {
  return (
    <div
      className={`glass-panel border-white/5 transition-all duration-500 ${onClick ? 'cursor-pointer hover:shadow-xl active:scale-[0.98]' : ''} ${className}`}
      style={{ borderRadius: radius }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      {children}
    </div>
  );
};
