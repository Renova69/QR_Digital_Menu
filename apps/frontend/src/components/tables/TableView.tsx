import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTables, createTable, deleteTable, getTableSessions, closeSession } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Modal } from '../ui/modal';
import { useTranslation } from 'react-i18next';
import { Printer, Eye, QrCode } from 'lucide-react';
import PrintableQRCodes from './PrintableQRCodes';
import RestaurantContext from '../../context/RestaurantContext';
import LiveTablesView from '../../pages/Dashboard/LiveTablesView';

const TableView: React.FC = () => {
  const { activeRestaurant: restaurant } = React.useContext(RestaurantContext) as any;
  const restaurantId = restaurant?.id;
  const queryClient = useQueryClient();
  const [newTableName, setNewTableName] = useState('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<{ id: string; name: string } | null>(null);
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<'live' | 'qr'>('live');

  const { data: tables, isLoading } = useQuery({
    queryKey: ['tables', restaurantId],
    queryFn: () => getTables(restaurantId),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createTable(restaurantId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', restaurantId] });
      setNewTableName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', restaurantId] });
    },
  });

  const { data: sessions } = useQuery({
    queryKey: ['tableSessions', restaurantId],
    queryFn: () => getTableSessions(restaurantId),
    enabled: !!restaurantId,
    refetchInterval: 30000,
  });

  const sessionByTableId = React.useMemo(() => {
    const map = new Map<string, { token: string; status: string }>();
    (sessions || []).forEach((s) => map.set(s.tableId, { token: s.token, status: s.status }));
    return map;
  }, [sessions]);

  const closeSessionMutation = useMutation({
    mutationFn: ({ token, restaurantId: rid }: { token: string; restaurantId: string }) =>
      closeSession(token, rid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableSessions', restaurantId] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTableName.trim()) {
      createMutation.mutate(newTableName.trim());
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
    <div>
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-border/40 pb-3">
        <button
          onClick={() => setSubTab('live')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            subTab === 'live'
              ? 'bg-foreground text-background shadow-lg'
              : 'text-muted-foreground hover:bg-secondary/50'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          {t('tables.liveView')}
        </button>
        <button
          onClick={() => setSubTab('qr')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            subTab === 'qr'
              ? 'bg-foreground text-background shadow-lg'
              : 'text-muted-foreground hover:bg-secondary/50'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          {t('tables.qrManagement')}
        </button>
      </div>

      {subTab === 'live' ? (
        <LiveTablesView />
      ) : (
        <>
          {isLoading && <div>{t('tables.loadingTables')}</div>}

          {!isLoading && (
            <>
              <h2 className="text-xl font-semibold mb-4">{t('tables.title')}</h2>

              <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
                <form onSubmit={handleCreate} className="flex gap-2 flex-1">
                  <Input
                    type="text"
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    placeholder={t('tables.addPlaceholder')}
                  />
                  <Button type="submit" disabled={createMutation.isPending || !newTableName.trim()}>
                    {createMutation.isPending ? t('tables.adding') : t('tables.addButton')}
                  </Button>
                </form>

                <Button
                  variant="outline"
                  onClick={() => window.print()}
                  disabled={!tables || tables.length === 0}
                  className="gap-2 shrink-0"
                >
                  <Printer className="w-4 h-4" />
                  {t('tables.printAllQr')}
                </Button>
              </div>

              <div className="space-y-4">
                {tables?.length === 0 && (
                  <p className="text-muted-foreground">{t('tables.noTables')}</p>
                )}
                {tables?.map((table: any) => (
                  <div key={table.id} className="flex items-center justify-between p-4 glass-panel rounded-2xl group hover:-translate-y-0.5 transition-all duration-300">
                    <div>
                      <span className="font-medium text-lg">{table.name}</span>
                      {(() => {
                        const session = sessionByTableId.get(table.id);
                        if (!session) return null;
                        return (
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-block w-2 h-2 rounded-full ${session.status === 'OPEN' ? 'bg-orange-400' : 'bg-green-400'}`} />
                            <span className="text-xs text-muted-foreground">
                              {session.status === 'OPEN' ? t('tables.sessionOpen') : t('tables.sessionPaid')}
                            </span>
                            {session.status === 'OPEN' && (
                              <button
                                onClick={() => closeSessionMutation.mutate({ token: session.token, restaurantId })}
                                className="text-xs text-muted-foreground hover:text-red-500 underline"
                              >
                                {t('tables.closeSession')}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => handleShowQr(table)}>
                        {t('tables.generateQR')}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => deleteMutation.mutate(table.id)}
                        disabled={deleteMutation.isPending}
                      >
                        {t('tables.delete')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Modal
                open={isQrModalOpen}
                onOpenChange={setIsQrModalOpen}
                title={selectedTable ? t('tables.qrTitle', { name: selectedTable.name }) : t('tables.generateQR')}
                description={selectedTable ? t('tables.qrInstructions', { name: selectedTable.name }) : undefined}
              >
                {selectedTable && (
                  <div className="flex flex-col items-center">
                    <div className="p-6 bg-white inline-block rounded-[2rem] qr-code-container border-8 border-white shadow-inner mb-6" ref={qrCodeRef}>
                        <QRCodeSVG
                          value={getQrCodeUrl()}
                          size={256}
                          fgColor={restaurant.accentColor || "#000000"}
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
                    <Button className="w-full" onClick={handleDownloadQR}>
                      {t('tables.downloadPNG')}
                    </Button>
                  </div>
                )}
              </Modal>

              <PrintableQRCodes restaurant={restaurant} tables={tables || []} />
            </>
          )}
        </>
      )}
    </div>
  );
};

export default TableView;

