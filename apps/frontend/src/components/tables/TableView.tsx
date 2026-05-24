import React, { useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeSession,
  createTable,
  deleteTable,
  getTableSessions,
  getTables,
} from '../../lib/api';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { useTranslation } from 'react-i18next';
import {
  Download,
  Eye,
  LayoutGrid,
  Plus,
  Printer,
  QrCode,
  Search,
  Trash2,
} from 'lucide-react';
import PrintableQRCodes, { PrintOrientation, PrintTemplate } from './PrintableQRCodes';
import RestaurantContext from '../../context/RestaurantContext';
import LiveTablesView from '../../pages/Dashboard/LiveTablesView';
import { useTier } from '../../hooks/useFeature';
import { cn } from '../../lib/utils';

const templateOptions: Array<{ value: PrintTemplate; label: string }> = [
  { value: 'classic', label: 'Classic' },
  { value: 'premium', label: 'Premium' },
  { value: 'minimal', label: 'Minimal' },
];

const orientationOptions: Array<{ value: PrintOrientation; label: string }> = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

function normalizeTableName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

const TableView: React.FC = () => {
  const { activeRestaurant: restaurant } = React.useContext(RestaurantContext) as any;
  const restaurantId = restaurant?.id;
  const queryClient = useQueryClient();
  const [newTableName, setNewTableName] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<{ id: string; name: string } | null>(null);
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { tier } = useTier();
  const isFree = tier === 'FREE';
  const [subTab, setSubTab] = useState<'live' | 'qr'>(isFree ? 'qr' : 'live');
  const [printTemplate, setPrintTemplate] = useState<PrintTemplate>('classic');
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>('portrait');

  const { data: tables, isLoading } = useQuery({
    queryKey: ['tables', restaurantId],
    queryFn: () => getTables(restaurantId),
    enabled: !!restaurantId,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createTable(restaurantId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['tableStatuses', restaurantId] });
      setNewTableName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['tableStatuses', restaurantId] });
    },
  });

  const { data: sessions } = useQuery({
    queryKey: ['tableSessions', restaurantId],
    queryFn: () => getTableSessions(restaurantId),
    enabled: !!restaurantId,
    refetchInterval: 30000,
  });

  const sessionByTableId = useMemo(() => {
    const map = new Map<string, { token: string; status: string }>();
    (sessions || []).forEach((session: any) => map.set(session.tableId, { token: session.token, status: session.status }));
    return map;
  }, [sessions]);

  const filteredTables = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    return (tables || []).filter((table: any) => {
      if (!query) return true;
      return String(table.name ?? '').toLowerCase().includes(query);
    });
  }, [tableSearch, tables]);

  const normalizedNewTableName = normalizeTableName(newTableName);
  const duplicateTable = useMemo(() => {
    if (!normalizedNewTableName) return false;
    return (tables || []).some((table: any) => normalizeTableName(table.name) === normalizedNewTableName);
  }, [normalizedNewTableName, tables]);

  const tableStats = useMemo(() => {
    const tableCount = tables?.length ?? 0;
    const activeSessions = (sessions || []).filter((session: any) => session.status === 'OPEN').length;
    const paidSessions = (sessions || []).filter((session: any) => session.status === 'PAID').length;
    return { tableCount, activeSessions, paidSessions };
  }, [sessions, tables]);

  const closeSessionMutation = useMutation({
    mutationFn: ({ token, restaurantId: rid }: { token: string; restaurantId: string }) =>
      closeSession(token, rid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableSessions', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['tableStatuses', restaurantId] });
    },
  });

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (newTableName.trim() && !duplicateTable) {
      createMutation.mutate(newTableName.trim().replace(/\s+/g, ' '));
    }
  };

  const handleShowQr = (table: { id: string; name: string }) => {
    setSelectedTable(table);
    setIsQrModalOpen(true);
  };

  const handleDownloadQR = () => {
    const qrCodeElement = qrCodeRef.current;
    if (!qrCodeElement) return;

    const svg = qrCodeElement.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngFile = canvas.toDataURL('image/png');

        const downloadLink = document.createElement('a');
        downloadLink.download = `qr-menu-table-${selectedTable?.name || 'unknown'}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const getQrCodeUrl = () => {
    if (!restaurantId || !selectedTable) return '';
    return `${window.location.origin}/menu/public/${restaurantId}?table=${encodeURIComponent(selectedTable.name)}`;
  };

  const logoUrl = restaurant.logoUrl?.startsWith('http')
    ? restaurant.logoUrl
    : restaurant.logoUrl
      ? `${(import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api'}`.replace('/api', '') + `/${restaurant.logoUrl}`
      : null;

  return (
    <section className="min-h-full bg-background text-foreground">
      <div className="mb-6 flex flex-col gap-5 border-b border-border/70 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-black leading-tight text-foreground">
            {t('dashboard.tabs.tables', 'Tables & QR')}
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Track table sessions, manage QR codes, and print table-ready assets.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Tables</p>
            <p className="mt-0.5 text-xl font-black text-foreground">{tableStats.tableCount}</p>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Open</p>
            <p className="mt-0.5 text-xl font-black text-primary">{tableStats.activeSessions}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-400/10">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">Paid</p>
            <p className="mt-0.5 text-xl font-black text-emerald-700 dark:text-emerald-200">{tableStats.paidSessions}</p>
          </div>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto hide-scrollbar">
        <div className="inline-flex min-w-max items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
          {!isFree && (
            <button
              type="button"
              onClick={() => setSubTab('live')}
              className={cn(
                'flex h-9 items-center gap-2 rounded-md px-4 text-sm font-bold transition active:scale-[0.98]',
                subTab === 'live'
                  ? 'bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Eye className="h-4 w-4" />
              {t('tables.liveView')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSubTab('qr')}
            className={cn(
              'flex h-9 items-center gap-2 rounded-md px-4 text-sm font-bold transition active:scale-[0.98]',
              subTab === 'qr'
                ? 'bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <QrCode className="h-4 w-4" />
            {t('tables.qrManagement')}
          </button>
        </div>
      </div>

      {subTab === 'live' ? (
        <LiveTablesView />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <form onSubmit={handleCreate} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-foreground">{t('tables.title')}</h2>
                  <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                    Add table names exactly as guests should see them in QR links.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={newTableName}
                  onChange={(event) => setNewTableName(event.target.value)}
                  placeholder={t('tables.addPlaceholder')}
                  className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <button
                  type="submit"
                  disabled={createMutation.isPending || !newTableName.trim() || duplicateTable}
                  className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-black text-white shadow-[0_10px_20px_-12px_rgba(110,86,248,0.9)] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {createMutation.isPending ? t('tables.adding') : t('tables.addButton')}
                </button>
              </div>
              {duplicateTable && (
                <p className="mt-2 text-xs font-bold text-red-600">
                  A table with this name already exists.
                </p>
              )}
            </form>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-foreground">Print setup</h2>
                  <p className="mt-0.5 text-sm font-medium text-muted-foreground">Choose a QR layout before printing all tables.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={printTemplate}
                  onChange={(event) => setPrintTemplate(event.target.value as PrintTemplate)}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                  aria-label="Print template"
                >
                  {templateOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={printOrientation}
                  onChange={(event) => setPrintOrientation(event.target.value as PrintOrientation)}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                  aria-label="Print orientation"
                >
                  {orientationOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                disabled={!tables || tables.length === 0}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 text-xs font-black text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                {t('tables.printAllQr')}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">QR table grid</h2>
            </div>
            <div className="relative lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={tableSearch}
                onChange={(event) => setTableSearch(event.target.value)}
                placeholder="Search table..."
                className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {[...Array(8)].map((_, index) => (
                <div key={index} className="aspect-[1.08/1] animate-pulse rounded-lg bg-muted/50" />
              ))}
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm font-medium text-muted-foreground">
              {tables?.length === 0 ? t('tables.noTables') : 'No tables match your search.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredTables.map((table: any) => {
                const session = sessionByTableId.get(table.id);
                return (
                  <article key={table.id} className="relative flex aspect-[1.08/1] flex-col overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-primary/10 px-2 text-[10px] font-black uppercase text-primary">
                          <QrCode className="h-3.5 w-3.5" />
                          QR ready
                        </span>
                        <h3 className="mt-3 truncate text-3xl font-black tracking-tight text-foreground">{table.name}</h3>
                      </div>
                      {session && (
                        <span className={cn(
                          'rounded-full px-2.5 py-1 text-[10px] font-black uppercase',
                          session.status === 'OPEN'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200',
                        )}>
                          {session.status}
                        </span>
                      )}
                    </div>

                    <div className="min-h-0 flex-1 rounded-lg border border-border bg-muted/35 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Public URL</p>
                      <p className="mt-2 line-clamp-2 break-all text-xs font-medium text-foreground">
                        /menu/public/{restaurantId}?table={encodeURIComponent(table.name)}
                      </p>
                      {session?.status === 'OPEN' && (
                        <button
                          type="button"
                          onClick={() => closeSessionMutation.mutate({ token: session.token, restaurantId })}
                          className="mt-3 text-xs font-black text-red-600 transition hover:text-red-500"
                        >
                          {t('tables.closeSession')}
                        </button>
                      )}
                    </div>

                    <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 border-t border-border pt-3">
                      <button
                        type="button"
                        onClick={() => handleShowQr(table)}
                        className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-black text-white shadow-[0_10px_20px_-12px_rgba(110,86,248,0.9)] transition hover:bg-accent"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        {t('tables.generateQR')}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(table.id)}
                        disabled={deleteMutation.isPending}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-card text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                        aria-label={t('tables.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <Modal
            open={isQrModalOpen}
            onOpenChange={setIsQrModalOpen}
            title={selectedTable ? t('tables.qrTitle', { name: selectedTable.name }) : t('tables.generateQR')}
            description={selectedTable ? t('tables.qrInstructions', { name: selectedTable.name }) : undefined}
          >
            {selectedTable && (
              <div className="flex flex-col items-center">
                <div className="mb-6 inline-block rounded-2xl border-8 border-white bg-white p-6 shadow-inner" ref={qrCodeRef}>
                  <QRCodeSVG
                    value={getQrCodeUrl()}
                    size={256}
                    fgColor={restaurant.accentColor || '#000000'}
                    bgColor="#ffffff"
                    level="H"
                    imageSettings={logoUrl ? {
                      src: logoUrl,
                      height: 50,
                      width: 50,
                      excavate: true,
                    } : undefined}
                  />
                </div>
                <Button className="w-full gap-2" onClick={handleDownloadQR}>
                  <Download className="h-4 w-4" />
                  {t('tables.downloadPNG')}
                </Button>
              </div>
            )}
          </Modal>

          <PrintableQRCodes
            restaurant={restaurant}
            tables={tables || []}
            template={printTemplate}
            orientation={printOrientation}
          />
        </div>
      )}
    </section>
  );
};

export default TableView;
