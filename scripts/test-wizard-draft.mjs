#!/usr/bin/env node
// Minimal sanity check for the pure storage helpers in use-wizard-draft.
// Run with: node scripts/test-wizard-draft.mjs
//
// We replicate the bits we care about here because the hook module also
// imports React. For full integration verification, use the dev server and
// walk through the manual checklist in the PR description.

const store = new Map();
const localStorage = {
  get length() { return store.size; },
  key(i) { return Array.from(store.keys())[i] ?? null; },
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); },
  clear() { store.clear(); },
};
globalThis.localStorage = localStorage;

const DRAFT_PREFIX = "wizardDraft:";
const ARCHIVE_PREFIX = "wizardDraftArchive:";

function draftKey(u, p, f) { return `${DRAFT_PREFIX}${u}:${p}:${f}`; }
function writeDraft(k, v) {
  if (!v) { localStorage.removeItem(k); return; }
  localStorage.setItem(k, JSON.stringify({ value: v, updatedAt: Date.now() }));
}
function readDraft(k) {
  const raw = localStorage.getItem(k);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function archiveDraft(u, p, f) {
  const key = draftKey(u, p, f);
  const rec = readDraft(key);
  if (!rec || !rec.value) { localStorage.removeItem(key); return null; }
  const aKey = `${ARCHIVE_PREFIX}${u}:${p}:${f}:${Date.now()}`;
  localStorage.setItem(aKey, JSON.stringify(rec));
  localStorage.removeItem(key);
  return aKey;
}
function listArchives(u, p, f) {
  const prefix = `${ARCHIVE_PREFIX}${u}:${p}:${f}:`;
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    const rec = readDraft(k);
    if (!rec) continue;
    out.push({ ...rec, storageKey: k, archivedAt: Number(k.slice(prefix.length)) });
  }
  return out.sort((a, b) => b.archivedAt - a.archivedAt);
}
function phaseHasDrafts(u, p) {
  const prefix = `${DRAFT_PREFIX}${u}:${p}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix) && readDraft(k)?.value) return true;
  }
  return false;
}

let pass = 0, fail = 0;
function expect(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log("wizard-draft storage helpers");

// 1. write & read
writeDraft(draftKey(1, 1, "purpose"), "hello world");
expect("readDraft returns written value", readDraft(draftKey(1, 1, "purpose"))?.value === "hello world");

// 2. empty clears
writeDraft(draftKey(1, 1, "purpose"), "");
expect("empty write removes key", readDraft(draftKey(1, 1, "purpose")) === null);

// 3. archive
writeDraft(draftKey(1, 1, "purpose"), "v1");
const aKey = archiveDraft(1, 1, "purpose");
expect("archive returns a key", !!aKey);
expect("active draft cleared after archive", readDraft(draftKey(1, 1, "purpose")) === null);

// 4. multiple archives per field
await new Promise(r => setTimeout(r, 5));
writeDraft(draftKey(1, 1, "purpose"), "v2");
archiveDraft(1, 1, "purpose");
const archives = listArchives(1, 1, "purpose");
expect("two archives exist", archives.length === 2);
expect("newest archive first", archives[0].value === "v2");

// 5. phaseHasDrafts
expect("no drafts in phase 2", !phaseHasDrafts(1, 2));
writeDraft(draftKey(1, 2, "area:vision"), "some text");
expect("phase 2 now has drafts", phaseHasDrafts(1, 2));
writeDraft(draftKey(1, 2, "area:vision"), "");
expect("phase 2 empty again", !phaseHasDrafts(1, 2));

// 6. different users don't collide
writeDraft(draftKey(1, 1, "purpose"), "u1");
writeDraft(draftKey(2, 1, "purpose"), "u2");
expect("user 1 draft distinct", readDraft(draftKey(1, 1, "purpose"))?.value === "u1");
expect("user 2 draft distinct", readDraft(draftKey(2, 1, "purpose"))?.value === "u2");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
