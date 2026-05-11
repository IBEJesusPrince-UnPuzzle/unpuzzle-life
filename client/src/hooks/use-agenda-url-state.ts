// =============================================================================
// useAgendaUrlState — PR #30b
// =============================================================================
// Single source of truth for the four interactive pieces of agenda state that
// the user can have on screen at once:
//
//   d       YYYY-MM-DD     — anchor date
//   v       day|3day|week|month — current view
//   overlay YYYY-MM-DD     — month-day overlay open for this date (optional)
//   task    N              — view-modal open for this agenda task id (optional)
//   master  N              — masterId for virtual recurring instances (optional)
//
// Why URL-state: browser Back must unwind the open stack (popup → overlay →
// agenda) AND, after navigating to /projects/:id or /responsibilities/:id,
// Back must restore the agenda exactly as it was when [Open …] was clicked.
//
// This hook keeps `window.location.search` in sync with React state via
// pushState/replaceState/back/popstate. Each layer (overlay open, popup open)
// is its own history entry, so the natural Back button does the right thing.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";

export type AgendaView = "day" | "3day" | "week" | "month";

export type AgendaUrlState = {
  d: string;             // YYYY-MM-DD; if missing in URL, defaults to today
  v: AgendaView | null;  // null → caller falls back to /api/agenda-default-view
  overlay: string | null;
  task: number | null;
  master: number | null;
};

function readSearch(search: string): AgendaUrlState {
  const p = new URLSearchParams(search);
  const d = p.get("d");
  const v = p.get("v");
  const overlay = p.get("overlay");
  const task = p.get("task");
  const master = p.get("master");
  const allowedView: AgendaView[] = ["day", "3day", "week", "month"];
  return {
    d: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayIso(),
    v: v && (allowedView as string[]).includes(v) ? (v as AgendaView) : null,
    overlay: overlay && /^\d{4}-\d{2}-\d{2}$/.test(overlay) ? overlay : null,
    task: task && /^\d+$/.test(task) ? Number(task) : null,
    master: master && /^\d+$/.test(master) ? Number(master) : null,
  };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildSearch(state: Partial<AgendaUrlState>): string {
  const p = new URLSearchParams();
  if (state.d) p.set("d", state.d);
  if (state.v) p.set("v", state.v);
  if (state.overlay) p.set("overlay", state.overlay);
  if (state.task != null) p.set("task", String(state.task));
  if (state.master != null) p.set("master", String(state.master));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function useAgendaUrlState() {
  const [state, setState] = useState<AgendaUrlState>(() => readSearch(window.location.search));

  // Sync from URL on browser-driven nav (Back/Forward).
  useEffect(() => {
    const onPop = () => setState(readSearch(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // replaceState — silently update URL without adding a history entry.
  // Used for date/view changes where Back shouldn't undo each tap.
  const replace = useCallback((next: Partial<AgendaUrlState>) => {
    setState((prev) => {
      const merged = { ...prev, ...next };
      const search = buildSearch(merged);
      window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
      return merged;
    });
  }, []);

  // pushState — adds a history entry so Back returns to the previous layer.
  // Used when opening overlay (push ?overlay=...) and popup (push ?task=...).
  const push = useCallback((next: Partial<AgendaUrlState>) => {
    setState((prev) => {
      const merged = { ...prev, ...next };
      const search = buildSearch(merged);
      window.history.pushState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
      return merged;
    });
  }, []);

  // Programmatic Back — used when ✕ is tapped. The popstate listener will
  // re-read the URL and update state, restoring the prior layer.
  const back = useCallback(() => {
    window.history.back();
  }, []);

  // Drop the popup (task/master) from the URL WITHOUT pushing a new entry.
  // Used right before navigating to /projects/:id or /responsibilities/:id
  // so browser Back from there returns to the layer underneath the popup
  // (overlay or bare agenda) rather than re-showing the popup itself.
  const clearPopup = useCallback(() => {
    setState((prev) => {
      const merged = { ...prev, task: null, master: null };
      const search = buildSearch(merged);
      window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
      return merged;
    });
  }, []);

  return useMemo(() => ({ state, replace, push, back, clearPopup }), [state, replace, push, back, clearPopup]);
}
