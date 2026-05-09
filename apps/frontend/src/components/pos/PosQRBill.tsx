import { QRCodeSVG } from "qrcode.react";
import { usePos } from "../../context/PosContext";

export default function PosQRBill() {
  const { session } = usePos();

  if (!session?.sessionToken) {
    return null;
  }

  const billUrl = `${window.location.origin}/checkout?session=${session.sessionToken}`;

  return (
    <div className="flex flex-col items-center p-4 border-t border-border">
      <p className="text-sm font-medium text-foreground mb-3">
        Payment QR — {session.tableName}
      </p>
      <div className="bg-white p-3 rounded-lg">
        <QRCodeSVG value={billUrl} size={256} />
      </div>
      <p className="text-xs text-muted-foreground mt-2 break-all text-center">
        {billUrl}
      </p>
    </div>
  );
}
