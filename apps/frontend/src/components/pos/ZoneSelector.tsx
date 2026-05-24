import type { TableZone } from "../../lib/api";

interface ZoneSelectorProps {
  zones: TableZone[];
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string | null) => void;
}

export default function ZoneSelector({
  zones,
  selectedZoneId,
  onSelectZone,
}: ZoneSelectorProps) {
  if (zones.length <= 1) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none">
      {zones.map((zone) => (
        <button
          key={zone.id}
          type="button"
          onClick={() => onSelectZone(zone.id)}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors min-h-[40px] ${
            selectedZoneId === zone.id
              ? "bg-brand-cta text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {zone.name}
          {zone._count?.tables !== undefined && (
            <span className="ml-1.5 opacity-70 text-xs">
              ({zone._count.tables})
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
