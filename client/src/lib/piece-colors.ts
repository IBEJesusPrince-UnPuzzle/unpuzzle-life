// Puzzle piece color definitions
// All keys are LOWERCASE to match database values: reason | finance | fitness | talent | pleasure

export type PieceKey = "reason" | "finance" | "fitness" | "talent" | "pleasure";

export interface PieceColorDef {
  bg: string;
  text: string;
  border: string;
  accent: string;
  label: string;       // Title-case display label
}

export const PIECE_COLORS: Record<PieceKey, PieceColorDef> = {
  reason:   { bg: "bg-purple-500/10",  text: "text-purple-600 dark:text-purple-400",  border: "border-purple-500/30",  accent: "#7C3AED", label: "Reason"   },
  finance:  { bg: "bg-green-500/10",   text: "text-green-600 dark:text-green-400",    border: "border-green-500/30",   accent: "#16A34A", label: "Finance"  },
  fitness:  { bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400",      border: "border-blue-500/30",    accent: "#2563EB", label: "Fitness"  },
  talent:   { bg: "bg-yellow-500/10",  text: "text-yellow-600 dark:text-yellow-400",  border: "border-yellow-500/30",  accent: "#CA8A04", label: "Talent"   },
  pleasure: { bg: "bg-red-500/10",     text: "text-red-600 dark:text-red-400",        border: "border-red-500/30",     accent: "#DC2626", label: "Pleasure" },
};

export const DEFAULT_PIECE_COLOR: PieceColorDef = {
  bg: "bg-primary/5",
  text: "text-primary",
  border: "border-primary/20",
  accent: "",
  label: "",
};

/**
 * Resolves piece colors from a raw puzzlePiece string (handles null, lowercase, and title-case input).
 */
export function getPieceColor(puzzlePiece: string | null | undefined): PieceColorDef {
  if (!puzzlePiece) return DEFAULT_PIECE_COLOR;
  return PIECE_COLORS[puzzlePiece.toLowerCase() as PieceKey] ?? DEFAULT_PIECE_COLOR;
}
