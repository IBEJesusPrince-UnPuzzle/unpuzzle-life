// Puzzle piece descriptors and outcomes
// Used across unpuzzle, project-detail, review, and wizard pages

import type { PieceKey } from "./piece-colors";

export interface PieceDescriptor {
  key: PieceKey;
  label: string;
  descriptor: string;
  outcome: string;
}

export const PUZZLE_DESCRIPTORS: Record<PieceKey, PieceDescriptor> = {
  reason: {
    key: "reason",
    label: "Reason",
    descriptor: "Emotions, beliefs & behavior",
    outcome: "Feel, think & react your best",
  },
  finance: {
    key: "finance",
    label: "Finance",
    descriptor: "Income, expenses & planning",
    outcome: "Afford your best life",
  },
  fitness: {
    key: "fitness",
    label: "Fitness",
    descriptor: "Bodily systems & physical environment",
    outcome: "Function at your best",
  },
  talent: {
    key: "talent",
    label: "Talent",
    descriptor: "Abilities, skills, vocation & career",
    outcome: "Impact at your best",
  },
  pleasure: {
    key: "pleasure",
    label: "Pleasure",
    descriptor: "Desires, satisfactions & enjoyments",
    outcome: "Reward you for being you",
  },
};

export const PUZZLE_DESCRIPTORS_LIST: PieceDescriptor[] = [
  PUZZLE_DESCRIPTORS.reason,
  PUZZLE_DESCRIPTORS.finance,
  PUZZLE_DESCRIPTORS.fitness,
  PUZZLE_DESCRIPTORS.talent,
  PUZZLE_DESCRIPTORS.pleasure,
];

export function getPieceDescriptor(puzzlePiece: string | null | undefined): PieceDescriptor | null {
  if (!puzzlePiece) return null;
  return PUZZLE_DESCRIPTORS[puzzlePiece.toLowerCase() as PieceKey] ?? null;
}
