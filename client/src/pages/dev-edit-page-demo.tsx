// /dev/edit-page-demo — Phase 5 (§10, §11) — DEV-ONLY DEMO
//
// Throwaway route used to verify EditPageHeader, EditPageUndoBar, and
// useAutosaveDraft together on mobile viewports before wiring them into
// the real Project v2 / Responsibility edit pages.
//
// Not linked from nav. Reachable only by typing the URL.

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EditPageHeader } from "@/components/edit-page-header";
import { EditPageUndoBar } from "@/components/edit-page-undo-bar";
import { useAutosaveDraft } from "@/lib/use-autosave-draft";

interface DemoSupport {
  id: number;
  label: string;
}

interface DemoDraft {
  name: string;
  outcome: string;
  supports: DemoSupport[];
}

const INITIAL: DemoDraft = {
  name: "Replace car battery",
  outcome: "Car starts reliably for school drop-off",
  supports: [
    { id: 1, label: "Car" },
    { id: 2, label: "Keys" },
    { id: 3, label: "Uber" },
  ],
};

export default function DevEditPageDemoRoute() {
  // Simulated server value. In real pages this comes from useQuery.
  const [serverValue, setServerValue] = useState<DemoDraft>(INITIAL);

  // Fake save: resolves after 200ms; updates simulated server state.
  async function fakeSave(next: DemoDraft) {
    await new Promise(r => setTimeout(r, 200));
    setServerValue(next);
  }

  const draftState = useAutosaveDraft<DemoDraft>({
    value: serverValue,
    save: fakeSave,
    debounceMs: 400,
  });

  const {
    draft,
    setDraft,
    canUndo,
    canRedo,
    canRevert,
    undo,
    redo,
    revert,
    done,
    isSaving,
    savedAt,
    isDirty,
    markedForRemoval,
    markForRemoval,
    undoRemoval,
    clearRemovals,
    removalCount,
  } = draftState;

  function commitRemovals() {
    // Apply pending removals to the draft, then clear the queue.
    if (removalCount === 0) return;
    setDraft({
      ...draft,
      supports: draft.supports.filter(
        s => !markedForRemoval.has(`support:${s.id}`),
      ),
    });
    clearRemovals();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <EditPageHeader
        backHref="/"
        title="Edit demo item"
        infoContent={
          <div className="space-y-1">
            <p className="font-medium text-xs">Demo edit page</p>
            <p>
              This route exercises the shared autosave header, undo/redo,
              revert draft, marks-for-removal, and the bottom undo bar.
              Used during PR #16 verification only.
            </p>
          </div>
        }
        savedAt={savedAt}
        isSaving={isSaving}
        isDirty={isDirty}
        canUndo={canUndo}
        canRedo={canRedo}
        canRevert={canRevert}
        onUndo={undo}
        onRedo={redo}
        onRevert={revert}
        onDone={done}
      />

      <div className="flex-1 p-3 space-y-4 max-w-xl mx-auto w-full">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="demo-name">
                Name
              </Label>
              <p className="text-[11px] italic text-muted-foreground -mt-0.5">
                -name the temporary effort
              </p>
              <Input
                id="demo-name"
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                className="text-sm h-9"
                data-testid="input-demo-name"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs" htmlFor="demo-outcome">
                Outcome done
              </Label>
              <p className="text-[11px] italic text-muted-foreground -mt-0.5">
                -what does finished look like?
              </p>
              <Input
                id="demo-outcome"
                value={draft.outcome}
                onChange={e => setDraft({ ...draft, outcome: e.target.value })}
                className="text-sm h-9"
                data-testid="input-demo-outcome"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Linked supports</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={commitRemovals}
                disabled={removalCount === 0}
                data-testid="button-commit-removals"
              >
                Commit removals
              </Button>
            </div>
            <p className="text-[11px] italic text-muted-foreground -mt-1">
              -supports this project depends on
            </p>
            <div className="space-y-1.5">
              {draft.supports.map(s => {
                const key = `support:${s.id}`;
                const marked = markedForRemoval.has(key);
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 text-sm py-1.5 px-2 rounded border ${
                      marked
                        ? "bg-muted text-muted-foreground"
                        : "bg-background"
                    }`}
                    data-testid={`row-support-${s.id}`}
                  >
                    <span className={`flex-1 ${marked ? "line-through" : ""}`}>
                      {s.label}
                    </span>
                    {marked ? (
                      <>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          marked for removal
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => undoRemoval(key)}
                          data-testid={`button-undo-${s.id}`}
                        >
                          Undo
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => markForRemoval(key)}
                        data-testid={`button-remove-${s.id}`}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Debug state</p>
            <pre className="text-[10px] leading-tight whitespace-pre-wrap break-all">
              {JSON.stringify(
                {
                  isSaving,
                  isDirty,
                  canUndo,
                  canRedo,
                  removalCount,
                  savedAt,
                },
                null,
                2,
              )}
            </pre>
          </CardContent>
        </Card>
      </div>

      <EditPageUndoBar count={removalCount} onUndoAll={clearRemovals} />
    </div>
  );
}
