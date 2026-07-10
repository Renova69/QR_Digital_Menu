import React, { useState, useEffect } from "react";
import {
  Smartphone,
  Monitor,
  Sun,
  Moon,
  ShoppingCart,
  List,
  Tag,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BrandPalette } from "./ThemePresets";
import { getReadableTextColor } from "../../utils/colors";
import { getDisplayUrl } from "../../lib/imageUrl";

interface BrandingPreviewProps {
  fontHeading: string;
  fontBody: string;
  lightPalette: BrandPalette;
  darkPalette: BrandPalette;
  restaurantName?: string;
  logoUrl?: string | null;
  defaultTheme?: "light" | "dark";
}

type Scene = "card" | "category" | "cart";
type Device = "mobile" | "desktop";

const SCENE_KEYS = [
  {
    id: "card" as const,
    icon: Tag,
    labelKey: "branding.previewCard",
    fallback: "Card",
  },
  {
    id: "category" as const,
    icon: List,
    labelKey: "branding.previewCategory",
    fallback: "Category",
  },
  {
    id: "cart" as const,
    icon: ShoppingCart,
    labelKey: "branding.previewCart",
    fallback: "Cart",
  },
];

export const BrandingPreview: React.FC<BrandingPreviewProps> = ({
  fontHeading,
  fontBody,
  lightPalette,
  darkPalette,
  restaurantName = "Your Restaurant",
  logoUrl,
  defaultTheme = "light",
}) => {
  const [scene, setScene] = useState<Scene>("card");
  const [device, setDevice] = useState<Device>("mobile");
  const [themeMode, setThemeMode] = useState<"light" | "dark">(defaultTheme);
  const { t } = useTranslation();

  // Sync phone chrome when parent defaultTheme toggle changes
  useEffect(() => {
    setThemeMode(defaultTheme);
  }, [defaultTheme]);

  const palette = themeMode === "dark" ? darkPalette : lightPalette;
  const bg = palette.bg;
  const text = palette.text;
  const card = palette.card;
  const accent = palette.accent;
  const accentText = getReadableTextColor(accent);

  const CardScene = (
    <div className="p-4 space-y-3">
      <div className="flex flex-col items-center mb-3">
        <h2
          className="text-sm font-bold tracking-tight mb-1.5"
          style={{ fontFamily: fontHeading, color: text }}
        >
          {t("branding.previewSignatureDishes", "Signature Dishes")}
        </h2>
        <div
          className="w-6 h-0.5 rounded-full"
          style={{ backgroundColor: accent }}
        />
      </div>
      <div
        className="rounded-xl overflow-hidden shadow-sm"
        style={{ backgroundColor: card }}
      >
        <div
          className="w-full h-20 flex items-center justify-center"
          style={{ backgroundColor: `${text}0D` }}
        >
          <svg
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke={text}
            opacity={0.15}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div className="p-3">
          <div className="flex justify-between items-start mb-1">
            <h3
              className="text-xs font-bold"
              style={{ fontFamily: fontHeading, color: text }}
            >
              {t("branding.previewDishName", "Truffle Burrata")}
            </h3>
            <span
              className="text-xs font-black"
              style={{ color: accent, fontFamily: fontBody }}
            >
              €18
            </span>
          </div>
          <p
            className="text-[10px] leading-relaxed mb-2.5"
            style={{ fontFamily: fontBody, color: text, opacity: 0.65 }}
          >
            {t(
              "branding.previewDishDesc",
              "Fresh burrata with black truffle shavings and aged balsamic.",
            )}
          </p>
          <button
            className="w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider"
            style={{
              backgroundColor: accent,
              color: accentText,
              fontFamily: fontBody,
            }}
          >
            {t("branding.previewAddToOrder", "Add to order")}
          </button>
        </div>
      </div>
    </div>
  );

  const categoryLabels = [
    t("branding.previewStarters", "Starters"),
    t("branding.previewMains", "Mains"),
    t("branding.previewDesserts", "Desserts"),
    t("branding.previewDrinks", "Drinks"),
  ];

  const CategoryScene = (
    <div className="p-4 space-y-1.5">
      {categoryLabels.map((cat, i) => (
        <div
          key={cat}
          className="flex items-center justify-between px-3 py-2 rounded-lg"
          style={{
            backgroundColor: i === 0 ? `${accent}1A` : card,
            border: `1px solid ${i === 0 ? `${accent}33` : `${text}0D`}`,
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold"
              style={{
                backgroundColor: i === 0 ? accent : `${text}1A`,
                color: i === 0 ? accentText : text,
              }}
            >
              {cat[0]}
            </div>
            <span
              className="text-[10px] font-semibold"
              style={{ fontFamily: fontBody, color: i === 0 ? accent : text }}
            >
              {cat}
            </span>
          </div>
          <span
            className="text-[9px]"
            style={{ color: text, fontFamily: fontBody, opacity: 0.45 }}
          >
            {4 + i * 3}
          </span>
        </div>
      ))}
    </div>
  );

  const cartItems = [
    t("branding.previewItem1", "Truffle Burrata"),
    t("branding.previewItem2", "Grilled Salmon"),
  ];

  const CartScene = (
    <div className="p-4 space-y-3">
      <h3
        className="text-xs font-bold mb-2"
        style={{ fontFamily: fontHeading, color: text }}
      >
        {t("branding.previewYourOrder", "Your Order")}
      </h3>
      {cartItems.map((item, i) => (
        <div
          key={item}
          className="flex items-center justify-between py-1.5 border-b"
          style={{ borderColor: `${text}0F` }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-md flex items-center justify-center text-[8px] font-bold flex-shrink-0"
              style={{ backgroundColor: accent, color: accentText }}
            >
              {i + 1}
            </div>
            <span
              className="text-[10px] font-medium"
              style={{ fontFamily: fontBody, color: text }}
            >
              {item}
            </span>
          </div>
          <span className="text-[10px] font-bold" style={{ color: accent }}>
            €{18 + i * 4}
          </span>
        </div>
      ))}
      <div className="flex justify-between pt-1">
        <span
          className="text-[10px] font-semibold"
          style={{ color: text, fontFamily: fontBody }}
        >
          {t("branding.previewTotal", "Total")}
        </span>
        <span className="text-xs font-black" style={{ color: accent }}>
          €40.00
        </span>
      </div>
      <button
        className="w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-wider"
        style={{
          backgroundColor: accent,
          color: accentText,
          fontFamily: fontBody,
        }}
      >
        {t("branding.previewPlaceOrder", "Place Order")}
      </button>
    </div>
  );

  const sceneContent: Record<Scene, React.ReactNode> = {
    card: CardScene,
    category: CategoryScene,
    cart: CartScene,
  };

  const menuHeader = (compact = false) => (
    <div
      className={`flex items-center justify-between border-b ${compact ? "px-4 py-2.5" : "px-5 py-3"}`}
      style={{ borderColor: `${text}12`, backgroundColor: bg }}
    >
      {logoUrl ? (
        <img
          src={getDisplayUrl(logoUrl)}
          alt={restaurantName}
          className={`object-contain ${compact ? "h-6" : "h-8"}`}
        />
      ) : (
        <span
          className={`font-bold ${compact ? "text-xs" : "text-sm"}`}
          style={{ fontFamily: fontHeading, color: text }}
        >
          {restaurantName}
        </span>
      )}
      <div
        className={`rounded-full flex items-center justify-center ${compact ? "w-5 h-5" : "w-6 h-6"}`}
        style={{ backgroundColor: `${accent}20` }}
      >
        <div
          className={`rounded-full ${compact ? "w-1.5 h-1.5" : "w-2 h-2"}`}
          style={{ backgroundColor: accent }}
        />
      </div>
    </div>
  );

  const MobilePreview = (
    <div className="relative mx-auto" style={{ width: "200px" }}>
      <div
        className="relative rounded-[2.2rem] p-[5px] shadow-2xl"
        style={{
          backgroundColor: themeMode === "dark" ? "#1a1a1a" : "#2d2d2d",
        }}
      >
        <div
          className="absolute top-2.5 left-1/2 -translate-x-1/2 w-12 h-3 rounded-full z-10"
          style={{
            backgroundColor: themeMode === "dark" ? "#1a1a1a" : "#2d2d2d",
          }}
        />
        <div
          className="rounded-[1.8rem] overflow-hidden"
          style={{ backgroundColor: bg, minHeight: "340px" }}
        >
          <div
            className="flex items-center justify-between px-4 pt-5 pb-1"
            style={{ backgroundColor: bg }}
          >
            <span className="text-[8px] font-bold" style={{ color: text }}>
              9:41
            </span>
            <div className="flex gap-0.5 items-center">
              <div
                className="w-2.5 h-1.5 rounded-sm"
                style={{ backgroundColor: text, opacity: 0.5 }}
              />
              <div
                className="w-1 h-1.5 rounded-sm"
                style={{ backgroundColor: text, opacity: 0.3 }}
              />
            </div>
          </div>
          {menuHeader(true)}
          {sceneContent[scene]}
        </div>
      </div>
    </div>
  );

  const DesktopPreview = (
    <div
      className="rounded-xl border border-border shadow-md overflow-hidden"
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-muted/60">
        <div className="w-2 h-2 rounded-full bg-red-400/80" />
        <div className="w-2 h-2 rounded-full bg-yellow-400/80" />
        <div className="w-2 h-2 rounded-full bg-green-400/80" />
        <div className="flex-1 mx-2 h-4 bg-background rounded text-[8px] flex items-center px-2 text-muted-foreground font-mono overflow-hidden">
          {restaurantName.toLowerCase().replace(/\s+/g, "")}
          {t("auto.Menu", ".menu")}
        </div>
      </div>
      {menuHeader(false)}
      {sceneContent[scene]}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-0.5 bg-muted rounded-lg p-1">
          {SCENE_KEYS.map(({ id, icon: Icon, labelKey, fallback }) => {
            const label = t(labelKey, fallback);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setScene(id)}
                aria-label={label}
                aria-pressed={scene === id}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                  scene === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={9} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <div className="flex gap-0.5 bg-muted rounded-lg p-1">
            <button
              type="button"
              onClick={() => setDevice("mobile")}
              aria-label={t("branding.previewMobile", "Mobile")}
              aria-pressed={device === "mobile"}
              className={`p-1.5 rounded-md transition-all ${
                device === "mobile"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone size={11} />
            </button>
            <button
              type="button"
              onClick={() => setDevice("desktop")}
              aria-label={t("branding.previewDesktop", "Desktop")}
              aria-pressed={device === "desktop"}
              className={`p-1.5 rounded-md transition-all ${
                device === "desktop"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor size={11} />
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              setThemeMode((m) => (m === "light" ? "dark" : "light"))
            }
            aria-label={
              themeMode === "light"
                ? t("branding.previewDarkMode", "Preview dark mode")
                : t("branding.previewLightMode", "Preview light mode")
            }
            aria-pressed={themeMode === "dark"}
            className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            {themeMode === "light" ? <Moon size={11} /> : <Sun size={11} />}
          </button>
        </div>
      </div>

      <div className="transition-all duration-300">
        {device === "mobile" ? MobilePreview : DesktopPreview}
      </div>
    </div>
  );
};
