import { describe, expect, it } from "vitest";
import { mapSessionBillToPosHistoryItems } from "./posSessionBill";

describe("mapSessionBillToPosHistoryItems", () => {
  it("preserves item-level payment state from the authoritative session bill", () => {
    const items = mapSessionBillToPosHistoryItems({
      sessionId: "session-1",
      tableId: "table-1",
      tableName: "1",
      restaurantId: "restaurant-1",
      subtotal: 29.61,
      paidSubtotal: 16.11,
      remaining: 13.5,
      splitItemsAvailable: true,
      tipsEnabled: false,
      tipOptions: [],
      paymentProviders: [],
      pendingPayment: null,
      orders: [
        {
          id: "order-unpaid",
          source: "CUSTOMER",
          customerName: "Guest",
          staffName: null,
          staffRole: null,
          totalPrice: 9.21,
          items: [
            {
              orderItemId: "oi-unpaid",
              name: "Шопска салата",
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 5.63,
              unitPriceWithOptions: 5.63,
              selectedOptions: [],
            },
          ],
        },
        {
          id: "order-paid",
          source: "CUSTOMER",
          customerName: "Guest",
          staffName: null,
          staffRole: null,
          totalPrice: 16.11,
          items: [
            {
              orderItemId: "oi-paid",
              name: "Селска салата лятна",
              quantity: 1,
              paidQuantity: 1,
              unitPrice: 5.62,
              unitPriceWithOptions: 5.62,
              selectedOptions: [],
            },
          ],
        },
      ],
    });

    expect(items).toEqual([
      expect.objectContaining({
        cartId: "order-unpaid-oi-unpaid",
        serverOrderItemId: "oi-unpaid",
        quantity: 1,
        paidQuantity: 0,
        remainingQuantity: 1,
      }),
      expect.objectContaining({
        cartId: "order-paid-oi-paid",
        serverOrderItemId: "oi-paid",
        quantity: 1,
        paidQuantity: 1,
        remainingQuantity: 0,
      }),
    ]);
  });
});
