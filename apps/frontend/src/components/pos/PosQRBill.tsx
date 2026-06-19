import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, X } from "lucide-react";
import { usePos } from "../../context/PosContext";
import { useTranslation } from "react-i18next";

export default function PosQRBill() {
  const { t } = useTranslation();
  const { session } = usePos();
  const [open, setOpen] = useState(false);

  if (!session?.sessionToken) {
    return null;
  }

  const billUrl = `${window.location.origin}/checkout?session=${session.sessionToken}`;

  return (
    <div className="border-t border-border p-4">
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <QrCode className="h-4 w-4" />
            {t("auto.requestPaymentQR", "Request QR for payment")}
          </button>
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto flex max-w-sm -translate-y-1/2 flex-col items-center rounded-2xl bg-background p-5 text-center shadow-xl">
            <div className="mb-4 flex w-full items-start justify-between gap-3">
              <div className="min-w-0 text-left">
                <Dialog.Title className="text-base font-semibold text-foreground">
                  {t("auto.paymentQRTitle", {
                    table: session.tableName,
                    defaultValue: "Payment QR for {{table}}",
                  })}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "auto.paymentQRDescription",
                    "Ask the customer to scan this QR to review and pay their bill.",
                  )}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("common.close", "Close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="rounded-xl bg-white p-4">
              <QRCodeSVG value={billUrl} size={260} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
