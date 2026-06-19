import { useTranslation } from "react-i18next";
import { usePos } from "../../context/PosContext";

const SEAT_KEYS = ["Seat 1", "Seat 2", "Seat 3", "Shared"] as const;

const SEAT_LABEL_KEYS: Record<string, string> = {
  "Seat 1": "pos.seat1",
  "Seat 2": "pos.seat2",
  "Seat 3": "pos.seat3",
  Shared: "pos.seatShared",
};

export default function PosSeatSelector() {
  const { t } = useTranslation();
  const { activeSeat, setActiveSeat } = usePos();

  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-hide">
      {SEAT_KEYS.map((seat) => (
        <button
          key={seat}
          type="button"
          onClick={() => setActiveSeat(seat)}
          className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] transition-none ${
            activeSeat === seat
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground"
          }`}
        >
          {t(SEAT_LABEL_KEYS[seat], seat)}
        </button>
      ))}
    </div>
  );
}
