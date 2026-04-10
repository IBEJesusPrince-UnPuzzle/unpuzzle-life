import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft, Download, Upload, Trash2, Save, CheckCircle2, XCircle,
  ChevronDown, FileJson,
} from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";

const API_BASE = "__PORT_5000__";

const TABLE_FIELDS: Record<string, string[]> = {
  purposes: ["id", "statement", "principles", "createdAt"],
  visions: ["id", "title", "description", "timeframe", "status", "createdAt", "anchorMoments"],
  goals: ["id", "title", "description", "visionId", "targetDate", "status", "createdAt"],
  areas: ["id", "name", "description", "category", "puzzlePiece", "visionText", "icon", "sortOrder", "archived"],
  projects: ["id", "title", "description", "areaId", "goalId", "puzzlePiece", "identityId", "status", "dueDate", "createdAt"],
  actions: ["id", "title", "notes", "projectId", "areaId", "context", "energy", "timeEstimate", "dueDate", "completed", "completedAt", "createdAt"],
  identities: ["id", "statement", "areaId", "visionId", "cue", "craving", "response", "reward", "frequency", "targetCount", "active", "timeOfDay", "puzzlePiece", "location", "environmentType", "createdAt"],
  habits: ["id", "name", "description", "identityId", "cue", "craving", "response", "reward", "frequency", "targetCount", "active", "createdAt", "areaId", "timeOfDay"],
  habitLogs: ["id", "habitId", "date", "count", "note"],
  routineItems: ["id", "sortOrder", "time", "durationMinutes", "location", "cue", "craving", "response", "reward", "areaId", "habitId", "dayVariant", "active", "isDraft", "timeOfDay"],
  routineLogs: ["id", "routineItemId", "date", "completedAt", "note"],
  plannerTasks: ["id", "date", "areaId", "goal", "startTime", "endTime", "hours", "result", "status", "recurrence", "habitId", "isDraft", "sourceType"],
  inboxItems: ["id", "content", "notes", "processed", "processedAs", "deletedAt", "referenceAreaId", "referenceProjectId", "areaId", "createdAt"],
  weeklyReviews: ["id", "weekOf", "wins", "lessons", "nextWeekFocus", "inboxCleared", "projectsReviewed", "habitsReviewed", "puzzlePieceRatings", "createdAt"],
  environmentEntities: ["id", "identityId", "areaId", "puzzlePiece", "type", "personName", "personContactMethod", "personContactInfo", "personWhy", "placeName", "placeAddress", "placeTravelMethod", "placeWhy", "thingName", "thingUsage", "thingWhy", "createdAt"],
  beliefs: ["id", "puzzlePiece", "areaId", "oldBelief", "newBelief", "whyItMatters", "repetitionCount", "graduated", "graduatedAt", "active", "createdAt"],
  antiHabits: ["id", "puzzlePiece", "areaId", "identityId", "title", "description", "makeInvisible", "makeUnattractive", "makeDifficult", "makeUnsatisfying", "currentStreak", "longestStreak", "lastSlipDate", "active", "createdAt"],
  immutableLaws: ["id", "puzzlePiece", "title", "statement", "whyItMatters", "linkedIdentityIds", "isPrimary", "isRedLine", "enforcementLevel", "triggerConditions", "active", "createdAt"],
  immutableLawLogs: ["id", "immutableLawId", "puzzlePiece", "date", "kept", "note", "triggerType", "wasOverride", "overrideReason", "suggestedAntiHabitId", "createdAt"],
  wizardState: ["id", "currentPhase", "completed", "completedAt"],
};

function buildTemplate() {
  const data: Record<string, any[]> = {};
  for (const [table, fields] of Object.entries(TABLE_FIELDS)) {
    const example: Record<string, any> = {};
    for (const f of fields) {
      if (f === "id") example[f] = 1;
      else if (f.endsWith("Id")) example[f] = null;
      else if (f === "createdAt" || f === "completedAt" || f === "graduatedAt" || f === "deletedAt") example[f] = new Date().toISOString();
      else if (f === "date" || f === "weekOf" || f === "targetDate" || f === "dueDate" || f === "lastSlipDate") example[f] = new Date().toISOString().split("T")[0];
      else if (["completed", "processed", "graduated", "active", "archived", "isPrimary", "isRedLine", "wasOverride", "isDraft", "inboxCleared", "projectsReviewed", "habitsReviewed"].includes(f)) example[f] = 0;
      else if (["sortOrder", "count", "targetCount", "durationMinutes", "timeEstimate", "repetitionCount", "currentStreak", "longestStreak", "enforcementLevel", "currentPhase"].includes(f)) example[f] = 1;
      else example[f] = "";
    }
    data[table] = [example];
  }
  return { exportDate: new Date().toISOString(), version: 1, data };
}

export default function DataPage() {
  const { toast } = useToast();
  const { data: prefs } = usePreferences();

  // Preferences state
  const [displayName, setDisplayName] = useState("");
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Sync initial preferences
  if (prefs && !prefsLoaded) {
    setDisplayName(prefs.displayName);
    setTimeFormat(prefs.timeFormat);
    setPrefsLoaded(true);
  }

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<any>(null);
  const [importValidation, setImportValidation] = useState<Record<string, { valid: boolean; count: number; error?: string }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fieldGuideOpen, setFieldGuideOpen] = useState(false);

  // Reset state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");

  // Mutations
  const savePrefsMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/preferences", { displayName, timeFormat }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      toast({ title: "Preferences saved" });
    },
  });

  const importMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/import/json", data).then(r => r.json()),
    onSuccess: (result) => {
      const counts = result.counts || {};
      const total = Object.values(counts).reduce((a: number, b: any) => a + (b as number), 0);
      toast({ title: `Import complete — ${total} records imported` });
      setImportFile(null);
      setImportData(null);
      setImportValidation({});
      // Invalidate everything
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reset"),
    onSuccess: () => {
      toast({ title: "Database reset" });
      setResetDialogOpen(false);
      setResetConfirm("");
      queryClient.invalidateQueries();
      window.location.hash = "#/";
    },
  });

  // File handling
  const handleFileSelect = useCallback((file: File) => {
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (!json.data || typeof json.data !== "object") {
          setImportValidation({ _error: { valid: false, count: 0, error: "Missing 'data' key" } });
          setImportData(null);
          return;
        }
        setImportData(json);
        const validation: Record<string, { valid: boolean; count: number; error?: string }> = {};
        for (const [key, rows] of Object.entries(json.data)) {
          if (!TABLE_FIELDS[key]) {
            validation[key] = { valid: false, count: 0, error: "Unknown table" };
          } else if (!Array.isArray(rows)) {
            validation[key] = { valid: false, count: 0, error: "Not an array" };
          } else {
            validation[key] = { valid: true, count: (rows as any[]).length };
          }
        }
        setImportValidation(validation);
      } catch {
        setImportValidation({ _error: { valid: false, count: 0, error: "Invalid JSON" } });
        setImportData(null);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".json")) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const downloadTemplate = () => {
    const template = buildTemplate();
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unpuzzle-life-template.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExportJson = () => {
    window.location.href = `${API_BASE}/api/export/json`;
  };

  const downloadExportCsv = () => {
    window.location.href = `${API_BASE}/api/export/csv`;
  };

  const hasValidationErrors = importValidation._error || Object.values(importValidation).some(v => !v.valid);
  const hasAnyValidation = Object.keys(importValidation).length > 0 && !importValidation._error;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="p-2 rounded-md hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Data</h1>
          <p className="text-sm text-muted-foreground">Manage your preferences and data</p>
        </div>
      </div>

      {/* Section 1: Preferences */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="text-base font-semibold">Preferences</h2>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              placeholder="Enter your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 50))}
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label>Time Format</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="timeFormat"
                  value="12h"
                  checked={timeFormat === "12h"}
                  onChange={() => setTimeFormat("12h")}
                  className="accent-primary"
                />
                <span className="text-sm">12-hour</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="timeFormat"
                  value="24h"
                  checked={timeFormat === "24h"}
                  onChange={() => setTimeFormat("24h")}
                  className="accent-primary"
                />
                <span className="text-sm">24-hour</span>
              </label>
            </div>
          </div>

          <Button onClick={() => savePrefsMutation.mutate()} disabled={savePrefsMutation.isPending}>
            <Save className="w-4 h-4 mr-1.5" />
            Save Preferences
          </Button>
        </CardContent>
      </Card>

      {/* Section 2: Export */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="text-base font-semibold">Export Your Data</h2>
          <p className="text-sm text-muted-foreground">Download a complete backup of all your data.</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={downloadExportJson}>
              <Download className="w-4 h-4 mr-1.5" /> Export JSON
            </Button>
            <Button variant="outline" onClick={downloadExportCsv}>
              <Download className="w-4 h-4 mr-1.5" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Import */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="text-base font-semibold">Import Data</h2>
          <p className="text-sm text-muted-foreground">Restore from a previous export or start with prepared data.</p>

          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-1.5" /> Download Template
          </Button>

          {/* Field Guide */}
          <Collapsible open={fieldGuideOpen} onOpenChange={setFieldGuideOpen}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${fieldGuideOpen ? "rotate-180" : ""}`} />
              Field Guide
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-3 space-y-2">
                {Object.entries(TABLE_FIELDS).map(([table, fields]) => (
                  <div key={table}>
                    <p className="text-xs font-semibold text-foreground">{table}</p>
                    <p className="text-[11px] text-muted-foreground">{fields.join(", ")}</p>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
          >
            <FileJson className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">{importFile ? importFile.name : "Drop your file here, or tap to browse"}</p>
            <p className="text-xs text-muted-foreground mt-1">Accepts .json files</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
          </div>

          {/* Validation results */}
          {importValidation._error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="w-4 h-4" />
              {importValidation._error.error}
            </div>
          )}
          {hasAnyValidation && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {Object.entries(importValidation).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 text-xs">
                  {val.valid ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  )}
                  <span className="font-medium">{key}</span>
                  {val.valid ? (
                    <span className="text-muted-foreground">{val.count} records</span>
                  ) : (
                    <span className="text-destructive">{val.error}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button
            disabled={!importData || hasValidationErrors || importMutation.isPending}
            onClick={() => importData && importMutation.mutate(importData)}
          >
            <Upload className="w-4 h-4 mr-1.5" />
            {importMutation.isPending ? "Importing..." : "Import"}
          </Button>
        </CardContent>
      </Card>

      {/* Section 4: Reset */}
      <Card className="border-destructive/30">
        <CardContent className="p-5 space-y-3">
          <h2 className="text-base font-semibold text-destructive">Danger Zone</h2>
          <p className="text-sm text-muted-foreground">Permanently erase all your data. This cannot be undone.</p>
          <Button variant="destructive" onClick={() => setResetDialogOpen(true)}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Reset Database
          </Button>
        </CardContent>
      </Card>

      {/* Reset confirmation dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={(v) => { setResetDialogOpen(v); if (!v) setResetConfirm(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> Reset Database
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              This will permanently delete <strong>ALL</strong> your data including areas, identities, projects, routines, and everything else.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="resetConfirm" className="text-sm">Type RESET to confirm:</Label>
              <Input
                id="resetConfirm"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="RESET"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setResetDialogOpen(false); setResetConfirm(""); }}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={resetConfirm !== "RESET" || resetMutation.isPending}
                onClick={() => resetMutation.mutate()}
              >
                {resetMutation.isPending ? "Resetting..." : "Reset Everything"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
