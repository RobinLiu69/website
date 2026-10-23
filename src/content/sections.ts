import type { MatingPiece } from '../chess/types';

export type SectionId = 'about' | 'projects' | 'skills' | 'contact' | 'secret';

export interface SectionMeta {
  id: SectionId;
  /** The piece whose door opens this section (see game/locks.ts). */
  piece: MatingPiece;
}

/** Reading order: used for "next / previous" in the side panel. */
export const SECTIONS: readonly SectionMeta[] = [
  { id: 'about', piece: 'p' },
  { id: 'projects', piece: 'n' },
  { id: 'skills', piece: 'b' },
  { id: 'contact', piece: 'r' },
  { id: 'secret', piece: 'q' },
];

export const sectionForPiece = (piece: MatingPiece): SectionMeta => {
  const meta = SECTIONS.find((s) => s.piece === piece);
  if (!meta) throw new Error(`No section for ${piece}`);
  return meta;
};

export const sectionById = (id: SectionId): SectionMeta => {
  const meta = SECTIONS.find((s) => s.id === id);
  if (!meta) throw new Error(`No section ${id}`);
  return meta;
};
