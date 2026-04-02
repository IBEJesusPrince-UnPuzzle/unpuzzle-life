import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, Info, ArrowLeft, ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import type { Purpose, Vision, Area, Identity, PlannerTask } from "@shared/schema";

// Map import type → where the data lives in Clarity (with tab param)
const VIEW_LINKS: Record<string, { label: string; path: string }> = {
  purposes: { label: "Purpose & Principles", path: "/horizons?tab=purpose" },
  visions: { label: "Visions", path: "/horizons?tab=purpose" },
  areas: { label: "Responsibilities & Areas", path: "/horizons?tab=areas" },
  identities: { label: "Identities", path: "/horizons?tab=identity" },
  tasks: { label: "Weekly Planner", path: "/planner" },
};

const IMPORT_TYPES = [
  {
    value: "purposes",
    label: "1. Purposes",
    description: "Life purpose statements and core principles",
    columns: "statement, principles (pipe-separated)",
    example: `statement,principles\n"To live with intention","Lead by example|Stay curious"`,
    order: 1,
  },
  {
    value: "visions",
    label: "2. Visions",
    description: "3-5 year vision statements",
    columns: "title, description, timeframe",
    example: `title,description,timeframe\n"Financial freedom","Passive income exceeds expenses",2029`,
    order: 2,
  },
  {
    value: "areas",
    label: "3. Responsibilities",
    description: "Responsibilities & areas of focus",
    columns: "responsibility (UnPuzzle/Chores/Routines/Roles/Getting Things Done), name (the area within the responsibility), description",
    example: `responsibility,name,description\n"UnPuzzle","Health","Physical wellness and fitness"\n"UnPuzzle","Finances","Budgeting and investments"\n"Roles","Father","Being present for my kids"\n"Chores","Yard Work","Lawn and landscaping upkeep"`,
    order: 3,
  },
  {
    value: "identities",
    label: "4. Identities",
    description: "Identity statements linked to areas (generates projects & routines)",
    columns: "statement, area_name (must match existing area), cue, time_of_day (early_morning | morning | late_morning | afternoon | late_afternoon | evening | waking_hours), recurrence (daily | weekly | monthly | quarterly | yearly), craving, reward — all fields required",
    example: `statement,area_name,cue,time_of_day,recurrence,craving,reward\n"exercises every morning","Health","my alarm goes off at 6am","morning","daily","I want energy and strength","feeling alive and powerful after a great workout"\n"reads the Bible and prays","Faith","I sit down with my coffee","early_morning","daily","I crave spiritual clarity","peace and direction for my day"\n"reviews budget weekly","Finances","every Sunday evening","evening","weekly","I want financial control","confidence knowing my money is managed"`,
    order: 4,
  },
  {
    value: "tasks",
    label: "5. Tasks",
    description: "Standalone agenda tasks (from brain dumps, inbox, etc.)",
    columns: "date (YYYY-MM-DD), task, area_name, start_time (HH:MM), end_time (HH:MM)",
    example: `date,task,area_name,start_time,end_time\n"2026-04-01","Morning run","Health","06:00","06:45"`,
    order: 5,
  },
];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h.trim()] = (values[j] || "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

type ImportResult = { created: number; errors: string[]; total: number };

export default function ImportPage() {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState("");
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importPhase, setImportPhase] = useState<"idle" | "importing" | "done" | "error">("idle");

  // Fetch existing data for live counts after import
  const { data: purposes = [] } = useQuery<Purpose[]>({ queryKey: ["/api/purposes"] });
  const { data: visions = [] } = useQuery<Vision[]>({ queryKey: ["/api/visions"] });
  const { data: areas = [] } = useQuery<Area[]>({ queryKey: ["/api/areas"] });
  const { data: identities = [] } = useQuery<Identity[]>({ queryKey: ["/api/identities"] });
  const { data: tasks = [] } = useQuery<PlannerTask[]>({ queryKey: ["/api/planner-tasks"] });

  const resetForm = () => {
    setFileContent(null);
    setFileName("");
    setPreview([]);
  };

  const resetAll = () => {
    resetForm();
    setResult(null);
    setImportPhase("idle");
  };

  const handleImport = async () => {
    if (!selectedType || preview.length === 0) return;
    setImportPhase("importing");
    setResult(null);

    try {
      const res = await apiRequest("POST", "/api/import", { type: selectedType, rows: preview });
      const data: ImportResult = await res.json();

      setResult(data);
      // Invalidate all queries so counts and pages update
      await queryClient.invalidateQueries();

      const typeName = IMPORT_TYPES.find(t => t.value === selectedType)?.label || selectedType;

      if (data.errors.length === 0) {
        setImportPhase("done");
        toast({
          title: "Import successful",
          description: `${data.created} ${typeName.toLowerCase()} record${data.created !== 1 ? "s" : ""} imported.`,
        });
        resetForm();
      } else {
        setImportPhase("done");
        toast({
          title: "Import completed with issues",
          description: `${data.created} of ${data.total} imported. ${data.errors.length} issue${data.errors.length !== 1 ? "s" : ""} found.`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      setImportPhase("error");
      setResult({ created: 0, errors: [err.message || "Request failed"], total: preview.length });
      toast({
        title: "Import failed",
        description: err.message || "Something went wrong. Check your CSV format and try again.",
        variant: "destructive",
      });
    }
  };

  const selectedTemplate = IMPORT_TYPES.find(t => t.value === selectedType);
  const viewLink = selectedType ? VIEW_LINKS[selectedType] : null;

  // Live record count for the selected type
  const liveCount = selectedType === "purposes" ? purposes.length
    : selectedType === "visions" ? visions.length
    : selectedType === "areas" ? areas.length
    : selectedType === "identities" ? identities.length
    : selectedType === "tasks" ? tasks.length
    : null;

  const downloadTemplate = () => {
    if (!selectedTemplate) return;
    const blob = new Blob([selectedTemplate.example], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `momentum-${selectedTemplate.value}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="flex justify-center mb-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors py-2 px-4 rounded-full border border-primary/20 bg-primary/5">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          Import Data
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload CSV files to bulk-import your data into UnPuzzle Life.
        </p>
      </div>

      {/* Import order guide */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-xs font-medium flex items-center gap-1 mb-2">
            <Info className="w-3 h-3" /> Recommended import order
          </p>
          <p className="text-xs text-muted-foreground">
            Import in this order so references resolve correctly: Purposes → Visions → Responsibilities → Identities → Tasks.
            Each type can reference items from earlier types by name. Projects & routines are auto-generated from identities.
          </p>
        </CardContent>
      </Card>

      {/* Current data counts */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Purposes", count: purposes.length },
          { label: "Visions", count: visions.length },
          { label: "Areas", count: areas.length },
          { label: "Identities", count: identities.length },
          { label: "Tasks", count: tasks.length },
        ].map(item => (
          <Card key={item.label} className="bg-muted/20">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-semibold">{item.count}</p>
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Step 1: Select type */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium">1. Select what to import</h2>
        <Select value={selectedType} onValueChange={(v) => { setSelectedType(v); resetAll(); }}>
          <SelectTrigger className="w-full" data-testid="select-import-type">
            <SelectValue placeholder="Choose data type..." />
          </SelectTrigger>
          <SelectContent>
            {IMPORT_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>
                <span className="font-medium">{t.label}</span>
                <span className="text-xs text-muted-foreground ml-2">{t.description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTemplate && (
        <>
          {/* Template info */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{selectedTemplate.label}</p>
                  <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
                  {liveCount !== null && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Currently {liveCount} record{liveCount !== 1 ? "s" : ""} in database
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={downloadTemplate}>
                  <Download className="w-3 h-3" /> Template
                </Button>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Required columns:</p>
                <p className="text-xs text-foreground">{selectedTemplate.columns}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Example CSV:</p>
                <pre className="text-[10px] bg-muted p-2 rounded-md overflow-x-auto whitespace-pre font-mono">
                  {selectedTemplate.example}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Upload */}
          {importPhase !== "done" && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium">2. Upload your CSV</h2>
              <label className="flex items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {fileName || "Click to select a CSV file"}
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setFileName(file.name);
                    setResult(null);
                    setImportPhase("idle");
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const text = ev.target?.result as string;
                      setFileContent(text);
                      setPreview(parseCSV(text));
                    };
                    reader.readAsText(file);
                  }}
                  className="hidden"
                  data-testid="file-upload"
                />
              </label>
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && importPhase !== "done" && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium">
                3. Preview
                <Badge variant="secondary" className="ml-2 text-xs">{preview.length} row{preview.length > 1 ? "s" : ""}</Badge>
              </h2>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted">
                      {Object.keys(preview[0]).map(k => (
                        <th key={k} className="px-3 py-2 text-left font-medium">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 max-w-[200px] truncate">{v}</td>
                        ))}
                      </tr>
                    ))}
                    {preview.length > 10 && (
                      <tr className="border-t">
                        <td colSpan={Object.keys(preview[0]).length} className="px-3 py-2 text-center text-muted-foreground">
                          ...and {preview.length - 10} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Button
                className="w-full"
                onClick={handleImport}
                disabled={importPhase === "importing"}
                data-testid="button-import"
              >
                {importPhase === "importing" ? "Importing..." : `Import ${preview.length} ${selectedTemplate.label}`}
              </Button>
            </div>
          )}

          {/* Result */}
          {result && importPhase !== "idle" && (
            <Card className={result.errors.length > 0 && result.created === 0
              ? "border-red-500/50 bg-red-500/5"
              : result.errors.length > 0
              ? "border-amber-500/50 bg-amber-500/5"
              : "border-emerald-500/50 bg-emerald-500/5"
            }>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  {result.created > 0 && result.errors.length === 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  )}
                  <p className="text-sm font-medium">
                    {result.errors.length === 0
                      ? `All ${result.created} record${result.created !== 1 ? "s" : ""} imported successfully`
                      : result.created > 0
                      ? `${result.created} of ${result.total} imported successfully`
                      : `Import failed — ${result.errors.length} error${result.errors.length !== 1 ? "s" : ""}`
                    }
                  </p>
                </div>

                {result.created > 0 && result.errors.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Your data is now live. Verify your records below or import another file.
                  </p>
                )}

                {result.errors.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Issues:</p>
                    {result.errors.map((err, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{err}</p>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  {viewLink && result.created > 0 && (
                    <Link href={viewLink.path}>
                      <Button variant="default" size="sm" className="text-xs gap-1">
                        <ExternalLink className="w-3 h-3" /> View in {viewLink.label}
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={resetAll}
                  >
                    Import another file
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Live records summary after successful import */}
          {result && result.created > 0 && result.errors.length === 0 && selectedType === "purposes" && purposes.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Active Purposes ({purposes.length})</p>
                {purposes.map(p => (
                  <div key={p.id} className="border rounded-md p-3 space-y-1">
                    <p className="text-sm font-medium">{p.statement}</p>
                    {p.principles && (
                      <div className="flex flex-wrap gap-1">
                        {(JSON.parse(p.principles) as string[]).map((pr, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{pr}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result && result.created > 0 && result.errors.length === 0 && selectedType === "visions" && visions.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Active Visions ({visions.length})</p>
                {visions.map(v => (
                  <div key={v.id} className="border rounded-md p-3 space-y-1">
                    <p className="text-sm font-medium">{v.title}</p>
                    {v.description && <p className="text-xs text-muted-foreground">{v.description}</p>}
                    {v.timeframe && <Badge variant="secondary" className="text-[10px]">{v.timeframe}</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result && result.created > 0 && result.errors.length === 0 && selectedType === "areas" && areas.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Active Areas ({areas.length})</p>
                {areas.map(a => (
                  <div key={a.id} className="border rounded-md p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{a.name}</p>
                      {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                    </div>
                    {a.category && <Badge variant="secondary" className="text-[10px]">{a.category}</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result && result.created > 0 && result.errors.length === 0 && selectedType === "identities" && identities.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Active Identities ({identities.length})</p>
                {identities.map(id => {
                  const area = areas.find(a => a.id === id.areaId);
                  return (
                    <div key={id.id} className="border rounded-md p-3 flex items-center justify-between">
                      <p className="text-sm font-medium">{id.statement}</p>
                      {area && <Badge variant="secondary" className="text-[10px]">{area.name}</Badge>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
