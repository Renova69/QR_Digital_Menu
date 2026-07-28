import { useRef } from "react";
import { Download } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import type { ServicePointType } from "../../lib/api";
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

function buildQrUrl(restaurantId: string, target: QrCodeTarget) {
  if (target.type && target.type !== "TABLE") {
    if (!target.publicToken) return "";
    return `${window.location.origin}/menu/public/${restaurantId}?sp=${encodeURIComponent(target.publicToken)}`;
  }
  return `${window.location.origin}/menu/public/${restaurantId}?table=${encodeURIComponent(target.name)}`;
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
  const qrUrl = target ? buildQrUrl(restaurant.id, target) : "";

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
      {target && qrUrl && (
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
      )}
    </Modal>
  );
};

export default QrCodeModal;
