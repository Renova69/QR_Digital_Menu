import React from "react";

/**
 * Shared section wrapper for analytics panels — eyebrow + title + optional
 * action chip over a bordered card. Extracted from AnalyticsView so individual
 * panels (e.g. MenuProfitabilityPanel) can render and be tested in isolation.
 */
export const Panel = ({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow: string;
  action?: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
    <div className="mb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-2">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-primary">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-lg font-display font-black text-foreground">
          {title}
        </h3>
      </div>
      {action && (
        <span className="rounded-md bg-secondary px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
          {action}
        </span>
      )}
    </div>
    {children}
  </div>
);

export default Panel;
