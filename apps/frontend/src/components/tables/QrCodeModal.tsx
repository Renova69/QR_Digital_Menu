import { useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { commitRestaurantSlug, type ServicePointType } from "../../lib/api";
import { getMenuUrl } from "../../lib/menuUrl";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";

export interface QrCodeTarget {
  id: string;
  name: string;
  type?: ServicePointType;
  publicToken?: string | null;
}

interface QrCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurant: {
    id: string;
    accentColor?: string | null;
  };
  target: QrCodeTarget | null;
  logoDataUrl: string | null;
}

function buildQrUrl(
  restaurant: { id: string; slug?: string | null },
  target: QrCodeTarget,
) {
  if (target.type && target.type !== "TABLE") {
    if (!target.publicToken) return "";
    return getMenuUrl(restaurant, { servicePointToken: target.publicToken });
  }
  return getMenuUrl(restaurant, { table: target.name });
}

const QrCodeModal = ({
  open,
  onOpenChange,
  restaurant,
  target,
  logoDataUrl,
}: QrCodeModalProps) => {
  const { t } = useTranslation();
  const qrCanvasRef = useRef<HTMLDivElement>(null);
  const isServicePoint = !!target?.type && target.type !== "TABLE";

  // A QR must never be rendered against a slug that could still change.
  // Committing is a blocking precondition rather than something observed
  // after the fact — QR download is entirely client-side (canvas redraw +
  // toDataURL + <a download>), so the backend can never observe an export.
  // A fire-and-forget beacon could fail while the download still succeeded,
  // leaving the immutable-slug guarantee resting on an unreliable signal.
  const {
    data: committed,
    isLoading: isCommitting,
    isError: commitFailed,
  } = useQuery({
    queryKey: ["slug-commit", restaurant.id],
    queryFn: () => commitRestaurantSlug(restaurant.id),
    enabled: open,
    retry: 1,
    staleTime: Infinity,
  });

  // Built from the slug the server just froze, never from the restaurant
  // object the caller handed in — that way the rendered code can never
  // disagree with what the commit response returned.
  //
  // On commit failure, fall back to the legacy `/menu/public/:id` URL
  // instead of refusing to render anything. That URL carries no slug
  // segment, so it can never go stale — a QR printed against it stays
  // valid forever, which is strictly better than no QR at all. This does
  // NOT weaken the precondition above: a QR still never renders against a
  // slug that could still change, it just also never blocks on the commit
  // succeeding when a permanently-valid alternative exists.
  const qrUrl = !target
    ? ""
    : committed
      ? buildQrUrl({ id: restaurant.id, slug: committed.slug }, target)
      : commitFailed
        ? buildQrUrl({ id: restaurant.id, slug: null }, target)
        : "";

  const handleDownload = () => {
    const sourceCanvas = qrCanvasRef.current?.querySelector("canvas");
    if (!sourceCanvas) return;

    const quietZone = 72;
    const sourceWidth = sourceCanvas.width;
    const output = document.createElement("canvas");
    output.width = sourceWidth + quietZone * 2;
    output.height = output.width;
    const context = output.getContext("2d");
    if (!context) return;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(sourceCanvas, quietZone, quietZone);

    const finish = () => {
      const link = document.createElement("a");
      link.download = `qr-menu-${isServicePoint ? "service-point" : "table"}-${target?.name || "unknown"}.png`;
      link.href = output.toDataURL("image/png");
      link.click();
    };

    if (!logoDataUrl) {
      finish();
      return;
    }

    const logo = new Image();
    logo.onload = () => {
      const logoSize = Math.round(sourceWidth * 0.138);
      const x = quietZone + Math.round((sourceWidth - logoSize) / 2);
      const y = quietZone + Math.round((sourceWidth - logoSize) / 2);
      const padding = Math.max(2, Math.round(sourceWidth * 0.008));
      context.fillStyle = "#ffffff";
      context.fillRect(
        x - padding,
        y - padding,
        logoSize + padding * 2,
        logoSize + padding * 2,
      );
      context.imageSmoothingEnabled = false;
      context.drawImage(logo, x, y, logoSize, logoSize);
      finish();
    };
    logo.onerror = finish;
    logo.src = logoDataUrl;
  };

  // Keep the modal chrome constant across states — only the body swaps.
  // No separate error branch: a failed commit still produces a real,
  // permanently-valid QR (see the qrUrl fallback above), so the only
  // remaining "empty" state is genuinely still loading.
  let body: ReactNode = null;
  if (!isCommitting && target && qrUrl) {
    body = (
      <div className="flex flex-col items-center">
        <div className="mb-6 inline-block rounded-2xl border-8 border-white bg-white p-4 shadow-inner sm:p-6">
          <QRCodeSVG
            value={qrUrl}
            size={256}
            fgColor={restaurant.accentColor || "#000000"}
            bgColor="#ffffff"
            level="H"
            imageSettings={
              logoDataUrl
                ? {
                    src: logoDataUrl,
                    height: 38,
                    width: 38,
                    excavate: true,
                  }
                : undefined
            }
          />
        </div>
        <div
          ref={qrCanvasRef}
          data-testid="qr-canvas"
          style={{ position: "absolute", left: "-9999px", top: 0 }}
        >
          <QRCodeCanvas
            value={qrUrl}
            size={512}
            fgColor={restaurant.accentColor || "#000000"}
            bgColor="#ffffff"
            level="H"
          />
        </div>
        <Button className="w-full gap-2" onClick={handleDownload}>
          <Download className="h-4 w-4" />
          {t("tables.downloadPNG")}
        </Button>
      </div>
    );
  }

  return (
    <Modal
      dashboardUi
      open={open}
      onOpenChange={onOpenChange}
      title={
        target
          ? isServicePoint
            ? t("servicePoints.qrTitle", {
                name: target.name,
                defaultValue: "{{name}} QR",
              })
            : t("tables.qrTitle", { name: target.name })
          : t("tables.generateQR")
      }
      description={
        target
          ? isServicePoint
            ? t(
                "servicePoints.qrInstructions",
                "Place this QR at the room or pickup point.",
              )
            : t("tables.qrInstructions", { name: target.name })
          : undefined
      }
    >
      {body}
    </Modal>
  );
};

export default QrCodeModal;
