import type { SessionBill } from "../../lib/api";
import type { PosCartItem } from "../../context/PosContext";

export function mapSessionBillToPosHistoryItems(
  bill: SessionBill,
): PosCartItem[] {
  return bill.orders.flatMap((order) =>
    (order.items ?? []).map((item) => {
      const paidQuantity = Math.max(
        0,
        Math.min(item.quantity, item.paidQuantity ?? 0),
      );

      return {
        cartId: `${order.id}-${item.orderItemId}`,
        serverOrderItemId: item.orderItemId,
        menuItemId: "",
        name: item.name ?? "Unknown item",
        price: item.unitPrice ?? 0,
        quantity: item.quantity,
        paidQuantity,
        remainingQuantity: Math.max(0, item.quantity - paidQuantity),
        selectedOptions: (item.selectedOptions ??
          []) as PosCartItem["selectedOptions"],
        seatNumber: "Shared",
        itemNote: "",
        submitted: true,
      };
    }),
  );
}
