import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { usePos } from "../../context/PosContext";

interface MenuOption {
  id: string;
  name: string;
  type: "VARIATION" | "ADDON";
  required: boolean;
  choices: Array<{ name: string; priceModifier: number }>;
}

interface ItemWithOptions {
  id: string;
  name: string;
  price: number;
  options?: MenuOption[];
}

export default function PosOptionsDrawer() {
  const { t } = useTranslation();
  const { addItem, activeSeat } = usePos();
  const [item, setItem] = useState<ItemWithOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [selections, setSelections] = useState<
    Record<string, { choiceName: string; priceModifier: number }>
  >({});
  const [itemNote, setItemNote] = useState("");

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ItemWithOptions;
      setItem(detail);
      setOpen(true);
      const defaults: Record<string, { choiceName: string; priceModifier: number }> = {};
      for (const opt of detail.options ?? []) {
        if (opt.required && opt.choices.length > 0) {
          defaults[opt.id] = {
            choiceName: opt.choices[0].name,
            priceModifier: opt.choices[0].priceModifier,
          };
        }
      }
      setSelections(defaults);
      setItemNote("");
    };
    window.addEventListener("pos:open-options", handler);
    return () => window.removeEventListener("pos:open-options", handler);
  }, []);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
  };

  const handleChoice = (
    optionId: string,
    _optionName: string,
    choiceName: string,
    priceModifier: number
  ) => {
    setSelections((prev) => ({
      ...prev,
      [optionId]: { choiceName, priceModifier },
    }));
  };

  const handleAddToCart = () => {
    if (!item) return;

    const selectedOptions = Object.entries(selections).map(
      ([optionId, sel]) => {
        const opt = item.options?.find((o) => o.id === optionId);
        return {
          optionId,
          optionName: opt?.name ?? "",
          choiceName: sel.choiceName,
          priceModifier: sel.priceModifier,
        };
      }
    );

    addItem({
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      selectedOptions,
      seatNumber: activeSeat,
      itemNote,
    });

    setOpen(false);
  };

  const optionsPrice = Object.values(selections).reduce(
    (sum, s) => sum + (s.priceModifier || 0),
    0
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        {item && (
          <>
            <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
            <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-xl bg-background p-6 pb-safe">
              <Dialog.Title className="text-lg font-semibold mb-1">
                {item.name}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mb-4">
                €{item.price.toFixed(2)}
              </Dialog.Description>

              {item.options?.map((opt) => (
                <div key={opt.id} className="mb-4">
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    {opt.name}
                    {opt.required && (
                      <span className="ml-1 text-destructive">*</span>
                    )}
                  </label>
                  {opt.type === "VARIATION" ? (
                    <div className="flex flex-wrap gap-2">
                      {opt.choices.map((choice) => {
                        const isSelected =
                          selections[opt.id]?.choiceName === choice.name;
                        return (
                          <button
                            key={choice.name}
                            type="button"
                            onClick={() =>
                              handleChoice(
                                opt.id,
                                opt.name,
                                choice.name,
                                choice.priceModifier
                              )
                            }
                            className={`px-3 py-2 rounded-lg text-sm min-h-[44px] transition-none ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-card border border-border text-foreground"
                            }`}
                          >
                            {choice.name}
                            {choice.priceModifier > 0 &&
                              ` +€${choice.priceModifier.toFixed(2)}`}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {opt.choices.map((choice) => {
                        const isSelected =
                          selections[opt.id]?.choiceName === choice.name;
                        return (
                          <button
                            key={choice.name}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelections((prev) => {
                                  const { [opt.id]: _, ...rest } = prev;
                                  return rest;
                                });
                              } else {
                                setSelections((prev) => ({
                                  ...prev,
                                  [opt.id]: {
                                    choiceName: choice.name,
                                    priceModifier: choice.priceModifier,
                                  },
                                }));
                              }
                            }}
                            className={`px-3 py-2 rounded-lg text-sm min-h-[44px] transition-none ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-card border border-border text-foreground"
                            }`}
                          >
                            {choice.name}
                            {choice.priceModifier > 0 &&
                              ` +€${choice.priceModifier.toFixed(2)}`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  {t("pos.itemNote", "Item Note")}
                </label>
                <input
                  type="text"
                  value={itemNote}
                  onChange={(e) => setItemNote(e.target.value)}
                  placeholder={t("pos.notePlaceholder", "e.g. no salt, extra sauce...")}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                className="w-full py-3 rounded-lg brand-cta font-semibold text-sm min-h-[44px]"
              >
                {t("pos.addToCart", { total: (item.price + optionsPrice).toFixed(2) })}
              </button>
            </Dialog.Content>
          </>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
