/**
 * The one place colours live. Three.js reads the numbers directly; the same
 * values are pushed into CSS custom properties at boot (see applyCssTheme), so
 * restyling the whole site means editing this object.
 */
export const PALETTE = {
  bg: 0xf2ede4,
  ink: 0x3a3532,
  inkSoft: 0x6f655d,
  accent: 0xe2704a,
  accentDeep: 0xc4562f,
  accentSoft: 0xf6c7b5,

  boardLight: 0xe8dcc8,
  boardDark: 0xb89f82,
  boardRim: 0x8f7960,
  boardBase: 0x6f5c49,

  white: 0xfaf7f2,
  whiteShade: 0xe3dccf,
  black: 0x3a3532,
  blackShade: 0x4f4944,

  plinth: 0xd9cbb3,
  plinthDark: 0xb9a78c,
  ghost: 0xcfc6b8,
  ground: 0xe9e1d3,
  shadow: 0x6b5a45,
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
