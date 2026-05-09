import { usePos } from "../../context/PosContext";

interface MenuOption {
  id: string;
  name: string;
  type: "VARIATION" | "ADDON";
  required: boolean;
  choices: Array<{ name: string; priceModifier: number }>;
}

interface PosItemCardProps {
  item: {
    id: string;
    name: string;
    price: number;
    options?: MenuOption[];
  };
}

export default function PosItemCard({ item }: PosItemCardProps) {
  const { addItem, activeSeat } = usePos();
  const hasOptions = item.options && item.options.length > 0;

  const handleTap = () => {
    if (hasOptions) {
      window.dispatchEvent(
        new CustomEvent("pos:open-options", { detail: item })
      );
    } else {
      addItem({
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        selectedOptions: [],
        seatNumber: activeSeat,
        itemNote: "",
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      className="h-20 w-full flex flex-col justify-center px-3 py-2 rounded-lg bg-card border border-border text-left transition-none active:bg-accent/10 min-h-[44px]"
    >
      <span className="text-sm font-medium text-foreground line-clamp-2 leading-tight">
        {item.name}
      </span>
      <span className="text-sm font-semibold text-accent mt-1">
        €{item.price.toFixed(2)}
      </span>
    </button>
  );
}
