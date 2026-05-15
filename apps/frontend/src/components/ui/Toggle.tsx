import { useId } from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  size?: "sm" | "default";
}

export function Toggle({ checked, onChange, label, size = "default" }: ToggleProps) {
  const id = useId();
  const h = size === "sm" ? "h-5" : "h-6";
  const w = size === "sm" ? "w-9" : "w-10";
  const knob = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`${w} ${h} rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
        checked ? "bg-accent" : "bg-zinc-300 dark:bg-zinc-700"
      }`}
    >
      <div
        className={`${knob} bg-white rounded-full transition-transform ${
          checked ? "translate-x-[calc(100%+0.125rem)]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
