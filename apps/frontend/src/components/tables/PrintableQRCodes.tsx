import React from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { getMenuUrl } from "../../lib/menuUrl";

export type PrintTemplate = "classic" | "premium" | "minimal";
export type PrintOrientation = "portrait" | "landscape";

interface PrintableQRCodesProps {
  restaurant: any;
  tables: any[];
  template?: PrintTemplate;
  orientation?: PrintOrientation;
  // The server-frozen slug commit, or null while none has been requested
  // (or one is still in flight) for this session. On success every QR
  // value below is built from `committed.slug`, never from
  // `restaurant.slug` — see the gating note above the portal content
  // further down. On failure (commitError) the grid still renders, using
  // the permanent legacy id URL instead.
  committed: { slug: string; committedAt: string } | null;
  commitError?: boolean;
}

function resolveLogoUrl(restaurant: any): string | null {
  if (!restaurant.logoUrl) return null;
  return restaurant.logoUrl.startsWith("http")
    ? restaurant.logoUrl
    : `${(import.meta as any).env.VITE_API_URL || "http://localhost:3000/api"}`.replace(
        "/api",
        "",
      ) + `/${restaurant.logoUrl}`;
}

function getQrCodeUrl(restaurant: any, tableName: string): string {
  return getMenuUrl(restaurant, { table: tableName });
}

// ------------------------------------------------------------------
// Classic template — white card, dashed border, logo + QR + table name
// ------------------------------------------------------------------
function ClassicCard({
  restaurant,
  table,
  logoUrl,
  t,
}: {
  restaurant: any;
  table: any;
  logoUrl: string | null;
  t: TFunction;
}) {
  const accent = restaurant.accentColor || "#111111";
  return (
    <div
      style={{
        border: "2px dashed #d1d5db",
        borderRadius: 16,
        padding: "12px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {logoUrl && (
        <img
          src={logoUrl}
          alt={t("auto.logo", "logo")}
          style={{ height: 28, objectFit: "contain", marginBottom: 6 }}
        />
      )}
      <h2
        style={{
          fontFamily: "Georgia, serif",
          fontSize: 13,
          fontWeight: 900,
          color: accent,
          textAlign: "center",
          margin: "0 0 2px",
          lineHeight: 1.2,
        }}
      >
        {restaurant.name}
      </h2>
      <p
        style={{
          fontSize: 6,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#9ca3af",
          margin: "0 0 8px",
          textAlign: "center",
        }}
      >
        {t("tables.printScanPrompt")}
      </p>
      <div
        style={{
          background: "#fff",
          borderRadius: 10,
          padding: 8,
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          marginBottom: 8,
        }}
      >
        <QRCodeSVG
          value={getQrCodeUrl(restaurant, table.name)}
          size={120}
          fgColor={accent}
          bgColor="#ffffff"
          level="H"
          imageSettings={
            logoUrl
              ? { src: logoUrl, height: 24, width: 24, excavate: true }
              : undefined
          }
        />
      </div>
      <div
        style={{
          textAlign: "center",
          background: "#f9fafb",
          borderRadius: 8,
          padding: "4px 16px",
          width: "80%",
        }}
      >
        <p
          style={{
            fontSize: 6,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#9ca3af",
            margin: "0 0 1px",
          }}
        >
          {t("tables.printTableLabel")}
        </p>
        <p
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: "#111",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {table.name}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Premium template — dark background, accent QR, serif typography
// ------------------------------------------------------------------
function PremiumCard({
  restaurant,
  table,
  logoUrl,
  t,
}: {
  restaurant: any;
  table: any;
  logoUrl: string | null;
  t: TFunction;
}) {
  const accent = restaurant.accentColor || "#d4a853";
  return (
    <div
      style={{
        background: "#0f0e0c",
        borderRadius: 16,
        padding: "12px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Decorative corner accents */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          width: 14,
          height: 14,
          borderTop: `2px solid ${accent}`,
          borderLeft: `2px solid ${accent}`,
          borderRadius: "3px 0 0 0",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 14,
          height: 14,
          borderTop: `2px solid ${accent}`,
          borderRight: `2px solid ${accent}`,
          borderRadius: "0 3px 0 0",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          width: 14,
          height: 14,
          borderBottom: `2px solid ${accent}`,
          borderLeft: `2px solid ${accent}`,
          borderRadius: "0 0 0 3px",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          width: 14,
          height: 14,
          borderBottom: `2px solid ${accent}`,
          borderRight: `2px solid ${accent}`,
          borderRadius: "0 0 3px 0",
        }}
      />

      {logoUrl && (
        <img
          src={logoUrl}
          alt={t("auto.logo", "logo")}
          style={{
            height: 24,
            objectFit: "contain",
            marginBottom: 6,
            filter: "brightness(0) invert(1)",
          }}
        />
      )}
      <h2
        style={{
          fontFamily: "Georgia, serif",
          fontSize: 12,
          fontWeight: 900,
          color: "#ffffff",
          textAlign: "center",
          margin: "0 0 2px",
          letterSpacing: "0.02em",
          lineHeight: 1.2,
        }}
      >
        {restaurant.name}
      </h2>
      <div
        style={{
          width: 24,
          height: 1.5,
          background: accent,
          margin: "4px auto 8px",
          borderRadius: 2,
        }}
      />
      <div
        style={{
          background: "#ffffff",
          borderRadius: 10,
          padding: 8,
          marginBottom: 8,
        }}
      >
        <QRCodeSVG
          value={getQrCodeUrl(restaurant, table.name)}
          size={120}
          fgColor="#0f0e0c"
          bgColor="#ffffff"
          level="H"
          imageSettings={
            logoUrl
              ? { src: logoUrl, height: 24, width: 24, excavate: true }
              : undefined
          }
        />
      </div>
      <p
        style={{
          fontSize: 6,
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: accent,
          margin: "0 0 2px",
          textAlign: "center",
        }}
      >
        {t("tables.printTableLabel")}
      </p>
      <p
        style={{
          fontSize: 20,
          fontWeight: 900,
          color: "#ffffff",
          margin: 0,
          fontFamily: "Georgia, serif",
          letterSpacing: "0.05em",
          lineHeight: 1.1,
        }}
      >
        {table.name}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------
// Minimal template — bare QR + table name, ultra-clean
// ------------------------------------------------------------------
function MinimalCard({
  restaurant,
  table,
  t,
}: {
  restaurant: any;
  table: any;
  t: TFunction;
}) {
  const accent = restaurant.accentColor || "#111111";
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "14px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <QRCodeSVG
        value={getQrCodeUrl(restaurant, table.name)}
        size={130}
        fgColor={accent}
        bgColor="#ffffff"
        level="H"
      />
      <div style={{ marginTop: 8, textAlign: "center" }}>
        <p
          style={{
            fontSize: 6,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#9ca3af",
            margin: "0 0 2px",
            fontWeight: 700,
          }}
        >
          {restaurant.name} · {t("tables.printTableLabel")}
        </p>
        <p
          style={{
            fontSize: 24,
            fontWeight: 900,
            color: "#111",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {table.name}
        </p>
      </div>
    </div>
  );
}

/**
 * Print-only container rendered via React Portal directly into <body>.
 *
 * This avoids the 30% top-gap problem: without a portal the print container
 * lives deep inside the React tree (dashboard sidebar, content area, etc.).
 * Even with visibility:hidden those ancestors still occupy layout space,
 * pushing the print content down the page.
 *
 * By portalling into <body> we can use `body > *:not(.print-container)`
 * to fully collapse (display:none) every sibling, so nothing occupies space.
 *
 * Grid layout:
 *   Portrait  → 2 columns, ~6 cards per page  (cells ~90mm × 88mm)
 *   Landscape → 3 columns, ~6 cards per page  (cells ~88mm × 60mm)
 */
const PrintableQRCodes: React.FC<PrintableQRCodesProps> = ({
  restaurant,
  tables,
  template = "classic",
  orientation = "portrait",
  committed,
  commitError = false,
}) => {
  const { t } = useTranslation();
  if (!tables || tables.length === 0) return null;
  const logoUrl = resolveLogoUrl(restaurant);

  const cols = orientation === "landscape" ? 3 : 2;
  const pageSize = orientation === "landscape" ? "A4 landscape" : "A4 portrait";

  // This sheet is mounted the moment the QR tab is open — well before the
  // owner presses "Print all QR codes" — because it has to already be in
  // the DOM for the browser's print pipeline to pick it up. That means a
  // bare Ctrl+P (bypassing the button entirely) would print whatever is
  // sitting in `.print-container` at that instant. So the container itself
  // must never hold real QR codes until the commit has actually settled —
  // one way or the other — server-side; until then it holds a placeholder
  // that's safe to print (no codes, nothing that could point somewhere
  // else next week).
  //
  // Once the commit settles there are two safe outcomes, not one: success
  // freezes `committed.slug` and every QR value is built from that, never
  // from `restaurant.slug` off the prop, so the sheet can't disagree with
  // what the server just froze. Failure falls back to the legacy
  // `/menu/public/:id` URL — no slug segment, so it can never go stale —
  // rather than leaving the owner with an unprintable sheet. Only the
  // genuinely-still-pending state (neither committed nor errored yet) gets
  // the placeholder.
  const restaurantForUrl = committed
    ? { ...restaurant, slug: committed.slug }
    : commitError
      ? { ...restaurant, slug: null }
      : restaurant;
  const showGrid = Boolean(committed) || commitError;

  const content = (
    <div className="print-container" style={{ display: "none" }}>
      <style>{`
        @page { size: ${pageSize}; margin: 10mm; }
        @media print {
          /* Collapse every sibling of the portal container */
          body > *:not(.print-container) {
            display: none !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .print-container {
            display: block !important;
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .qr-grid {
            display: grid !important;
            grid-template-columns: repeat(${cols}, 1fr);
            gap: 6px;
            width: 100%;
          }
          .qr-grid-cell {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
      {showGrid ? (
        <div
          className="qr-grid"
          data-testid="printable-qr-grid"
          data-template={template}
        >
          {tables.map((table) => (
            <div className="qr-grid-cell" key={table.id}>
              {template === "premium" ? (
                <PremiumCard
                  restaurant={restaurantForUrl}
                  table={table}
                  logoUrl={logoUrl}
                  t={t}
                />
              ) : template === "minimal" ? (
                <MinimalCard
                  restaurant={restaurantForUrl}
                  table={table}
                  t={t}
                />
              ) : (
                <ClassicCard
                  restaurant={restaurantForUrl}
                  table={table}
                  logoUrl={logoUrl}
                  t={t}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        // No role="alert" here on purpose: this node lives under
        // display:none the whole time this sub-tab is open and is only
        // ever exposed by @media print, so it's never something a screen
        // reader would announce. Reached only while the commit is still
        // genuinely in flight — failure now falls through to the grid
        // above (with the legacy fallback URL) instead of stopping here —
        // so this text only has to be safe to put on paper if a bare
        // Ctrl+P fires before (or instead of) the print button.
        <div
          data-testid="printable-qr-placeholder"
          style={{ padding: "40px", textAlign: "center" }}
        >
          <p>
            {t(
              "tables.printNotReady",
              'Press "Print all QR codes" to prepare codes for printing.',
            )}
          </p>
        </div>
      )}
    </div>
  );

  // Portal directly into document.body so no parent layout offsets the cards
  return createPortal(content, document.body);
};

export default PrintableQRCodes;
