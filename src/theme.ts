/**
 * The one place colours live. Three.js reads the numbers directly; the same
 * values are pushed into CSS custom properties at boot (see applyCssTheme), so
 * restyling the whole site means editing this object.
 */
export const PALETTE = {
  // The drawing: ink on paper, with one marker colour for whatever is live.
  bg: 0xf6f3ec,
  ink: 0x1d1d21,
  inkSoft: 0x5d5d63,
  accent: 0xe2704a,
  accentDeep: 0xc4562f,
  accentSoft: 0xf6c7b5,

  // The 3D scene is lit in greys: the sketch pass reads brightness as "how much ink",
  // so a darker grey is simply more hatching.
  boardLight: 0xf2f2f2,
  boardDark: 0xa6a6a6,
  boardRim: 0x9c9c9c,
  boardBase: 0x8a8a8a,

  white: 0xf4f4f4,
  whiteShade: 0xdddddd,
  whiteDark: 0x0e0e0e,
  whiteLight: 0xffffff,
  black: 0x424242,
  blackShade: 0x4e4e4e,
  blackDark: 0x101010,
  blackLight: 0x888888,

  plinth: 0xececec,
  plinthDark: 0xc9c9c9,
  ground: 0xffffff,
  shadow: 0x000000,
} as const;

export const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export function applyCssTheme(root: HTMLElement = document.documentElement): void {
  const vars: Record<string, number> = {
    '--bg': PALETTE.bg,
    '--ink': PALETTE.ink,
    '--ink-soft': PALETTE.inkSoft,
    '--accent': PALETTE.accent,
    '--accent-deep': PALETTE.accentDeep,
    '--accent-soft': PALETTE.accentSoft,
    '--board-light': PALETTE.boardLight,
    '--board-dark': PALETTE.boardDark,
    '--board-rim': PALETTE.boardRim,
    '--plinth': PALETTE.plinth,
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, hex(value));
}
