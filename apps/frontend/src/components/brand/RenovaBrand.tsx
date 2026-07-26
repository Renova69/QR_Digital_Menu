import React from "react";

type RenovaBrandSize = "sm" | "md" | "lg";

interface RenovaMarkProps {
  className?: string;
  inverse?: boolean;
}

interface RenovaBrandProps extends RenovaMarkProps {
  size?: RenovaBrandSize;
  showDomain?: boolean;
  showTagline?: boolean;
}

const sizeStyles: Record<
  RenovaBrandSize,
  { mark: string; name: string; domain: string; tagline: string; gap: string }
> = {
  sm: {
    mark: "h-8 w-8",
    name: "text-[15px] tracking-[0.14em]",
    domain: "text-[8px] tracking-[0.22em]",
    tagline: "text-[7px] tracking-[0.18em]",
    gap: "gap-2",
  },
  md: {
    mark: "h-10 w-10",
    name: "text-lg tracking-[0.15em]",
    domain: "text-[9px] tracking-[0.24em]",
    tagline: "text-[8px] tracking-[0.2em]",
    gap: "gap-2.5",
  },
  lg: {
    mark: "h-14 w-14",
    name: "text-2xl tracking-[0.16em]",
    domain: "text-[11px] tracking-[0.26em]",
    tagline: "text-[9px] tracking-[0.22em]",
    gap: "gap-3",
  },
};

export const RenovaMark: React.FC<RenovaMarkProps> = ({
  className = "h-10 w-10",
  inverse = false,
}) => (
  <svg
    aria-hidden="true"
    className={className}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 12a4 4 0 0 1 4-4h17v8H16v32h32V35h8v17a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V12Z"
      className={inverse ? "fill-white" : "fill-[#0D1B2A] dark:fill-[#F5F7FA]"}
    />
    <path
      d="M19 29h17v17H19V29Zm6 6v5h5v-5h-5Z"
      className={inverse ? "fill-white" : "fill-[#0D1B2A] dark:fill-[#F5F7FA]"}
      fillRule="evenodd"
      clipRule="evenodd"
    />
    <path
      d="M38.5 47c-3.8-10.8-1.8-24.1 8-34.8"
      stroke="#00B894"
      strokeWidth="4.5"
      strokeLinecap="round"
    />
    <path
      d="M42.5 23.8C43.2 14.3 50 8.1 59 8c.1 9.5-6.3 16.1-16.5 15.8Z"
      fill="#00B894"
    />
    <path
      d="M37.6 30.8c-7.9.1-13.1-4.5-13.8-12.2 8-.2 13.3 4.5 13.8 12.2Z"
      fill="#2ECC71"
    />
  </svg>
);

export const RenovaBrand: React.FC<RenovaBrandProps> = ({
  className = "",
  inverse = false,
  size = "md",
  showDomain = true,
  showTagline = false,
}) => {
  const styles = sizeStyles[size];
  const primaryText = inverse
    ? "text-white"
    : "text-[#0D1B2A] dark:text-[#F5F7FA]";

  return (
    <span
      className={`inline-flex items-center ${styles.gap} ${className}`}
      aria-label="Renova — renova.menu"
    >
      <RenovaMark className={`${styles.mark} shrink-0`} inverse={inverse} />
      <span className="flex min-w-0 flex-col">
        <span
          className={`${styles.name} ${primaryText} whitespace-nowrap font-black leading-none`}
        >
          RENOVA
        </span>
        {showDomain && (
          <span
            className={`${styles.domain} whitespace-nowrap font-bold leading-none text-[#00B894]`}
          >
            renova.menu
          </span>
        )}
        {showTagline && (
          <span
            className={`${styles.tagline} ${inverse ? "text-white/65" : "text-slate-500 dark:text-slate-400"} mt-1 whitespace-nowrap font-semibold uppercase leading-none`}
          >
            Digital menu platform
          </span>
        )}
      </span>
    </span>
  );
};
