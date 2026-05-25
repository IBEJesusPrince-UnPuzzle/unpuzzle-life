import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Save, Download, Upload } from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";
import { SidebarMenuButton } from "@/components/sidebar-menu";

export default function DataPage() {
  const { toast } = useToast();
  const { data: prefs } = usePreferences();

  // Preferences state
  const [displayName, setDisplayName] = useState("");
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");
  const [claritySkipRitual, setClaritySkipRitual] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  if (prefs && !prefsLoaded) {
    setDisplayName(prefs.displayName);
    setTimeFormat(prefs.timeFormat as "12h" | "24h");
    setClaritySkipRitual(!!prefs.claritySkipRitual);
    setPrefsLoaded(true);
  }

  // Reset state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");

  const savePrefsMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/preferences", { displayName, timeFormat, claritySkipRitual }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      toast({ title: "Preferences saved" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reset"),
    onSuccess: () => {
      toast({ title: "Database reset" });
      setResetDialogOpen(false);
      setResetConfirm("");
      queryClient.invalidateQueries();
      window.location.hash = "#/inbox";
    },
  });

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Import failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      const totalImported = data.results.reduce((sum: number, r: any) => sum + r.imported, 0);
      const totalErrors = data.results.reduce((sum: number, r: any) => sum + r.errors.length, 0);
      toast({ 
        title: "Import successful", 
        description: `Imported ${totalImported} records${totalErrors > 0 ? ` with ${totalErrors} errors` : ''}.`
      });
      setImportFile(null);
      queryClient.invalidateQueries();
    },
    onError: (err) => {
      toast({ 
        title: "Import failed", 
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive"
      });
    },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <SidebarMenuButton />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Data</h1>
          <p className="text-sm text-muted-foreground">Preferences and account data</p>
        </div>
      </div>

      {/* Preferences */}
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
              Reserved for the Clarity wizard rebuild in Phase 4.
            </p>
          </div>

          <Button onClick={() => savePrefsMutation.mutate()} disabled={savePrefsMutation.isPending}>
            <Save className="w-4 h-4 mr-1.5" />
            Save Preferences
          </Button>
        </CardContent>
      </Card>

      {/* Import / Export */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="text-base font-semibold">Import / Export</h2>
          <p className="text-sm text-muted-foreground">
            Export your data to an Excel workbook or import from a previously exported file.
          </p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={async () => {
                try {
                  toast({ title: "Exporting data...", description: "Please wait while we prepare your export." });
                  const response = await fetch("/api/export");
                  if (!response.ok) {
                    const error = await response.text();
                    throw new Error(error || "Export failed");
                  }
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `unpuzzle-life-export-${new Date().toISOString().split('T')[0]}.xlsx`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                  const filename = `unpuzzle-life-export-${new Date().toISOString().split('T')[0]}.xlsx`;
                  toast({ 
                    title: "Export successful", 
                    description: `Your data has been downloaded as ${filename}. Check your Downloads folder.`
                  });
                } catch (err) {
                  console.error("Export error:", err);
                  toast({ 
                    title: "Export failed", 
                    description: err instanceof Error ? err.message : "An error occurred",
                    variant: "destructive"
                  });
                }
              }}
            >
              <Download className="w-4 h-4 mr-1.5" /> Export Data
            </Button>
            <div className="flex gap-2 items-center">
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="hidden"
                id="import-file"
              />
              <label htmlFor="import-file">
                <Button variant="outline" asChild>
                  <span>
                    <Upload className="w-4 h-4 mr-1.5" /> Select File
                  </span>
                </Button>
              </label>
              <Button 
                variant="outline" 
                disabled={!importFile || importMutation.isPending}
                onClick={() => importFile && importMutation.mutate(importFile)}
              >
                {importMutation.isPending ? "Importing..." : "Import Data"}
              </Button>
            </div>
          </div>
          {importFile && (
            <p className="text-xs text-muted-foreground">
              Selected: {importFile.name}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Reset */}
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
              This will permanently delete <strong>ALL</strong> your data
              (projects, inbox items, weekly reviews, environment, responsibilities, roles).
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
