import { usePos } from "../../context/PosContext";

const SEATS = ["Seat 1", "Seat 2", "Seat 3", "Shared"];

export default function PosSeatSelector() {
  const { activeSeat, setActiveSeat } = usePos();

  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-hide">
      {SEATS.map((seat) => (
        <button
          key={seat}
          type="button"
          onClick={() => setActiveSeat(seat)}
          className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] transition-none ${
            activeSeat === seat
              ? "bg-primary text-white"
              : "bg-card border border-border text-foreground"
          }`}
        >
          {seat}
        </button>
      ))}
    </div>
  );
}
