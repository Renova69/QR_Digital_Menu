import writeXlsxFile from 'write-excel-file/browser';
import type { TFunction } from 'i18next';
import type { AnalyticsData } from '../hooks/useAnalytics';

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
  color?: string;
  backgroundColor?: string;
  align?: 'left' | 'center' | 'right';
}

const HEADER_BG = '#18181b';
const HEADER_FG = '#ffffff';
const EUR_FORMAT = '"€"#,##0.00';
const PCT_FORMAT = '0.0"%"';

function h(value: string): Cell {
  return { value, fontWeight: 'bold', backgroundColor: HEADER_BG, color: HEADER_FG };
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

function noDataRow(t: TFunction, cols: number): Cell[][] {
  return [
    Array.from({ length: cols }, (_, i) =>
      i === 0 ? { value: t('analytics.export.noData', 'No data for this period') } : { value: null },
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

  // Summary sheet
  const summarySheet: Cell[][] = [
    [h(t('analytics.export.columns.kpi', 'KPI')), h(t('analytics.export.columns.value', 'Value'))],
    [{ value: t('analytics.export.summary.restaurant', 'Restaurant') }, { value: meta.restaurantName }],
    [{ value: t('analytics.export.summary.period', 'Period') }, { value: range.label }],
    [{ value: t('analytics.export.summary.generatedAt', 'Generated At') }, { value: new Date().toLocaleString() }],
    [{ value: null }, { value: null }],
    [{ value: t('analytics.export.summary.totalRevenue', 'Total Revenue') }, eur(data.totalRevenue)],
    [{ value: t('analytics.export.summary.totalOrders', 'Total Orders') }, int(data.totalOrders)],
    [{ value: t('analytics.export.summary.avgOrderValue', 'Avg Order Value') }, eur(data.avgOrderValue)],
    [{ value: t('analytics.export.summary.servedRate', 'Served Rate') }, pct(data.servedRate)],
    [{ value: t('analytics.export.summary.revenueChange', 'Revenue vs Prev Period') }, pct(data.comparison.revenueChange)],
    [{ value: t('analytics.export.summary.ordersChange', 'Orders vs Prev Period') }, pct(data.comparison.ordersChange)],
  ];

  // Revenue Trend sheet
  const trendHeader: Cell[][] = [[
    h(t('analytics.export.columns.date', 'Date')),
    h(t('analytics.export.columns.revenue', 'Revenue')),
    h(t('analytics.export.columns.orders', 'Orders')),
  ]];
  const trendBody: Cell[][] = data.revenueTrend.length > 0
    ? data.revenueTrend.map(row => [{ value: row.date }, eur(row.revenue), int(row.orders)])
    : noDataRow(t, 3);
  const revenueTrendSheet = [...trendHeader, ...trendBody];

  // Top Items sheet
  const itemHeader: Cell[][] = [[
    h(t('analytics.export.columns.rank', 'Rank')),
    h(t('analytics.export.columns.itemName', 'Item Name')),
    h(t('analytics.export.columns.qtySold', 'Qty Sold')),
    h(t('analytics.export.columns.revenue', 'Revenue')),
  ]];
  const itemBody: Cell[][] = data.topItems.length > 0
    ? data.topItems.map((item, i) => [int(i + 1), { value: item.name }, int(item.quantity), eur(item.revenue)])
    : noDataRow(t, 4);
  const topItemsSheet = [...itemHeader, ...itemBody];

  // Peak Hours sheet (08:00–23:00 only, matching the chart)
  const peakHeader: Cell[][] = [[
    h(t('analytics.export.columns.hour', 'Hour')),
    h(t('analytics.export.columns.orders', 'Orders')),
  ]];
  const filtered = data.peakHours.filter(h => h.hour >= 8 && h.hour <= 23);
  const peakBody: Cell[][] = filtered.length > 0
    ? filtered.map(row => [{ value: `${String(row.hour).padStart(2, '0')}:00` }, int(row.orders)])
    : noDataRow(t, 2);
  const peakHoursSheet = [...peakHeader, ...peakBody];

  // Categories sheet
  const catHeader: Cell[][] = [[
    h(t('analytics.export.columns.category', 'Category')),
    h(t('analytics.export.columns.revenue', 'Revenue')),
    h(t('analytics.export.columns.sharePct', 'Share %')),
  ]];
  const catBody: Cell[][] = data.categoryBreakdown && data.categoryBreakdown.length > 0
    ? data.categoryBreakdown.map(row => [
        { value: row.category },
        eur(row.revenue),
        pct(data.totalRevenue > 0 ? (row.revenue / data.totalRevenue) * 100 : 0),
      ])
    : noDataRow(t, 3);
  const categoriesSheet = [...catHeader, ...catBody];

  const sheets = [
    {
      sheet: t('analytics.export.sheets.summary', 'Summary'),
      columns: [{ width: 32 }, { width: 26 }],
      data: summarySheet as any,
    },
    {
      sheet: t('analytics.export.sheets.revenueTrend', 'Revenue Trend'),
      columns: [{ width: 14 }, { width: 14 }, { width: 10 }],
      data: revenueTrendSheet as any,
    },
    {
      sheet: t('analytics.export.sheets.topItems', 'Top Items'),
      columns: [{ width: 8 }, { width: 36 }, { width: 12 }, { width: 14 }],
      data: topItemsSheet as any,
    },
    {
      sheet: t('analytics.export.sheets.peakHours', 'Peak Hours'),
      columns: [{ width: 10 }, { width: 10 }],
      data: peakHoursSheet as any,
    },
    {
      sheet: t('analytics.export.sheets.categories', 'Categories'),
      columns: [{ width: 26 }, { width: 14 }, { width: 12 }],
      data: categoriesSheet as any,
    },
  ];

  if (data.ordersByTable && data.ordersByTable.length > 0) {
    const tableHeader: Cell[][] = [[
      h(t('analytics.export.columns.table', 'Table')),
      h(t('analytics.export.columns.orders', 'Orders')),
      h(t('analytics.export.columns.revenue', 'Revenue')),
    ]];
    const tableBody: Cell[][] = data.ordersByTable.map(row => [
      { value: row.table },
      int(row.orders),
      eur(row.revenue),
    ]);
    sheets.push({
      sheet: t('analytics.export.sheets.topTables', 'Top Tables'),
      columns: [{ width: 16 }, { width: 10 }, { width: 14 }],
      data: [...tableHeader, ...tableBody] as any,
    });
  }

  const wb = await writeXlsxFile(sheets);
  await wb.toFile(fileName);
}
