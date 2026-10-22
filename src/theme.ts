/**
 * The one place colours live. Three.js reads the numbers directly; the same
 * values are pushed into CSS custom properties at boot (see applyCssTheme), so
 * restyling the whole site means editing this object.
 */
export const PALETTE = {
  // The page: chalk on a dark sheet, with one ember of colour for whatever is live.
  bg: 0x0c0c0f,
  bgLift: 0x1a1a20,
  ink: 0xece8df,
  inkSoft: 0x9d998f,
  accent: 0xf0904f,
  accentSoft: 0xf6c9a4,

  // The 3D scene is lit in greys: the sketch pass reads brightness as "how much chalk",
  // so a lighter grey is simply more hatching and a dark one is left as bare sheet.
  boardLight: 0x8c8c8c,
  boardDark: 0x161616,
  boardRim: 0x5a5a5a,
  boardBase: 0x2c2c2c,

  white: 0xf2f2f2,
  whiteShade: 0xdadada,
  whiteDark: 0x2e2e2e,
  whiteLight: 0xffffff,
  black: 0x6a6a6a,
  blackShade: 0x787878,
  blackDark: 0x202020,
  blackLight: 0x969696,
} as const;

export const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export function applyCssTheme(root: HTMLElement = document.documentElement): void {
  const vars: Record<string, number> = {
    '--bg': PALETTE.bg,
    '--bg-lift': PALETTE.bgLift,
    '--ink': PALETTE.ink,
    '--ink-soft': PALETTE.inkSoft,
    '--accent': PALETTE.accent,
    '--accent-soft': PALETTE.accentSoft,
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, hex(value));
}
