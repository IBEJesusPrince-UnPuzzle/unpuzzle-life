import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ============================================================
// Wizard draft autosave — localStorage-only, no server state
// ============================================================
//
// Keys:
//   wizardDraft:{userId}:{phase}:{fieldId}           — active draft slot
//   wizardDraftArchive:{userId}:{phase}:{fieldId}:{ts}  — archived versions
//   wizardActiveThisSession (sessionStorage)         — session flag

export interface DraftRecord {
  value: string;
  updatedAt: number;
}

export interface ArchivedDraft extends DraftRecord {
  storageKey: string;
  archivedAt: number;
}

const SESSION_KEY = "wizardActiveThisSession";
const DRAFT_PREFIX = "wizardDraft:";
const ARCHIVE_PREFIX = "wizardDraftArchive:";

// -- key builders ---------------------------------------------

export function draftKey(userId: string | number, phase: number, fieldId: string): string {
  return `${DRAFT_PREFIX}${userId}:${phase}:${fieldId}`;
}

export function archiveKey(
  userId: string | number,
  phase: number,
  fieldId: string,
  ts: number,
): string {
  return `${ARCHIVE_PREFIX}${userId}:${phase}:${fieldId}:${ts}`;
}

function archivePrefixFor(userId: string | number, phase: number, fieldId: string): string {
  return `${ARCHIVE_PREFIX}${userId}:${phase}:${fieldId}:`;
}

function phaseDraftPrefix(userId: string | number, phase: number): string {
  return `${DRAFT_PREFIX}${userId}:${phase}:`;
}

// -- storage helpers ------------------------------------------

export function readDraft(key: string): DraftRecord | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftRecord;
    if (typeof parsed?.value !== "string" || typeof parsed?.updatedAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: string): void {
  if (!value) {
    localStorage.removeItem(key);
    return;
  }
  const rec: DraftRecord = { value, updatedAt: Date.now() };
  try {
    localStorage.setItem(key, JSON.stringify(rec));
  } catch {
    // Quota exceeded or similar — swallow.
  }
}

export function clearDraft(key: string): void {
  localStorage.removeItem(key);
}

// Move the current active draft (if any) to an archive slot.
// Returns the archive key if one was created, otherwise null.
export function archiveDraft(
  userId: string | number,
  phase: number,
  fieldId: string,
): string | null {
  const key = draftKey(userId, phase, fieldId);
  const rec = readDraft(key);
  if (!rec || !rec.value) {
    localStorage.removeItem(key);
    return null;
  }
  const now = Date.now();
  const aKey = archiveKey(userId, phase, fieldId, now);
  try {
    localStorage.setItem(aKey, JSON.stringify({ value: rec.value, updatedAt: rec.updatedAt }));
  } catch {
    return null;
  }
  localStorage.removeItem(key);
  return aKey;
}

export function listArchives(
  userId: string | number,
  phase: number,
  fieldId: string,
): ArchivedDraft[] {
  const prefix = archivePrefixFor(userId, phase, fieldId);
  const out: ArchivedDraft[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as DraftRecord;
      if (typeof parsed?.value !== "string" || typeof parsed?.updatedAt !== "number") continue;
      const tsStr = k.slice(prefix.length);
      const archivedAt = Number(tsStr);
      if (!Number.isFinite(archivedAt)) continue;
      out.push({
        value: parsed.value,
        updatedAt: parsed.updatedAt,
        storageKey: k,
        archivedAt,
      });
    } catch {
      // ignore
    }
  }
  out.sort((a, b) => b.archivedAt - a.archivedAt);
  return out;
}

// Archive a specific value directly (used when replacing current unsaved content
// during "restore earlier version").
export function archiveValue(
  userId: string | number,
  phase: number,
  fieldId: string,
  value: string,
): string | null {
  if (!value) return null;
  const now = Date.now();
  const aKey = archiveKey(userId, phase, fieldId, now);
  try {
    localStorage.setItem(aKey, JSON.stringify({ value, updatedAt: now }));
  } catch {
    return null;
  }
  return aKey;
}

// For the whole phase — are there any active drafts?
export function phaseHasDrafts(userId: string | number, phase: number): boolean {
  const prefix = phaseDraftPrefix(userId, phase);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) {
      const rec = readDraft(k);
      if (rec && rec.value) return true;
    }
  }
  return false;
}

// Archive and clear every active draft in this phase (used for "Start fresh").
export function archivePhaseDrafts(userId: string | number, phase: number): void {
  const prefix = phaseDraftPrefix(userId, phase);
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  for (const k of keys) {
    const fieldId = k.slice(prefix.length);
    archiveDraft(userId, phase, fieldId);
  }
}

export function isWizardSessionActive(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) != null;
  } catch {
    return false;
  }
}

export function markWizardSessionActive(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // swallow
  }
}

// -- the hook -------------------------------------------------

export interface UseWizardDraftOptions {
  userId: string | number | null | undefined;
  phase: number;
  fieldId: string;
  value: string;
  setValue: (v: string) => void;
  // True once the parent-level restore decision is made (same-session silent
  // restore or cross-session prompt resolved). Autosave still runs regardless,
  // but initial silent restore waits until we know we should apply it.
  restoreReady: boolean;
  // Committed server value for this field, if any. When autosave runs and the
  // value equals the committed value, we do not write a draft (it's redundant).
  committedValue?: string;
  debounceMs?: number;
}

export function useWizardDraft({
  userId,
  phase,
  fieldId,
  value,
  setValue,
  restoreReady,
  committedValue,
  debounceMs = 500,
}: UseWizardDraftOptions) {
  const key = userId != null ? draftKey(userId, phase, fieldId) : null;
  const [archives, setArchives] = useState<ArchivedDraft[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredOnce = useRef(false);

  const refreshArchives = useCallback(() => {
    if (userId == null) return;
    setArchives(listArchives(userId, phase, fieldId));
  }, [userId, phase, fieldId]);

  // Silent same-session restore on mount / when key changes.
  // key changes (e.g. fieldId switches to area:edit:X) re-trigger restore so
  // the new slot's draft is applied.
  useEffect(() => {
    restoredOnce.current = false;
  }, [key]);

  useEffect(() => {
    if (!key || !restoreReady || restoredOnce.current) return;
    const rec = readDraft(key);
    if (rec && rec.value && rec.value !== value) {
      setValue(rec.value);
    }
    restoredOnce.current = true;
    refreshArchives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, restoreReady]);

  // Debounced autosave on value change.
  useEffect(() => {
    if (!key || !restoreReady) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // If value matches committed server value, there's nothing to recover
      // and keeping a redundant draft could trigger the cross-session prompt
      // on the next visit. Treat it as "nothing to draft."
      if (committedValue != null && value === committedValue) {
        clearDraft(key);
        return;
      }
      if (!value) {
        clearDraft(key);
        return;
      }
      writeDraft(key, value);
    }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, value, committedValue, debounceMs, restoreReady]);

  const clearActive = useCallback(() => {
    if (!key) return;
    clearDraft(key);
  }, [key]);

  const restoreArchive = useCallback((archive: ArchivedDraft) => {
    setValue(archive.value);
    refreshArchives();
  }, [setValue, refreshArchives]);

  const archiveCurrent = useCallback((valToArchive: string) => {
    if (userId == null || !valToArchive) return;
    archiveValue(userId, phase, fieldId, valToArchive);
    refreshArchives();
  }, [userId, phase, fieldId, refreshArchives]);

  return useMemo(
    () => ({ archives, clearActive, restoreArchive, archiveCurrent, refreshArchives }),
    [archives, clearActive, restoreArchive, archiveCurrent, refreshArchives],
  );
}

// -- human-friendly timestamps --------------------------------

export function formatArchiveTime(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  if (diff < MIN) return "just now";
  if (diff < HOUR) {
    const m = Math.floor(diff / MIN);
    return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  if (diff < 2 * DAY) return "yesterday";
  if (diff < 7 * DAY) {
    const d = Math.floor(diff / DAY);
    return `${d} days ago`;
  }
  return new Date(ts).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
