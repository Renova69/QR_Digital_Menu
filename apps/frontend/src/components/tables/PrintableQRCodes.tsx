import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface PrintableQRCodesProps {
  restaurant: any;
  tables: any[];
}

const PrintableQRCodes: React.FC<PrintableQRCodesProps> = ({ restaurant, tables }) => {
  if (!tables || tables.length === 0) return null;

  const getQrCodeUrl = (tableName: string) => {
    return `${window.location.origin}/menu/public/${restaurant.id}?table=${encodeURIComponent(tableName)}`;
  };

  const logoUrl = restaurant.logoUrl?.startsWith('http') 
    ? restaurant.logoUrl 
    : restaurant.logoUrl 
        ? `${(import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api'}`.replace('/api', '') + `/${restaurant.logoUrl}`
        : null;

  return (
    <div className="hidden print:block absolute inset-0 bg-white z-[99999] print-container">
      <div className="grid grid-cols-2 gap-8 p-8 max-w-[210mm] mx-auto" style={{ width: '210mm' }}>
        {tables.map((table) => (
          <div key={table.id} className="flex flex-col items-center justify-center p-8 border-4 border-dashed border-gray-300 rounded-3xl break-inside-avoid mb-8 h-[130mm]">
            
            {logoUrl && (
              <img 
                src={logoUrl} 
                alt="Restaurant Logo" 
                className="h-16 object-contain mb-6" 
              />
            )}
            
            <h2 className="text-2xl font-serif font-black mb-2 text-center" style={{ color: restaurant.accentColor || '#000' }}>
              {restaurant.name}
            </h2>
            
            <p className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-8 text-center">
              Scan to view menu & order
            </p>

            <div className="p-4 bg-white rounded-3xl shadow-lg border border-gray-100 mb-8">
              <QRCodeSVG
                value={getQrCodeUrl(table.name)}
                size={220}
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

            <div className="w-full text-center py-4 bg-gray-50 rounded-2xl">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Table</p>
              <p className="text-4xl font-black">{table.name}</p>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
};

export default PrintableQRCodes;
