import writeXlsxFile from 'write-excel-file/browser';
import type { TFunction } from 'i18next';
import type { AnalyticsData } from '../hooks/useAnalytics';
import { BGN_RATE } from './currency';

export interface ExportMeta {
  restaurantName: string;
  startDate?: string;
  endDate?: string;
  period: number;
}

interface Cell {
  value?: boolean | number | string | Date | null;
  type?: typeof Number | typeof String | typeof Boolean | typeof Date;
  format?: string;
  fontWeight?: 'bold';
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  align?: 'left' | 'center' | 'right';
}

const HEADER_BG = '#1e3a5f';
const HEADER_FG = '#ffffff';
const EUR_FORMAT = '"€"#,##0.00';
const BGN_FORMAT = '#,##0.00" лв"';
const PCT_FORMAT = '0.0"%"';

function h(value: string): Cell {
  return { value, fontWeight: 'bold', backgroundColor: HEADER_BG, textColor: HEADER_FG };
}

function eur(value: number): Cell {
  return { value, type: Number, format: EUR_FORMAT };
}

function bgn(eurValue: number): Cell {
  return { value: eurValue * BGN_RATE, type: Number, format: BGN_FORMAT };
}

function int(value: number): Cell {
  return { value, type: Number };
}

function pct(value: number): Cell {
  return { value, type: Number, format: PCT_FORMAT };
}

function empty(): Cell {
  return { value: null };
}

function noDataRow(t: TFunction, cols: number): Cell[][] {
  return [
    Array.from({ length: cols }, (_, i) =>
      i === 0 ? { value: t('analytics.export.noData', 'No data for this period') } : empty(),
    ),
  ];
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function resolveRange(meta: ExportMeta): { from: Date; to: Date; label: string } {
  if (meta.startDate && meta.endDate) {
    return {
      from: new Date(meta.startDate),
      to: new Date(meta.endDate),
      label: `${meta.startDate} → ${meta.endDate}`,
    };
  }
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - meta.period);
  return { from, to, label: `Last ${meta.period} days` };
}

export async function downloadAnalyticsExport(
  data: AnalyticsData,
  meta: ExportMeta,
  t: TFunction,
): Promise<void> {
  const range = resolveRange(meta);
  const slug = toSlug(meta.restaurantName || 'restaurant');
  const fileName = `analytics-${slug}-${fmtDate(range.from)}_to_${fmtDate(range.to)}.xlsx`;

  const colEur = t('analytics.export.columns.revenue', 'Revenue (€)');
  const colBgn = t('analytics.export.columns.revenueBgn', 'Revenue (лв)');

  // Summary sheet — 3 columns: KPI | EUR value | BGN value
  const summarySheet: Cell[][] = [
    [h(t('analytics.export.columns.kpi', 'KPI')), h(colEur), h(colBgn)],
    [{ value: t('analytics.export.summary.restaurant', 'Restaurant') }, { value: meta.restaurantName }, empty()],
    [{ value: t('analytics.export.summary.period', 'Period') }, { value: range.label }, empty()],
    [{ value: t('analytics.export.summary.generatedAt', 'Generated At') }, { value: new Date().toLocaleString() }, empty()],
    [empty(), empty(), empty()],
    [{ value: t('analytics.export.summary.totalRevenue', 'Total Revenue') }, eur(data.totalRevenue), bgn(data.totalRevenue)],
    [{ value: t('analytics.export.summary.totalOrders', 'Total Orders') }, int(data.totalOrders), empty()],
    [{ value: t('analytics.export.summary.avgOrderValue', 'Avg Order Value') }, eur(data.avgOrderValue), bgn(data.avgOrderValue)],
    [{ value: t('analytics.export.summary.servedRate', 'Served Rate') }, pct(data.servedRate), empty()],
    [{ value: t('analytics.export.summary.revenueChange', 'Revenue vs Prev Period') }, pct(data.comparison.revenueChange), empty()],
    [{ value: t('analytics.export.summary.ordersChange', 'Orders vs Prev Period') }, pct(data.comparison.ordersChange), empty()],
  ];

  // Revenue Trend sheet — Date | EUR | BGN | Orders
  const trendHeader: Cell[][] = [[
    h(t('analytics.export.columns.date', 'Date')),
    h(colEur),
    h(colBgn),
    h(t('analytics.export.columns.orders', 'Orders')),
  ]];
  const trendBody: Cell[][] = data.revenueTrend.length > 0
    ? data.revenueTrend.map(row => [{ value: row.date }, eur(row.revenue), bgn(row.revenue), int(row.orders)])
    : noDataRow(t, 4);
  const revenueTrendSheet = [...trendHeader, ...trendBody];

  // Top Items sheet — Rank | Item Name | Qty Sold | EUR | BGN
  const itemHeader: Cell[][] = [[
    h(t('analytics.export.columns.rank', 'Rank')),
    h(t('analytics.export.columns.itemName', 'Item Name')),
    h(t('analytics.export.columns.qtySold', 'Qty Sold')),
    h(colEur),
    h(colBgn),
  ]];
  const itemBody: Cell[][] = data.topItems.length > 0
    ? data.topItems.map((item, i) => [int(i + 1), { value: item.name }, int(item.quantity), eur(item.revenue), bgn(item.revenue)])
    : noDataRow(t, 5);
  const topItemsSheet = [...itemHeader, ...itemBody];

  // Peak Hours sheet — Hour | Orders (no currency)
  const peakHeader: Cell[][] = [[
    h(t('analytics.export.columns.hour', 'Hour')),
    h(t('analytics.export.columns.orders', 'Orders')),
  ]];
  const filtered = data.peakHours.filter(r => r.hour >= 8 && r.hour <= 23);
  const peakBody: Cell[][] = filtered.length > 0
    ? filtered.map(row => [{ value: `${String(row.hour).padStart(2, '0')}:00` }, int(row.orders)])
    : noDataRow(t, 2);
  const peakHoursSheet = [...peakHeader, ...peakBody];

  // Categories sheet — Category | EUR | BGN | Share %
  const catHeader: Cell[][] = [[
    h(t('analytics.export.columns.category', 'Category')),
    h(colEur),
    h(colBgn),
    h(t('analytics.export.columns.sharePct', 'Share %')),
  ]];
  const catBody: Cell[][] = data.categoryBreakdown && data.categoryBreakdown.length > 0
    ? data.categoryBreakdown.map(row => [
        { value: row.category },
        eur(row.revenue),
        bgn(row.revenue),
        pct(data.totalRevenue > 0 ? (row.revenue / data.totalRevenue) * 100 : 0),
      ])
    : noDataRow(t, 4);
  const categoriesSheet = [...catHeader, ...catBody];

  const sheets = [
    {
      sheet: t('analytics.export.sheets.summary', 'Summary'),
      columns: [{ width: 32 }, { width: 16 }, { width: 16 }],
      data: summarySheet as any,
    },
    {
      sheet: t('analytics.export.sheets.revenueTrend', 'Revenue Trend'),
      columns: [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 10 }],
      data: revenueTrendSheet as any,
    },
    {
      sheet: t('analytics.export.sheets.topItems', 'Top Items'),
      columns: [{ width: 8 }, { width: 36 }, { width: 12 }, { width: 14 }, { width: 14 }],
      data: topItemsSheet as any,
    },
    {
      sheet: t('analytics.export.sheets.peakHours', 'Peak Hours'),
      columns: [{ width: 10 }, { width: 10 }],
      data: peakHoursSheet as any,
    },
    {
      sheet: t('analytics.export.sheets.categories', 'Categories'),
      columns: [{ width: 26 }, { width: 14 }, { width: 14 }, { width: 12 }],
      data: categoriesSheet as any,
    },
  ];

  if (data.ordersByTable && data.ordersByTable.length > 0) {
    const tableHeader: Cell[][] = [[
      h(t('analytics.export.columns.table', 'Table')),
      h(t('analytics.export.columns.orders', 'Orders')),
      h(colEur),
      h(colBgn),
    ]];
    const tableBody: Cell[][] = data.ordersByTable.map(row => [
      { value: row.table },
      int(row.orders),
      eur(row.revenue),
      bgn(row.revenue),
    ]);
    sheets.push({
      sheet: t('analytics.export.sheets.topTables', 'Top Tables'),
      columns: [{ width: 16 }, { width: 10 }, { width: 14 }, { width: 14 }],
      data: [...tableHeader, ...tableBody] as any,
    });
  }

  const wb = await writeXlsxFile(sheets);
  await wb.toFile(fileName);
}
