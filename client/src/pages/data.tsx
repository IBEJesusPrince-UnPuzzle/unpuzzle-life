import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Save, Download, Upload, Bell } from "lucide-react";
import { usePreferences, useUpdatePreferences } from "@/hooks/use-preferences";
import { SidebarMenuButton } from "@/components/sidebar-menu";
import { useFcm } from "@/hooks/use-fcm";

export default function DataPage() {
  const { toast } = useToast();
  const { data: prefs } = usePreferences();
  const updatePrefs = useUpdatePreferences();
  const { permission, requestPermission, token } = useFcm();

  // Preferences state - initialize with defaults
  const [displayName, setDisplayName] = useState("");
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");
  const [claritySkipRitual, setClaritySkipRitual] = useState(false);

  // Notification preferences state - initialize with defaults
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [taskReminderMinutes, setTaskReminderMinutes] = useState(15);
  const [dailyReviewEnabled, setDailyReviewEnabled] = useState(false);
  const [dailyReviewTime, setDailyReviewTime] = useState("09:00");
  const [projectDeadlineAlertsEnabled, setProjectDeadlineAlertsEnabled] = useState(false);
  const [projectDeadlineDaysBefore, setProjectDeadlineDaysBefore] = useState(1);
  const [stalledProjectAlertsEnabled, setStalledProjectAlertsEnabled] = useState(false);
  const [stalledProjectDaysThreshold, setStalledProjectDaysThreshold] = useState(7);

  // Sync state with prefs whenever prefs changes
  useEffect(() => {
    if (prefs) {
      setDisplayName(prefs.displayName);
      setTimeFormat(prefs.timeFormat as "12h" | "24h");
      setClaritySkipRitual(!!prefs.claritySkipRitual);
      // Notification preferences
      setNotificationsEnabled(!!prefs.notificationsEnabled);
      setTaskReminderMinutes(prefs.taskReminderMinutes || 15);
      setDailyReviewEnabled(!!prefs.dailyReviewEnabled);
      setDailyReviewTime(prefs.dailyReviewTime || "09:00");
      setProjectDeadlineAlertsEnabled(!!prefs.projectDeadlineAlertsEnabled);
      setProjectDeadlineDaysBefore(prefs.projectDeadlineDaysBefore || 1);
      setStalledProjectAlertsEnabled(!!prefs.stalledProjectAlertsEnabled);
      setStalledProjectDaysThreshold(prefs.stalledProjectDaysThreshold || 7);
    }
  }, [prefs]);

  // Reset state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");

  const savePrefsMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/preferences", {
      displayName, timeFormat, claritySkipRitual,
      notificationsEnabled, taskReminderMinutes,
      dailyReviewEnabled, dailyReviewTime,
      projectDeadlineAlertsEnabled, projectDeadlineDaysBefore,
      stalledProjectAlertsEnabled, stalledProjectDaysThreshold,
    }),
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

      {/* Notifications */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Push Notifications
          </h2>

          {/* Global toggle */}
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="notificationsEnabled" className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="notificationsEnabled"
                data-testid="notifications-enabled"
                checked={notificationsEnabled}
                onCheckedChange={(v) => setNotificationsEnabled(v === true)}
                className="accent-primary"
              />
              <span className="text-sm">Enable push notifications</span>
            </Label>
            {permission === 'default' && notificationsEnabled && (
              <Button
                size="sm"
                variant="outline"
                onClick={requestPermission}
                className="ml-6"
              >
                Grant Permission
              </Button>
            )}
            {permission === 'granted' && token && (
              <p className="text-xs text-muted-foreground pl-6">
                Notifications enabled (token registered)
              </p>
            )}
            {permission === 'denied' && (
              <p className="text-xs text-destructive pl-6">
                Notifications blocked by browser settings
              </p>
            )}
          </div>

          {/* Task reminders */}
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="taskReminderMinutes" className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="taskReminderEnabled"
                checked={notificationsEnabled}
                disabled={!notificationsEnabled}
                onCheckedChange={(v) => setNotificationsEnabled(v === true)}
                className="accent-primary"
              />
              <span className="text-sm">Task reminders</span>
            </Label>
            <div className="flex items-center gap-2 ml-6">
              <span className="text-xs text-muted-foreground">Remind me</span>
              <Input
                type="number"
                min={1}
                max={60}
                data-testid="task-reminder-minutes"
                value={taskReminderMinutes}
                onChange={(e) => setTaskReminderMinutes(Number(e.target.value))}
                disabled={!notificationsEnabled}
                className="w-16 h-8 text-sm"
              />
              <span className="text-xs text-muted-foreground">minutes before</span>
            </div>
          </div>

          {/* Daily review */}
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="dailyReviewEnabled" className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="dailyReviewEnabled"
                data-testid="daily-review-enabled"
                checked={dailyReviewEnabled}
                disabled={!notificationsEnabled}
                onCheckedChange={(v) => setDailyReviewEnabled(v === true)}
                className="accent-primary"
              />
              <span className="text-sm">Daily review reminder</span>
            </Label>
            <div className="flex items-center gap-2 ml-6">
              <span className="text-xs text-muted-foreground">At</span>
              <Input
                type="time"
                data-testid="daily-review-time"
                value={dailyReviewTime}
                onChange={(e) => setDailyReviewTime(e.target.value)}
                disabled={!notificationsEnabled || !dailyReviewEnabled}
                className="w-24 h-8 text-sm"
              />
            </div>
          </div>

          {/* Project deadline alerts */}
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="projectDeadlineAlertsEnabled" className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="projectDeadlineAlertsEnabled"
                data-testid="project-deadline-alerts-enabled"
                checked={projectDeadlineAlertsEnabled}
                disabled={!notificationsEnabled}
                onCheckedChange={(v) => setProjectDeadlineAlertsEnabled(v === true)}
                className="accent-primary"
              />
              <span className="text-sm">Project deadline alerts</span>
            </Label>
            <div className="flex items-center gap-2 ml-6">
              <span className="text-xs text-muted-foreground">Alert</span>
              <Input
                type="number"
                min={1}
                max={30}
                data-testid="project-deadline-days-before"
                value={projectDeadlineDaysBefore}
                onChange={(e) => setProjectDeadlineDaysBefore(Number(e.target.value))}
                disabled={!notificationsEnabled || !projectDeadlineAlertsEnabled}
                className="w-16 h-8 text-sm"
              />
              <span className="text-xs text-muted-foreground">day(s) before deadline</span>
            </div>
          </div>

          {/* Stalled project alerts */}
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="stalledProjectAlertsEnabled" className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="stalledProjectAlertsEnabled"
                data-testid="stalled-project-alerts-enabled"
                checked={stalledProjectAlertsEnabled}
                disabled={!notificationsEnabled}
                onCheckedChange={(v) => setStalledProjectAlertsEnabled(v === true)}
                className="accent-primary"
              />
              <span className="text-sm">Stalled project alerts</span>
            </Label>
            <div className="flex items-center gap-2 ml-6">
              <span className="text-xs text-muted-foreground">Alert after</span>
              <Input
                type="number"
                min={1}
                max={90}
                data-testid="stalled-project-days-threshold"
                value={stalledProjectDaysThreshold}
                onChange={(e) => setStalledProjectDaysThreshold(Number(e.target.value))}
                disabled={!notificationsEnabled || !stalledProjectAlertsEnabled}
                className="w-16 h-8 text-sm"
              />
              <span className="text-xs text-muted-foreground">day(s) stalled</span>
            </div>
          </div>
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
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="hidden"
              id="import-file"
            />
            <label htmlFor="import-file">
              <Button 
                variant="outline" 
                asChild
                disabled={importMutation.isPending}
              >
                <span>
                  <Upload className="w-4 h-4 mr-1.5" /> Import Data
                </span>
              </Button>
            </label>
          </div>
          {importFile && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Selected: {importFile.name}
              </p>
              <Button 
                variant="outline" 
                size="sm"
                disabled={importMutation.isPending}
                onClick={() => importFile && importMutation.mutate(importFile)}
              >
                {importMutation.isPending ? "Importing..." : "Upload"}
              </Button>
            </div>
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
