export interface DerivedThemeVars {
  '--primary-color': string;
  '--primary-hover': string;
  '--accent-color': string;
  '--bot-msg-bg': string;
  '--bot-msg-border': string;
  '--bg-gradient-top': string;
  '--bg-dark': string;
  '--bg-card': string;
  '--bg-sidebar': string;
  '--bg-header': string;
  '--border-color': string;
  '--user-msg-bg': string;
  '--bg-muted': string;
}

function normalizeHex(hex: string): string {
  const cleaned = hex.trim().replace('#', '');
  if (cleaned.length === 3) {
    return `#${cleaned
      .split('')
      .map((ch) => ch + ch)
      .join('')}`.toLowerCase();
  }
  if (cleaned.length === 6) {
    return `#${cleaned}`.toLowerCase();
  }
  return '#ff8c6b';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex).replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function mixColors(base: string, target: string, baseRatio: number): string {
  const a = hexToRgb(base);
  const b = hexToRgb(target);
  const targetRatio = 1 - baseRatio;
  return `#${toHex(a.r * baseRatio + b.r * targetRatio)}${toHex(a.g * baseRatio + b.g * targetRatio)}${toHex(a.b * baseRatio + b.b * targetRatio)}`;
}

function toRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getDerivedThemeVars(primaryColor: string): DerivedThemeVars {
  const primary = normalizeHex(primaryColor);
  return {
    '--primary-color': primary,
    '--primary-hover': mixColors(primary, '#000000', 0.85),
    '--accent-color': mixColors(primary, '#ffffff', 0.8),
    '--bot-msg-bg': mixColors(primary, '#ffffff', 0.12),
    '--bot-msg-border': mixColors(primary, '#ffffff', 0.25),
    '--bg-gradient-top': mixColors(primary, '#ffffff', 0.07),
    '--bg-dark': mixColors(primary, '#ffffff', 0.02),
    '--bg-card': mixColors(primary, '#ffffff', 0.015),
    '--bg-sidebar': mixColors(primary, '#ffffff', 0.045),
    '--bg-header': toRgba(mixColors(primary, '#ffffff', 0.02), 0.72),
    '--border-color': mixColors(primary, '#ffffff', 0.12),
    '--user-msg-bg': mixColors(primary, '#ffffff', 0.06),
    '--bg-muted': mixColors(primary, '#ffffff', 0.1)
  };
}
