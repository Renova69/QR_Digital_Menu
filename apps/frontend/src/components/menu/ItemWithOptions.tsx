import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Item, MenuOption, OptionChoice } from "../../types";
import {
  useCart,
  type CartItem,
  type SelectedOption,
} from "../../context/CartContext";
import { useTranslation } from "react-i18next";
import { ImageLightbox } from "./ImageLightbox";
import {
  formatEuro,
  formatBgn,
  formatInlineDual,
  BGN_RATE,
} from "../../lib/currency";
import { getImageUrl as resolveImageUrl } from "../../lib/getImageUrl";
import { getTranslatedField, getTranslatedArray } from "../../lib/translation";
import { cn } from "../../lib/utils";
import { Check, X } from "lucide-react";
import { MenuTagBadges } from "./MenuTagBadges";

interface ItemWithOptionsProps {
  item: Item;
  perfectPairings?: Item[];
  ordersEnabled?: boolean;
  /**
   * The menu's selected target language (e.g. 'fr', 'it', 'ar'). Menu content
   * is translated against THIS, not the i18next UI locale — the UI only ships
   * en/bg/ro bundles, so keying menu translations off `i18n.language` silently
   * falls back to bg for every other target language. Defaults to the UI locale
   * for non-public-menu callers that don't pass a target language.
   */
  lang?: string;
}

export const ItemWithOptions: React.FC<ItemWithOptionsProps> = ({
  item,
  perfectPairings,
  ordersEnabled = true,
  lang,
}) => {
  const { addItem } = useCart();
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, SelectedOption>
  >({});
  const [showIntercept, setShowIntercept] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [pendingMainItem, setPendingMainItem] = useState<CartItem | null>(null);
  const [imageInView, setImageInView] = useState(!item.imageUrl);
  const { t, i18n } = useTranslation();
  const currentLang = lang || i18n.language;
  const priceEuro =
    item.currency === "BGN" ? item.price / BGN_RATE : item.price;
  const itemName =
    getTranslatedField(item, currentLang, "name") ||
    item.originalName ||
    item.name;
  const itemDesc =
    getTranslatedField(item, currentLang, "description") ||
    item.originalDescription ||
    item.description;
  const getChoiceLabel = (option: MenuOption, choice: OptionChoice) =>
    option.translations?.[currentLang]?.choices?.[choice.name] || choice.name;

  const showToast = (itemName: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(itemName);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2200);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!item.imageUrl) {
      setImageInView(false);
      return;
    }

    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setImageInView(true);
      return;
    }

    setImageInView(false);
    const el = cardRef.current;
    if (!el) {
      setImageInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setImageInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "360px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [item.id, item.imageUrl]);

  // Pre-select first VARIATION option
  useEffect(() => {
    if (!item.options?.length) return;
    setSelectedOptions((prev) => {
      const init: Record<string, SelectedOption> = { ...prev };
      item.options?.forEach((opt) => {
        if (
          opt.type === "VARIATION" &&
          opt.choices?.length > 0 &&
          !init[opt.id]
        ) {
          init[opt.id] = {
            optionId: opt.id,
            optionName: opt.name,
            choiceName: opt.choices[0].name,
            priceModifier: opt.choices[0].priceModifier ?? 0,
          };
        }
      });
      return init;
    });
  }, [item.id]);

  const preserveScrollPosition = () => {
    const y = window.scrollY;
    requestAnimationFrame(() => {
      window.scrollTo({ top: y });
    });
  };

  const getImageUrl = resolveImageUrl;

  const buildMainCartItem = () => {
    const optionsWithDetails = Object.entries(selectedOptions).map(
      ([optionId, choice]) => {
        const option = item.options?.find((o) => o.id === optionId);
        return {
          optionId: optionId,
          optionName: option?.name || "Option",
          choiceName: choice.choiceName,
          priceModifier: choice.priceModifier || 0,
          translations: (option?.translations as Record<string, any>) ?? null,
        };
      },
    );

    // Generate a unique ID for this specific combination of item + options
    const cartId =
      optionsWithDetails.length > 0
        ? `${item.id}-${optionsWithDetails.map((o) => `${o.optionId}:${o.choiceName}`).join("|")}`
        : item.id;

    return {
      cartId,
      id: item.id,
      name: item.originalName ?? item.name,
      originalName: item.originalName ?? item.name,
      // F-FE-1/F-FE-3: cart/order totals are EUR-only — normalize a
      // BGN-tagged item price (legacy/import data) rather than storing it
      // raw, which getTotal() would otherwise sum as if it were EUR.
      price: priceEuro,
      quantity: 1,
      selectedOptions: optionsWithDetails,
      itemTranslations: item.translations ?? null,
    } satisfies CartItem;
  };

  const handleAddToCart = () => {
    const mainCartItem = buildMainCartItem();

    // If item has options, show options modal first
    if (item.options && item.options.length > 0) {
      setPendingMainItem(mainCartItem);
      setShowOptionsModal(true);
      preserveScrollPosition();
      return;
    }

    // If pairings exist, open pairing modal first
    if (perfectPairings && perfectPairings.length > 0) {
      setPendingMainItem(mainCartItem);
      setShowIntercept(true);
      preserveScrollPosition();
      return;
    }
    addItem(mainCartItem);
    showToast(itemName);
    preserveScrollPosition();
  };

  const handleOptionsConfirm = () => {
    const mainCartItem = buildMainCartItem();
    setShowOptionsModal(false);

    if (perfectPairings && perfectPairings.length > 0) {
      setPendingMainItem(mainCartItem);
      setShowIntercept(true);
      preserveScrollPosition();
      return;
    }
    addItem(mainCartItem);
    showToast(itemName);
    preserveScrollPosition();
  };

  const handleOptionsCancel = () => {
    setShowOptionsModal(false);
    setPendingMainItem(null);
  };

  const handleOptionChoiceSelect = (
    option: MenuOption,
    choice: OptionChoice,
  ) => {
    setSelectedOptions((prev) => {
      if (option.type === "VARIATION") {
        // VARIATION: pick exactly one
        return {
          ...prev,
          [option.id]: {
            optionId: option.id,
            optionName: option.name,
            choiceName: choice.name,
            priceModifier: choice.priceModifier ?? 0,
          },
        };
      }
      // ADDON: toggle on/off
      const current = prev[option.id];
      if (current && current.choiceName === choice.name) {
        const { [option.id]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [option.id]: {
          optionId: option.id,
          optionName: option.name,
          choiceName: choice.name,
          priceModifier: choice.priceModifier ?? 0,
        },
      };
    });
  };

  const handlePairingAction = (pairing?: Item) => {
    if (pendingMainItem) {
      addItem(pendingMainItem);
    }
    if (pairing) {
      const pairingName =
        getTranslatedField(pairing, currentLang, "name") ?? pairing.name;
      addItem({
        id: pairing.id,
        name: pairing.originalName ?? pairing.name,
        originalName: pairing.originalName ?? pairing.name,
        // F-FE-1/F-FE-3: same EUR normalization as buildMainCartItem — the
        // pairing upsell item can carry a BGN-tagged price too.
        price:
          pairing.currency === "BGN" ? pairing.price / BGN_RATE : pairing.price,
        quantity: 1,
        selectedOptions: [],
        itemTranslations: pairing.translations ?? null,
        cartId: `${pairing.id}-${Date.now()}`,
      });
      showToast(`${itemName} + ${pairingName}`);
    } else {
      showToast(itemName);
    }
    setPendingMainItem(null);
    setShowIntercept(false);
    preserveScrollPosition();
  };

  return (
    <>
      <div
        ref={cardRef}
        className="glass-panel glass-panel-hover p-4 rounded-[2.5rem] flex gap-3 shadow-2xl relative overflow-hidden group border-white/5 animate-in slide-in-from-bottom-4 duration-500"
        style={{
          backgroundColor: "var(--theme-card, inherit)",
          contentVisibility: "auto",
          containIntrinsicSize: "160px",
        }}
      >
        {/* Image — left side */}
        <div
          className="w-[34%] aspect-square self-center rounded-2xl overflow-hidden shrink-0 cursor-zoom-in"
          onClick={() => item.imageUrl && setLightboxOpen(true)}
        >
          {item.imageUrl && imageInView ? (
            <img
              src={getImageUrl(item.imageUrl)}
              alt={itemName}
              loading="lazy"
              decoding="async"
              sizes="(min-width: 768px) 160px, 34vw"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/10">
              <span className="text-4xl font-display font-black text-primary/40">
                {itemName?.[0] ?? "?"}
              </span>
            </div>
          )}
        </div>

        {/* Content — right side */}
        <div className="flex-1 flex flex-col min-w-0 z-10">
          {/* Name — full line */}
          <h3
            className="text-base font-display font-black tracking-tight leading-[1.1]"
            style={{
              fontFamily: "var(--font-heading, inherit)",
              color: "var(--theme-text, inherit)",
            }}
          >
            {itemName}
          </h3>

          {itemDesc && (
            <p className="text-sm text-muted-foreground font-medium leading-relaxed mt-1 line-clamp-2 break-words">
              {/* Add a <wbr> break opportunity after each comma/semicolon/slash
                            so a spaceless list ("tomato,cucumber,cheese") wraps whole
                            words to the next line instead of splitting mid-word. */}
              {itemDesc.split(/(?<=[,;/])/).map((seg, i) => (
                <React.Fragment key={i}>
                  {seg}
                  <wbr />
                </React.Fragment>
              ))}
            </p>
          )}

          {/* Dietary & Allergens — icons w/ hover/tap tooltip; preset tags
              resolve to a localized name, legacy free text falls back to the
              stored translated label. */}
          {item.dietaryTags?.length || item.allergens?.length ? (
            <MenuTagBadges
              className="mt-1.5"
              dietaryTags={item.dietaryTags ?? []}
              allergens={item.allergens ?? []}
              dietaryLabels={
                getTranslatedArray(item, currentLang, "dietaryTags") ||
                item.dietaryTags ||
                []
              }
              allergenLabels={
                getTranslatedArray(item, currentLang, "allergens") ||
                item.allergens ||
                []
              }
            />
          ) : null}

          {/* Price + Add Button — always pinned to the card's bottom edge
              (price bottom-left, button bottom-right) so both line up across
              every card regardless of content; any slack from a missing
              description/tags collapses into the middle, not below the CTA. */}
          <div className="mt-auto pt-3 flex items-center justify-between gap-2">
            <div className="shrink-0 leading-tight">
              <div
                className="font-black text-base"
                style={{
                  color: "var(--theme-text, inherit)",
                  fontFamily: "var(--font-body, inherit)",
                }}
              >
                {formatEuro(priceEuro)}
              </div>
              <div className="text-[11px] text-muted-foreground font-medium">
                {formatBgn(priceEuro)}
              </div>
            </div>
            {ordersEnabled && (
              <button
                onClick={handleAddToCart}
                className="group/btn relative flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-xl transition-all hover:-translate-y-1 active:scale-[0.97]"
                style={{
                  background: "var(--gradient-brand)",
                  color: "var(--brand-contrast, #fff)",
                }}
              >
                <span className="relative z-10">
                  {t("publicMenu.addShort", "+ Add")}
                </span>
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
              </button>
            )}
          </div>
        </div>

        {/* Add-to-cart toast confirmation */}
        {toastMessage && (
          <div
            role="status"
            className="absolute bottom-4 left-4 right-4 z-30 px-5 py-3 rounded-2xl shadow-2xl border border-emerald-500/20"
            style={{
              background:
                "linear-gradient(135deg, rgba(16,185,129,0.95) 0%, rgba(5,150,105,0.95) 100%)",
              animation:
                "toastSlideUp 0.35s cubic-bezier(0.16,1,0.3,1), toastFadeOut 0.4s ease 1.8s forwards",
            }}
          >
            <p className="text-white font-bold text-[11px] uppercase tracking-[0.1em] truncate">
              {toastMessage}
            </p>
            <p className="text-white/70 text-[9px] font-semibold uppercase tracking-[0.15em] mt-0.5">
              {t("publicMenu.addedToCart", "Added to cart")}
            </p>
          </div>
        )}
      </div>

      {/* Perfect Pairing Modal Portal */}
      {showIntercept &&
        perfectPairings &&
        perfectPairings.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300"
              onClick={() => handlePairingAction(undefined)}
            />

            {/* Modal */}
            <div className="relative w-full max-w-3xl bg-zinc-900 border border-white/10 shadow-2xl rounded-[3rem] overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-primary/20 blur-[120px] pointer-events-none" />

              <div className="relative z-10 p-8 sm:p-12 flex flex-col md:flex-row gap-10">
                <div className="flex-1 flex flex-col justify-center text-center md:text-left">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/20 border border-primary/30 w-fit mx-auto md:mx-0 mb-6">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-foreground">
                      {t("publicMenu.pairing.title")}
                    </span>
                  </div>

                  <h3 className="text-4xl sm:text-5xl font-display font-black text-white tracking-tighter leading-[0.95] mb-6">
                    {t("publicMenu.pairing.completeYour", { name: item.name })}
                  </h3>

                  <p className="text-zinc-400 text-sm font-medium leading-relaxed mb-8 max-w-[280px] mx-auto md:mx-0">
                    {t("publicMenu.pairing.chefDescription")}
                  </p>

                  <button
                    onClick={() => handlePairingAction(undefined)}
                    className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 hover:text-white transition-colors text-center md:text-left"
                  >
                    {t("publicMenu.pairing.noThanks")}
                  </button>
                </div>

                <div className="flex-1 space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {perfectPairings.map((pairing) => {
                    const pairingName =
                      getTranslatedField(pairing, currentLang, "name") ||
                      pairing.name;

                    return (
                      <div
                        key={`intercept-${pairing.id}`}
                        className="group relative bg-white/5 hover:bg-white/10 rounded-[2rem] p-4 border border-white/5 transition-all duration-300"
                      >
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-black shadow-xl border border-white/10 group-hover:scale-105 transition-transform duration-300">
                            {pairing.imageUrl ? (
                              <img
                                src={getImageUrl(pairing.imageUrl)}
                                alt={pairingName}
                                loading="lazy"
                                decoding="async"
                                sizes="64px"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-primary/10">
                                <span className="text-xl font-display font-black text-primary">
                                  {pairingName?.[0] ?? "?"}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex-grow min-w-0">
                            <h4 className="text-lg font-display font-bold text-white leading-tight truncate">
                              {pairingName}
                            </h4>
                            <p className="text-primary font-black text-sm mt-1">
                              +
                              {formatInlineDual(
                                pairing.price,
                                pairing.currency,
                              )}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handlePairingAction(pairing)}
                          className="min-h-[44px] w-full py-3.5 rounded-[1.25rem] bg-white text-black font-black uppercase text-[9px] tracking-[0.2em] transition-all hover:bg-primary hover:text-white"
                        >
                          {t("publicMenu.pairing.addToOrder")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {/* Options Selection Modal */}
      {showOptionsModal &&
        item.options &&
        item.options.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={handleOptionsCancel}
            />

            {/* Modal — bottom sheet on mobile, centered on desktop */}
            <div className="relative w-full sm:max-w-md bg-zinc-900 border border-white/10 shadow-2xl rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden animate-in slide-in-from-bottom-4 zoom-in-95 duration-250 max-h-[85vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-display font-black text-white truncate">
                    {itemName}
                  </h3>
                  <p className="text-xs text-zinc-400 font-medium mt-0.5">
                    {t("publicMenu.customizeOptions", "Customize your order")}
                  </p>
                </div>
                <button
                  onClick={handleOptionsCancel}
                  className="ml-3 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full bg-white/10 text-zinc-400 transition hover:bg-white/20 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Options list */}
              <div className="overflow-y-auto px-6 py-2 space-y-5">
                {item.options.map((option) => {
                  const translatedOptName =
                    getTranslatedField(option, currentLang, "name") ||
                    option.name;
                  const choices: OptionChoice[] = option.choices;

                  return (
                    <div key={option.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-black text-white">
                          {translatedOptName}
                        </span>
                        <span
                          className={cn(
                            "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded",
                            option.type === "VARIATION"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-blue-500/10 text-blue-400",
                          )}
                        >
                          {option.type === "VARIATION"
                            ? t("publicMenu.pickOne", "Pick one")
                            : t("publicMenu.optional", "Optional")}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {choices.map((choice, idx) => {
                          const choiceLabel = getChoiceLabel(option, choice);
                          const isSelected =
                            selectedOptions[option.id]?.choiceName ===
                            choice.name;
                          return (
                            <button
                              key={`${choice.name}-${idx}`}
                              type="button"
                              onClick={() =>
                                handleOptionChoiceSelect(option, choice)
                              }
                              className={cn(
                                "flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left transition active:scale-[0.99]",
                                "min-h-[44px]",
                                isSelected
                                  ? "bg-primary/20 border border-primary/40 text-white"
                                  : "bg-white/5 border border-transparent text-zinc-300 hover:bg-white/10",
                              )}
                            >
                              <span className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    "flex h-5 w-5 items-center justify-center rounded-full border-2 transition",
                                    option.type === "VARIATION"
                                      ? isSelected
                                        ? "border-primary bg-primary"
                                        : "border-zinc-500"
                                      : isSelected
                                        ? "border-primary bg-primary"
                                        : "border-zinc-500",
                                  )}
                                >
                                  {isSelected && (
                                    <Check className="h-3 w-3 text-white" />
                                  )}
                                </span>
                                <span className="text-sm font-bold">
                                  {choiceLabel}
                                </span>
                              </span>
                              {choice.priceModifier > 0 && (
                                <span className="text-xs font-bold text-primary">
                                  +{formatEuro(choice.priceModifier)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer with add button */}
              <div className="px-6 pt-3 pb-6">
                <button
                  onClick={handleOptionsConfirm}
                  className="min-h-[48px] w-full py-3.5 rounded-[1.25rem] font-black uppercase text-xs tracking-[0.15em] transition-all active:scale-[0.98] shadow-xl"
                  style={{
                    background: "var(--gradient-brand)",
                    color: "var(--brand-contrast, #fff)",
                  }}
                >
                  {t("publicMenu.addToCart", "Add to Cart")}
                  {" — "}
                  {formatEuro(
                    priceEuro +
                      Object.values(selectedOptions).reduce(
                        (sum, c) => sum + (c.priceModifier || 0),
                        0,
                      ),
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {/* Image Lightbox */}
      {lightboxOpen && item.imageUrl && (
        <ImageLightbox
          src={getImageUrl(item.imageUrl)}
          alt={item.name}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
};
