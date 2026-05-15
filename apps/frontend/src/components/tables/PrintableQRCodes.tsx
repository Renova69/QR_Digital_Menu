import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

export type PrintTemplate = 'classic' | 'premium' | 'minimal';

interface PrintableQRCodesProps {
  restaurant: any;
  tables: any[];
  template?: PrintTemplate;
}

function resolveLogoUrl(restaurant: any): string | null {
  if (!restaurant.logoUrl) return null;
  return restaurant.logoUrl.startsWith('http')
    ? restaurant.logoUrl
    : `${(import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api'}`.replace('/api', '') + `/${restaurant.logoUrl}`;
}

function getQrCodeUrl(restaurantId: string, tableName: string): string {
  return `${window.location.origin}/menu/public/${restaurantId}?table=${encodeURIComponent(tableName)}`;
}

// ------------------------------------------------------------------
// Classic template — white card, dashed border, top logo, bottom table name
// ------------------------------------------------------------------
function ClassicCard({ restaurant, table, logoUrl }: { restaurant: any; table: any; logoUrl: string | null }) {
  const accent = restaurant.accentColor || '#111111';
  return (
    <div
      style={{
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
        border: '3px dashed #d1d5db',
        borderRadius: 28,
        padding: '36px 32px',
        marginBottom: 8,
        minHeight: 140,
        maxHeight: 148,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {logoUrl && (
        <img src={logoUrl} alt="logo" style={{ height: 52, objectFit: 'contain', marginBottom: 16 }} />
      )}
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 900, color: accent, textAlign: 'center', margin: '0 0 4px' }}>
        {restaurant.name}
      </h2>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 24, textAlign: 'center' }}>
        Scan to view menu &amp; order
      </p>
      <div style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 1px 8px rgba(0,0,0,0.08)', marginBottom: 24 }}>
        <QRCodeSVG value={getQrCodeUrl(restaurant.id, table.name)} size={160} fgColor={accent} bgColor="#ffffff" level="H"
          imageSettings={logoUrl ? { src: logoUrl, height: 36, width: 36, excavate: true } : undefined} />
      </div>
      <div style={{ width: '100%', textAlign: 'center', background: '#f9fafb', borderRadius: 16, padding: '12px 0' }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 4 }}>Table</p>
        <p style={{ fontSize: 36, fontWeight: 900, color: '#111', margin: 0 }}>{table.name}</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Premium template — dark background, accent QR, serif typography
// ------------------------------------------------------------------
function PremiumCard({ restaurant, table, logoUrl }: { restaurant: any; table: any; logoUrl: string | null }) {
  const accent = restaurant.accentColor || '#d4a853';
  return (
    <div
      style={{
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
        background: '#0f0e0c',
        borderRadius: 28,
        padding: '36px 32px',
        marginBottom: 8,
        minHeight: 140,
        maxHeight: 148,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative corner accents */}
      <div style={{ position: 'absolute', top: 16, left: 16, width: 24, height: 24, borderTop: `2px solid ${accent}`, borderLeft: `2px solid ${accent}`, borderRadius: '4px 0 0 0' }} />
      <div style={{ position: 'absolute', top: 16, right: 16, width: 24, height: 24, borderTop: `2px solid ${accent}`, borderRight: `2px solid ${accent}`, borderRadius: '0 4px 0 0' }} />
      <div style={{ position: 'absolute', bottom: 16, left: 16, width: 24, height: 24, borderBottom: `2px solid ${accent}`, borderLeft: `2px solid ${accent}`, borderRadius: '0 0 0 4px' }} />
      <div style={{ position: 'absolute', bottom: 16, right: 16, width: 24, height: 24, borderBottom: `2px solid ${accent}`, borderRight: `2px solid ${accent}`, borderRadius: '0 0 4px 0' }} />

      {logoUrl && (
        <img src={logoUrl} alt="logo" style={{ height: 44, objectFit: 'contain', marginBottom: 12, filter: 'brightness(0) invert(1)' }} />
      )}
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 900, color: '#ffffff', textAlign: 'center', margin: '0 0 2px', letterSpacing: '0.02em' }}>
        {restaurant.name}
      </h2>
      <div style={{ width: 40, height: 2, background: accent, margin: '8px auto 16px', borderRadius: 2 }} />
      <div style={{ background: '#ffffff', borderRadius: 16, padding: 14, marginBottom: 20 }}>
        <QRCodeSVG value={getQrCodeUrl(restaurant.id, table.name)} size={150} fgColor="#0f0e0c" bgColor="#ffffff" level="H"
          imageSettings={logoUrl ? { src: logoUrl, height: 34, width: 34, excavate: true } : undefined} />
      </div>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent, marginBottom: 4, textAlign: 'center' }}>
        Table
      </p>
      <p style={{ fontSize: 32, fontWeight: 900, color: '#ffffff', margin: 0, fontFamily: 'Georgia, serif', letterSpacing: '0.05em' }}>
        {table.name}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------
// Minimal template — bare QR + table name, ultra-clean
// ------------------------------------------------------------------
function MinimalCard({ restaurant, table }: { restaurant: any; table: any }) {
  const accent = restaurant.accentColor || '#111111';
  return (
    <div
      style={{
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
        border: `1px solid #e5e7eb`,
        borderRadius: 20,
        padding: '28px 24px',
        marginBottom: 8,
        minHeight: 100,
        maxHeight: 148,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <QRCodeSVG value={getQrCodeUrl(restaurant.id, table.name)} size={170} fgColor={accent} bgColor="#ffffff" level="H" />
      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9ca3af', margin: '0 0 4px', fontWeight: 700 }}>
          {restaurant.name} · Table
        </p>
        <p style={{ fontSize: 34, fontWeight: 900, color: '#111', margin: 0 }}>{table.name}</p>
      </div>
    </div>
  );
}

const PrintableQRCodes: React.FC<PrintableQRCodesProps> = ({ restaurant, tables, template = 'classic' }) => {
  if (!tables || tables.length === 0) return null;
  const logoUrl = resolveLogoUrl(restaurant);

  return (
    <div className="hidden print:block absolute inset-0 bg-white z-[99999] print-container">
      <style>{`@page { size: A4 portrait; margin: 12mm; } body { margin: 0; }`}</style>
      <div style={{ width: '100%' }}>
        {tables.map((table) => {
          if (template === 'premium') return <PremiumCard key={table.id} restaurant={restaurant} table={table} logoUrl={logoUrl} />;
          if (template === 'minimal') return <MinimalCard key={table.id} restaurant={restaurant} table={table} />;
          return <ClassicCard key={table.id} restaurant={restaurant} table={table} logoUrl={logoUrl} />;
        })}
      </div>
    </div>
  );
};

export default PrintableQRCodes;
