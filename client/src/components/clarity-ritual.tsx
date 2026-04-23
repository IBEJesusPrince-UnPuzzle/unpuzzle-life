import { useEffect, useMemo, useState } from "react";
import { getPieceColor, type PieceKey } from "@/lib/piece-colors";

// ============================================================
// Clarity Portal Re-entry Ritual — 4-tier graded system
// ============================================================
//
// Source of truth: docs/clarity-portal-design.md
//
// Tiers, driven by sessionStorage.clarityActiveThisSession + localStorage.lastClarityExit:
//   < 2 min              → no ritual, silent resume
//   2–30 min             → mini ritual (~3s)
//   30 min – 4 hr        → full ritual with 1.5s breath
//   new session OR > 4hr → full ritual + session cue ("yesterday evening", etc.)
//
// Locked copy: "Welcome back." / "Step in." / "You were here: {piece}"

const SESSION_KEY = "clarityActiveThisSession";
const EXIT_KEY = "lastClarityExit";

export type RitualTier = "silent" | "mini" | "full" | "full_with_cue";

export function decideRitualTier(now: number = Date.now()): { tier: RitualTier; awayMs: number } {
  const active = sessionStorage.getItem(SESSION_KEY);
  const exitStr = localStorage.getItem(EXIT_KEY);
  const exit = exitStr ? Number(exitStr) : NaN;
  const awayMs = Number.isFinite(exit) ? Math.max(0, now - exit) : Infinity;

  // New browser session → full + session cue regardless of elapsed time
  if (!active) return { tier: "full_with_cue", awayMs };

  const MIN = 60_000;
  if (awayMs < 2 * MIN) return { tier: "silent", awayMs };
  if (awayMs < 30 * MIN) return { tier: "mini", awayMs };
  if (awayMs < 4 * 60 * MIN) return { tier: "full", awayMs };
  return { tier: "full_with_cue", awayMs };
}

export function markClarityActive() {
  sessionStorage.setItem(SESSION_KEY, "1");
}

export function markClarityExit() {
  localStorage.setItem(EXIT_KEY, String(Date.now()));
}

// Relative time cue: "yesterday evening", "Tuesday", "a few minutes ago", etc.
// Kept intentionally small — covers the realistic gaps (minutes → weeks).
function formatTimeAgo(lastExit: number, now: number = Date.now()): string {
  if (!Number.isFinite(lastExit)) return "a while ago";
  const d = new Date(lastExit);
  const today = new Date(now);
  const diffMs = Math.max(0, now - lastExit);
  const MIN = 60_000;

  if (diffMs < 60 * MIN) return "a few minutes ago";
  if (diffMs < 4 * 60 * MIN) return "earlier today";

  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const isYesterday =
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate();

  const hour = d.getHours();
  const partOfDay =
    hour < 5 ? "late night"
    : hour < 12 ? "morning"
    : hour < 17 ? "afternoon"
    : hour < 21 ? "evening"
    : "night";

  if (sameDay) return `earlier today, ${partOfDay}`;
  if (isYesterday) return `yesterday ${partOfDay}`;

  // Within the past week → weekday name
  if (diffMs < 7 * 24 * 60 * MIN) {
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    return `${weekday} ${partOfDay}`;
  }

  // Older: fall back to a date
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Tailwind-safe gradient classes per piece. Deliberately subtle.
const PIECE_GRADIENT: Record<string, string> = {
  reason:   "from-purple-500/20 via-purple-500/5 to-background",
  finance:  "from-green-500/20 via-green-500/5 to-background",
  fitness:  "from-blue-500/20 via-blue-500/5 to-background",
  talent:   "from-yellow-500/20 via-yellow-500/5 to-background",
  pleasure: "from-red-500/20 via-red-500/5 to-background",
};

export function getPieceGradientClass(piece: string | null | undefined): string {
  const key = (piece || "").toLowerCase();
  return PIECE_GRADIENT[key] || "from-primary/10 via-primary/5 to-background";
}

// ============================================================
// Ritual component
// ============================================================

interface ClarityRitualProps {
  pieceName: string;             // visible label, e.g. "Reason" or user area name
  pieceKey?: PieceKey | string;  // for gradient color
  tier: Exclude<RitualTier, "silent">;
  onDone: () => void;
}

export function ClarityRitual({ pieceName, pieceKey, tier, onDone }: ClarityRitualProps) {
  const gradient = getPieceGradientClass(pieceKey);
  const color = getPieceColor(pieceKey);

  // Session cue text for full_with_cue
  const sessionCue = useMemo(() => {
    if (tier !== "full_with_cue") return "";
    const exitStr = localStorage.getItem(EXIT_KEY);
    const exit = exitStr ? Number(exitStr) : NaN;
    return Number.isFinite(exit) ? formatTimeAgo(exit) : "";
  }, [tier]);

  // Mini ritual: ~3s total, auto-dismiss
  const isMini = tier === "mini";

  // Auto-advance: 10 seconds after last text appears
  // Mini ritual auto-advances earlier
  const autoAdvanceMs = isMini ? 3000 : 10_000;

  // Reveal sequence
  const [step, setStep] = useState(0); // 0 = welcome, 1 = step-in / you-were-here

  useEffect(() => {
    // Advance to step 1 after initial breath
    const breath = isMini ? 400 : 1500;
    const t1 = setTimeout(() => setStep(1), breath);
    const t2 = setTimeout(onDone, autoAdvanceMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isMini, autoAdvanceMs, onDone]);

  // Dismiss on tap or keypress
  useEffect(() => {
    const handler = () => onDone();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDone]);

  return (
    <div
      role="dialog"
      aria-label="Clarity re-entry"
      onClick={onDone}
      data-testid="clarity-ritual"
      className={`fixed inset-0 z-[80] flex flex-col items-center justify-center text-center cursor-pointer
        bg-gradient-to-b ${gradient}
        backdrop-blur-sm
        animate-in fade-in duration-700`}
    >
      <div className="space-y-4 px-8 max-w-md">
        <p
          className={`text-2xl font-light tracking-wide transition-opacity duration-700 ${color.text}`}
          style={{ opacity: 1 }}
        >
          Welcome back.
          {tier === "full" || tier === "full_with_cue" ? (
            <span className="block mt-2">Step in.</span>
          ) : null}
        </p>

        <p
          className={`text-sm text-muted-foreground transition-opacity duration-700 ${step >= 1 ? "opacity-100" : "opacity-0"}`}
        >
          You were here
          {tier === "full_with_cue" && sessionCue ? ` ${sessionCue}` : ""}
          : <span className="font-medium text-foreground">{pieceName}</span>
        </p>
      </div>

      <p className="absolute bottom-6 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">
        Tap anywhere to continue
      </p>
    </div>
  );
}
