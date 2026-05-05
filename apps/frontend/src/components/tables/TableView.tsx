import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTables, createTable, deleteTable } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Modal } from '../ui/modal';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import PrintableQRCodes from './PrintableQRCodes';
import RestaurantContext from '../../context/RestaurantContext';

const TableView: React.FC = () => {
  const { activeRestaurant: restaurant } = React.useContext(RestaurantContext) as any;
  const restaurantId = restaurant?.id;
  const queryClient = useQueryClient();
  const [newTableName, setNewTableName] = useState('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<{ id: string; name: string } | null>(null);
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

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

  if (isLoading) return <div>{t('tables.loadingTables')}</div>;

  return (
    <div>
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
          Print All QR Codes
        </Button>
      </div>

      <div className="space-y-4">
        {tables?.length === 0 && (
          <p className="text-muted-foreground">{t('tables.noTables')}</p>
        )}
        {tables?.map((table: any) => (
          <div key={table.id} className="flex items-center justify-between p-4 glass-panel rounded-2xl group hover:-translate-y-0.5 transition-all duration-300">
            <span className="font-medium text-lg">{table.name}</span>
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
    </div>
  );
};

export default TableView;

