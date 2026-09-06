import writeXlsxFile from "write-excel-file/browser";
import type { TFunction } from "i18next";
import type { PaymentRecord } from "../pages/Dashboard/paymentsShared";

export interface PaymentsExportMeta {
  restaurantName: string;
  from?: string;
  to?: string;
}

interface Cell {
  value?: boolean | number | string | Date | null;
  type?: typeof Number | typeof String | typeof Boolean | typeof Date;
  format?: string;
  fontWeight?: "bold";
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
}

const HEADER_BG = "#4f46e5";
const SECTION_BG = "#ede9fe";
const HEADER_FG = "#ffffff";
const EUR_FORMAT = '"EUR "#,##0.00';

const PCT_FORMAT = '0.0"%"';

function h(value: string): Cell {
  return {
    value,
    fontWeight: "bold",
    backgroundColor: HEADER_BG,
    textColor: HEADER_FG,
  };
}

function section(value: string, cols: number): Cell[] {
  return [
    {
      value,
      fontWeight: "bold",
      backgroundColor: SECTION_BG,
      textColor: "#312e81",
      fontSize: 14,
    },
    ...Array.from({ length: cols - 1 }, () => ({
      value: null,
      backgroundColor: SECTION_BG,
    })),
  ];
}

function eur(value: number): Cell {
  return { value, type: Number, format: EUR_FORMAT };
}

function int(value: number): Cell {
  return { value, type: Number };
}

function pct(value: number): Cell {
  return { value, type: Number, format: PCT_FORMAT };
}

// Customer names / table labels / provider references are user- or
// external-controlled and flow into this export; force literal-text rendering
// for any value Excel/Sheets would treat as a formula (#29).
function sanitizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function text(value?: string | number | null): Cell {
  return { value: value == null ? "" : sanitizeFormula(String(value)) };
}

function empty(): Cell {
  return { value: null };
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function safePercent(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

interface MethodAggregate {
  count: number;
  amount: number;
  tips: number;
  fees: number;
}

function aggregateByMethod(
  payments: PaymentRecord[],
): Record<string, MethodAggregate> {
  return payments
    .filter((p) => p.status === "SUCCEEDED")
    .reduce<Record<string, MethodAggregate>>((acc, p) => {
      const existing = acc[p.provider] ?? {
        count: 0,
        amount: 0,
        tips: 0,
        fees: 0,
      };
      acc[p.provider] = {
        count: existing.count + 1,
        amount: existing.amount + p.amount,
        tips: existing.tips + p.tipAmount,
        fees: existing.fees + p.platformFeeAmount,
      };
      return acc;
    }, {});
}

export async function downloadPaymentsExport(
  payments: PaymentRecord[],
  meta: PaymentsExportMeta,
  t: TFunction,
): Promise<void> {
  const ex = (key: string, fallback: string) =>
    t(`payments.export.${key}`, { defaultValue: fallback });

  const slug = toSlug(meta.restaurantName || "restaurant");
  const dateStr = fmtDate(new Date());
  const fileName = `payments-${slug}-${dateStr}.xlsx`;

  const succeeded = payments.filter((p) => p.status === "SUCCEEDED");
  const totalRevenue = succeeded.reduce((s, p) => s + p.amount, 0);
  const totalTips = succeeded.reduce((s, p) => s + p.tipAmount, 0);
  const totalFees = succeeded.reduce((s, p) => s + p.platformFeeAmount, 0);
  const netRevenue = totalRevenue - totalFees;
  const avgTx = succeeded.length > 0 ? totalRevenue / succeeded.length : 0;

  // Status breakdown
  const byStatus = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  const dateRange =
    meta.from && meta.to
      ? `${meta.from} — ${meta.to}`
      : meta.from
        ? `${ex("from", "From")} ${meta.from}`
        : meta.to
          ? `${ex("to", "To")} ${meta.to}`
          : ex("allTime", "All time");

  // Sheet 1 — Summary
  const summarySheet: Cell[][] = [
    section(ex("sectionSummary", "Export Summary"), 3),
    [h(ex("colField", "Field")), h(ex("colValue", "Value")), empty()],
    [text(ex("restaurant", "Restaurant")), text(meta.restaurantName), empty()],
    [text(ex("dateRange", "Date Range")), text(dateRange), empty()],
    [
      text(ex("generatedAt", "Generated At")),
      text(new Date().toLocaleString([], { hour12: false })),
      empty(),
    ],
    [text(ex("txCount", "Transaction Count")), int(payments.length), empty()],
    [empty(), empty(), empty()],
    section(ex("sectionRevenue", "Revenue"), 3),
    [h(ex("colMetric", "Metric")), h(ex("colEur", "EUR"))],
    [text(ex("totalRevenue", "Total Revenue")), eur(totalRevenue)],
    [text(ex("totalTips", "Total Tips")), eur(totalTips)],
    [text(ex("totalFees", "Platform Fees")), eur(totalFees)],
    [text(ex("netRevenue", "Net Revenue")), eur(netRevenue)],
    [text(ex("avgTx", "Avg Transaction")), eur(avgTx)],
    [empty(), empty(), empty()],
    section(ex("sectionByStatus", "By Status"), 3),
    [
      h(ex("colStatus", "Status")),
      h(ex("colCount", "Count")),
      h(ex("colShare", "Share")),
    ],
    ...Object.entries(byStatus).map(([status, count]) => [
      text(status),
      int(count),
      pct(safePercent(count, payments.length)),
    ]),
  ];

  // Sheet 2 — Transactions
  const txSheet: Cell[][] = [
    [
      h(ex("colId", "ID")),
      h(ex("colDate", "Date")),
      h(ex("colCustomer", "Customer")),
      h(ex("colTable", "Table")),
      h(ex("colMethod", "Method")),
      h(ex("colAmountEur", "Amount EUR")),
      h(ex("colTipEur", "Tip EUR")),
      h(ex("colFeeEur", "Fee EUR")),
      h(ex("colNetEur", "Net EUR")),
      h(ex("colCurrency", "Currency")),
      h(ex("colStatus", "Status")),
      h(ex("colProviderRef", "Provider Ref")),
    ],
    ...payments.map((p) => {
      const date = new Date(p.createdAt);
      const net = p.amount - p.platformFeeAmount;
      return [
        text(p.id),
        {
          value: Number.isNaN(date.getTime()) ? null : date,
          type: Date,
          format: "YYYY-MM-DD HH:MM",
        } as Cell,
        text(p.customerName),
        text(p.tableNumber),
        text(p.provider),
        eur(p.amount),
        eur(p.tipAmount),
        eur(p.platformFeeAmount),
        eur(net),
        text(p.currency),
        text(p.status),
        text(p.providerReference),
      ];
    }),
  ];

  if (payments.length === 0) {
    txSheet.push([
      text(ex("noData", "No transactions")),
      ...Array(11).fill(empty()),
    ]);
  }

  // Sheet 3 — By Method
  const byMethod = aggregateByMethod(payments);
  const totalSucceededRevenue = Object.values(byMethod).reduce(
    (s, m) => s + m.amount,
    0,
  );

  const methodSheet: Cell[][] = [
    [
      h(ex("colMethod", "Method")),
      h(ex("colCount", "Count")),
      h(ex("colRevenueEur", "Revenue EUR")),
      h(ex("colTipsEur", "Tips EUR")),
      h(ex("colNetEur", "Net EUR")),
      h(ex("colShare", "Share")),
    ],
    ...Object.entries(byMethod).map(([method, agg]) => [
      text(method),
      int(agg.count),
      eur(agg.amount),
      eur(agg.tips),
      eur(agg.amount - agg.fees),
      pct(safePercent(agg.amount, totalSucceededRevenue)),
    ]),
  ];

  if (Object.keys(byMethod).length === 0) {
    methodSheet.push([
      text(ex("noData", "No succeeded transactions")),
      ...Array(5).fill(empty()),
    ]);
  }

  const sheets = [
    {
      sheet: ex("sheetSummary", "Summary"),
      columns: [{ width: 28 }, { width: 24 }, { width: 16 }],
      data: summarySheet as any,
    },
    {
      sheet: ex("sheetTransactions", "Transactions"),
      columns: [
        { width: 18 },
        { width: 18 },
        { width: 20 },
        { width: 14 },
        { width: 12 },
        { width: 14 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 10 },
        { width: 14 },
        { width: 20 },
      ],
      data: txSheet as any,
    },
    {
      sheet: ex("sheetByMethod", "By Method"),
      columns: [
        { width: 14 },
        { width: 10 },
        { width: 14 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
      ],
      data: methodSheet as any,
    },
  ];

  await writeXlsxFile(sheets).toFile(fileName);
}
