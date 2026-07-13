export const UPSELL_CONTEXTS = [
  "MORNING",
  "LUNCH",
  "EVENING",
  "LATE_NIGHT",
  "WEEKEND",
  "FRIDAY_NIGHT",
  "COLD",
  "HOT",
  "RAINY",
] as const;

export type UpsellContext = (typeof UPSELL_CONTEXTS)[number];

export const UPSELL_CONTEXT_OPTIONS: ReadonlyArray<{
  value: UpsellContext;
  label: string;
}> = [
  { value: "MORNING", label: "Morning" },
  { value: "LUNCH", label: "Lunch" },
  { value: "EVENING", label: "Evening" },
  { value: "LATE_NIGHT", label: "Late night" },
  { value: "WEEKEND", label: "Weekend" },
  { value: "FRIDAY_NIGHT", label: "Friday night" },
  { value: "COLD", label: "Cold weather" },
  { value: "HOT", label: "Hot weather" },
  { value: "RAINY", label: "Rainy weather" },
];
