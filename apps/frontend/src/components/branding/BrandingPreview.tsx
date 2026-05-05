import React from 'react';

interface BrandingPreviewProps {
  fontHeading: string;
  fontBody: string;
  themeBgColor: string;
  themeTextColor: string;
  themeCardColor: string;
  accentColor: string;
}

export const BrandingPreview: React.FC<BrandingPreviewProps> = ({
  fontHeading,
  fontBody,
  themeBgColor,
  themeTextColor,
  themeCardColor,
  accentColor,
}) => {
  return (
    <div
      className="rounded-[2.5rem] border border-border shadow-2xl overflow-hidden transition-all duration-500"
      style={{ backgroundColor: themeBgColor, color: themeTextColor }}
    >
      {/* Header mockup */}
      <div className="p-8 text-center border-b border-white/10" style={{ borderColor: `${themeTextColor}20` }}>
        <h1 
          className="text-4xl font-bold tracking-tight mb-2 transition-all duration-500"
          style={{ fontFamily: fontHeading }}
        >
          Grand Menu
        </h1>
        <p className="opacity-70 text-sm transition-all duration-500" style={{ fontFamily: fontBody }}>
          A culinary experience tailored for you
        </p>
      </div>

      {/* Content mockup */}
      <div className="p-6 md:p-10 space-y-8">
        <div className="flex flex-col items-center mb-6">
          <h2 
            className="text-2xl font-bold tracking-tight mb-3 transition-all duration-500"
            style={{ fontFamily: fontHeading }}
          >
            Signature Dishes
          </h2>
          <div className="w-12 h-1 rounded-full" style={{ backgroundColor: accentColor }}></div>
        </div>

        {/* Card Mockup */}
        <div 
          className="p-6 rounded-[2rem] shadow-lg flex flex-col justify-between transition-all duration-500"
          style={{ backgroundColor: themeCardColor }}
        >
          <div>
            <div className="w-full aspect-[4/3] bg-black/10 rounded-2xl mb-4 overflow-hidden relative">
              <div className="absolute inset-0 flex items-center justify-center opacity-20">
                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            
            <div className="flex justify-between items-start mb-2">
              <h3 
                className="text-xl font-bold transition-all duration-500"
                style={{ fontFamily: fontHeading }}
              >
                Truffle Burrata
              </h3>
              <p 
                className="font-black text-lg transition-all duration-500"
                style={{ color: accentColor, fontFamily: fontBody }}
              >
                €18.00
              </p>
            </div>
            
            <p 
              className="text-sm opacity-80 leading-relaxed mb-6 transition-all duration-500"
              style={{ fontFamily: fontBody }}
            >
              Fresh Italian burrata served with black truffle shavings, heirloom tomatoes, and aged balsamic glaze.
            </p>
          </div>
          
          <button
            className="w-full py-3.5 rounded-[1.25rem] font-black uppercase text-[10px] tracking-[0.2em] transition-all"
            style={{ backgroundColor: accentColor, color: '#ffffff', fontFamily: fontBody }}
          >
            Add to order
          </button>
        </div>
      </div>
    </div>
  );
};
