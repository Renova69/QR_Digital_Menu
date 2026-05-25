/**
 * Helper utilities for color manipulation and contrast checking
 */

// Convert hex to RGB
const hexToRgb = (hex: string): { r: number, g: number, b: number } | null => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => {
        return r + r + g + g + b + b;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

// Calculate relative luminance for WCAG contrast
const getLuminance = (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

export const getContrastRatio = (hex1: string, hex2: string): number => {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    
    if (!rgb1 || !rgb2) return 1;

    const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

    const lightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);

    return (lightest + 0.05) / (darkest + 0.05);
};

export const getContrastStatus = (bgColor: string, textColor: string) => {
    const ratio = getContrastRatio(bgColor, textColor);
    if (ratio >= 4.5) return { status: 'pass', message: 'Good contrast', ratio };
    if (ratio >= 3.0) return { status: 'warning', message: 'Low contrast, readability might suffer', ratio };
    return { status: 'fail', message: 'Poor contrast, text may be invisible', ratio };
};

export const getReadableTextColor = (bgColor: string): '#FFFFFF' | '#111111' => {
    return getContrastRatio(bgColor, '#FFFFFF') >= getContrastRatio(bgColor, '#111111')
        ? '#FFFFFF'
        : '#111111';
};
