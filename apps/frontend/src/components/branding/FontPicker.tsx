import React, { useEffect, useState } from 'react';

const FONTS = [
  { name: 'Playfair Display', category: 'Serif' },
  { name: 'Merriweather', category: 'Serif' },
  { name: 'Lora', category: 'Serif' },
  { name: 'Crimson Text', category: 'Serif' },
  { name: 'PT Serif', category: 'Serif' },
  { name: 'Inter', category: 'Sans-Serif' },
  { name: 'Outfit', category: 'Sans-Serif' },
  { name: 'Roboto', category: 'Sans-Serif' },
  { name: 'Open Sans', category: 'Sans-Serif' },
  { name: 'Montserrat', category: 'Sans-Serif' },
  { name: 'Lato', category: 'Sans-Serif' },
  { name: 'Poppins', category: 'Sans-Serif' },
  { name: 'Oswald', category: 'Display' },
  { name: 'Bebas Neue', category: 'Display' },
  { name: 'Lobster', category: 'Display' },
  { name: 'Pacifico', category: 'Display' }
];

interface FontPickerProps {
  label: string;
  value: string;
  onChange: (font: string) => void;
}

export const FontPicker: React.FC<FontPickerProps> = ({ label, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Load fonts dynamically for the preview
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${value.replace(/ /g, '+')}:wght@400;700&display=swap`;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, [value]);

  const categories = Array.from(new Set(FONTS.map(f => f.category)));

  return (
    <div className="relative">
      <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left px-4 py-3 border border-border rounded-xl bg-background text-foreground flex justify-between items-center focus:ring-2 focus:ring-primary/50"
        style={{ fontFamily: value }}
      >
        <span>{value}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 max-h-64 overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-2 custom-scrollbar">
          {categories.map(category => (
            <div key={category} className="mb-4 last:mb-0">
              <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 px-3 py-1 bg-muted/30 rounded-md mb-1 sticky top-0 backdrop-blur-sm">
                {category}
              </div>
              <div className="space-y-1">
                {FONTS.filter(f => f.category === category).map(font => (
                  <button
                    key={font.name}
                    type="button"
                    onClick={() => {
                      onChange(font.name);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${value === font.name ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-foreground'}`}
                  >
                    <span style={{ fontFamily: font.name }}>{font.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
