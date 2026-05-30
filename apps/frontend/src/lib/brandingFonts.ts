// Single source of truth for the branding fonts offered in the editor and
// loaded on the public menu (#12). The public menu allowlist MUST match the
// editor's options, otherwise a font an owner picks silently fails to load.
// `fontHeading`/`fontBody` are interpolated into a Google Fonts URL, so this
// list also acts as the injection allowlist — never load an arbitrary value.

export type FontCategory = 'Serif' | 'Sans-Serif' | 'Display';

export interface BrandingFont {
  name: string;
  category: FontCategory;
  pairsWith: string[];
}

export const BRANDING_FONTS: BrandingFont[] = [
  { name: 'Playfair Display', category: 'Serif', pairsWith: ['Outfit', 'Lato', 'Karla', 'Open Sans'] },
  { name: 'Merriweather', category: 'Serif', pairsWith: ['Open Sans', 'Lato', 'Roboto'] },
  { name: 'Lora', category: 'Serif', pairsWith: ['Lato', 'Open Sans', 'Karla'] },
  { name: 'Crimson Text', category: 'Serif', pairsWith: ['Outfit', 'Karla', 'Open Sans'] },
  { name: 'PT Serif', category: 'Serif', pairsWith: ['Open Sans', 'Roboto'] },
  { name: 'Inter', category: 'Sans-Serif', pairsWith: ['Inter', 'Outfit', 'Lato'] },
  { name: 'Outfit', category: 'Sans-Serif', pairsWith: ['Outfit', 'Inter', 'Playfair Display'] },
  { name: 'Roboto', category: 'Sans-Serif', pairsWith: ['Roboto', 'Open Sans', 'Merriweather'] },
  { name: 'Open Sans', category: 'Sans-Serif', pairsWith: ['Merriweather', 'Lora', 'Oswald'] },
  { name: 'Montserrat', category: 'Sans-Serif', pairsWith: ['Montserrat', 'Open Sans', 'Lato'] },
  { name: 'Lato', category: 'Sans-Serif', pairsWith: ['Playfair Display', 'Lora', 'Merriweather'] },
  { name: 'Poppins', category: 'Sans-Serif', pairsWith: ['Poppins', 'Open Sans', 'Lato'] },
  { name: 'Karla', category: 'Sans-Serif', pairsWith: ['Playfair Display', 'Crimson Text', 'Lora'] },
  { name: 'Oswald', category: 'Display', pairsWith: ['Open Sans', 'Roboto', 'Lato'] },
  { name: 'Bebas Neue', category: 'Display', pairsWith: ['Roboto', 'Open Sans', 'Lato'] },
  { name: 'Lobster', category: 'Display', pairsWith: ['Open Sans', 'Lato', 'Roboto'] },
  { name: 'Pacifico', category: 'Display', pairsWith: ['Open Sans', 'Lato', 'Outfit'] },
];

/** Set of allowed font family names — the public-menu load allowlist. */
export const BRANDING_FONT_NAMES: ReadonlySet<string> = new Set(
  BRANDING_FONTS.map((f) => f.name),
);
