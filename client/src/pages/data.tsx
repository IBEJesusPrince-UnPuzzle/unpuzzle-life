import { useState, useRef, useCallback, useEffect } from "react";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Download, Upload, Trash2, Save, CheckCircle2, XCircle,
  FileSpreadsheet, FileText, AlertTriangle,
} from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";

const API_BASE = "__PORT_5000__";

type ImportMode = "workbook" | "csv";
type CsvMode = "add" | "replace";

export default function DataPage() {
  const { toast } = useToast();
  const { data: prefs } = usePreferences();

  // Preferences state
  const [displayName, setDisplayName] = useState("");
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");
  const [claritySkipRitual, setClaritySkipRitual] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Sync initial preferences
  if (prefs && !prefsLoaded) {
    setDisplayName(prefs.displayName);
    setTimeFormat(prefs.timeFormat);
    setClaritySkipRitual(!!prefs.claritySkipRitual);
    setPrefsLoaded(true);
  }

  // Import state
  const [importMode, setImportMode] = useState<ImportMode>("workbook");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<{ counts?: Record<string, number>; errors?: string[]; count?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CSV-specific state
  const [csvSheetName, setCsvSheetName] = useState("");
  const [csvMode, setCsvMode] = useState<CsvMode>("add");

  // Reset state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");

  // Fetch available sheet names
  const { data: meta } = useQuery({
    queryKey: ["/api/import/meta"],
    queryFn: () => apiRequest("GET", "/api/import/meta").then(r => r.json()),
  });

  const sheets: string[] = meta?.sheets || [];
  const leafTables: string[] = meta?.leafTables || [];

  // Reset file when switching modes
  useEffect(() => {
    setImportFile(null);
    setImportResult(null);
  }, [importMode]);

  // Mutations
  const savePrefsMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/preferences", { displayName, timeFormat, claritySkipRitual }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      toast({ title: "Preferences saved" });
    },
  });

  const importXlsxMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return fetch(`${API_BASE}/api/import/xlsx`, {
        method: "POST",
        body: formData,
        credentials: "include",
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: "Import failed" }));
          throw new Error(err.error || "Import failed");
        }
        return r.json();
      });
    },
    onSuccess: (result) => {
      setImportResult(result);
      const totalCount = result.counts ? Object.values(result.counts).reduce((a: number, b: any) => a + (b as number), 0) : 0;
      toast({ title: `Workbook import complete — ${totalCount} records imported` });
      setImportFile(null);
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: ({ file, sheetName, mode }: { file: File; sheetName: string; mode: CsvMode }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sheetName", sheetName);
      formData.append("mode", mode);
      return fetch(`${API_BASE}/api/import/csv`, {
        method: "POST",
        body: formData,
        credentials: "include",
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: "Import failed" }));
          throw new Error(err.error || "Import failed");
        }
        return r.json();
      });
    },
    onSuccess: (result) => {
      setImportResult(result);
      toast({ title: `CSV import complete — ${result.count || 0} records imported` });
      setImportFile(null);
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
  const acceptedExt = importMode === "workbook" ? ".xlsx" : ".csv";
  const handleFileSelect = useCallback((file: File) => {
    setImportFile(file);
    setImportResult(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleImport = () => {
    if (!importFile) return;
    if (importMode === "workbook") {
      importXlsxMutation.mutate(importFile);
    } else {
      if (!csvSheetName) {
        toast({ title: "Select a table first", variant: "destructive" });
        return;
      }
      importCsvMutation.mutate({ file: importFile, sheetName: csvSheetName, mode: csvMode });
    }
  };

  const isImporting = importXlsxMutation.isPending || importCsvMutation.isPending;
  const canReplace = csvSheetName ? leafTables.includes(csvSheetName) : false;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
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

          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="claritySkipRitual" className="flex items-center gap-2 cursor-pointer">
              <input
                id="claritySkipRitual"
                type="checkbox"
                checked={claritySkipRitual}
                onChange={(e) => setClaritySkipRitual(e.target.checked)}
                className="accent-primary"
                data-testid="input-clarity-skip-ritual"
              />
              <span className="text-sm">Skip Clarity re-entry ritual</span>
            </Label>
            <p className="text-xs text-muted-foreground pl-6">
              When on, opening a Piece in Clarity always resumes silently — no breath, no "Welcome back."
            </p>
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
          <p className="text-sm text-muted-foreground">Download a complete backup of all your data as a styled Excel workbook.</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => { window.location.href = `${API_BASE}/api/export/xlsx`; }}>
              <Download className="w-4 h-4 mr-1.5" /> Export Workbook
            </Button>
            <Button variant="outline" onClick={() => { window.location.href = `${API_BASE}/api/export/template`; }}>
              <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Download Blank Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Import */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="text-base font-semibold">Import Data</h2>

          {/* Mode toggle */}
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setImportMode("workbook")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                importMode === "workbook"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 hover:bg-muted/50"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              Full Workbook
            </button>
            <button
              onClick={() => setImportMode("csv")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                importMode === "csv"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 hover:bg-muted/50"
              }`}
            >
              <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              Single Table CSV
            </button>
          </div>

          {/* Workbook mode warning */}
          {importMode === "workbook" && (
            <div className="flex items-start gap-2.5 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                This will erase all existing data and replace it with the workbook contents.
              </p>
            </div>
          )}

          {/* CSV mode options */}
          {importMode === "csv" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Table</Label>
                <Select value={csvSheetName} onValueChange={setCsvSheetName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a table..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Mode</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="csvMode"
                      value="add"
                      checked={csvMode === "add"}
                      onChange={() => setCsvMode("add")}
                      className="accent-primary"
                    />
                    <span className="text-sm">Add Records</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="csvMode"
                      value="replace"
                      checked={csvMode === "replace"}
                      onChange={() => setCsvMode("replace")}
                      className="accent-primary"
                    />
                    <span className="text-sm">Replace Table</span>
                  </label>
                </div>
              </div>

              {csvMode === "replace" && csvSheetName && !canReplace && (
                <div className="flex items-start gap-2.5 p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                  <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-800 dark:text-red-200">
                    "{csvSheetName}" has dependent tables. Use a full workbook import to replace it.
                  </p>
                </div>
              )}

              {csvMode === "replace" && canReplace && (
                <div className="flex items-start gap-2.5 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    This will delete all existing records in "{csvSheetName}" before importing.
                  </p>
                </div>
              )}

              {csvSheetName && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { window.location.href = `${API_BASE}/api/export/csv-template/${encodeURIComponent(csvSheetName)}`; }}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download {csvSheetName} Template
                </Button>
              )}
            </div>
          )}

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
          >
            {importMode === "workbook" ? (
              <FileSpreadsheet className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            ) : (
              <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            )}
            <p className="text-sm font-medium">
              {importFile ? importFile.name : "Drop your file here, or tap to browse"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Accepts {importMode === "workbook" ? ".xlsx" : ".csv"} files
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptedExt}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                // Reset so re-selecting same file works
                e.target.value = "";
              }}
            />
          </div>

          {/* Import button */}
          <Button
            disabled={!importFile || isImporting || (importMode === "csv" && (!csvSheetName || (csvMode === "replace" && !canReplace)))}
            onClick={handleImport}
          >
            <Upload className="w-4 h-4 mr-1.5" />
            {isImporting ? "Importing..." : "Import"}
          </Button>

          {/* Import results */}
          {importResult && (
            <div className="rounded-md border p-4 space-y-2 bg-muted/20">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Import Results
              </h3>
              {importResult.counts && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {Object.entries(importResult.counts).map(([key, count]) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="font-medium">{key}</span>
                      <span className="text-muted-foreground">{count as number} records</span>
                    </div>
                  ))}
                </div>
              )}
              {importResult.count !== undefined && !importResult.counts && (
                <p className="text-sm text-muted-foreground">{importResult.count} records imported</p>
              )}
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="space-y-1 mt-2">
                  <p className="text-xs font-semibold text-destructive">Warnings:</p>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {importResult.errors.map((err, i) => (
                      <p key={i} className="text-xs text-destructive">{err}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
