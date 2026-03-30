import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, Info,
} from "lucide-react";

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
    label: "3. Areas",
    description: "Areas of focus / responsibility",
    columns: "name, description, category (UnPuzzle/Chores/Routines/Life/Getting Things Done)",
    example: `name,description,category\n"Health","Physical wellness","Life"`,
    order: 3,
  },
  {
    value: "identities",
    label: "4. Identities",
    description: "Identity statements linked to areas",
    columns: "statement, area_name (must match an existing area)",
    example: `statement,area_name\n"exercises daily","Health"`,
    order: 4,
  },
  {
    value: "habits",
    label: "5. Habits",
    description: "Habits linked to identities and areas",
    columns: "name, identity_statement, area_name, cue, because, reward, time_of_day, frequency",
    example: `name,identity_statement,area_name,cue,because,reward,time_of_day,frequency\n"Morning run","exercises daily","Health","alarm at 6am","energizes me","feeling accomplished","morning","daily"`,
    order: 5,
  },
  {
    value: "goals",
    label: "6. Goals",
    description: "1-2 year goals linked to visions",
    columns: "title, description, vision_title (must match existing), target_date (YYYY-MM-DD)",
    example: `title,description,vision_title,target_date\n"Lose 20 lbs","Get to 180 lbs","Run a marathon","2026-12-31"`,
    order: 6,
  },
  {
    value: "tasks",
    label: "7. Tasks",
    description: "Daily agenda tasks",
    columns: "date (YYYY-MM-DD), goal, area_name, start_time (HH:MM), end_time (HH:MM)",
    example: `date,goal,area_name,start_time,end_time\n"2026-03-31","Morning run","Health","06:00","06:45"`,
    order: 7,
  },
];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  // Parse header
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

export default function ImportPage() {
  const [selectedType, setSelectedType] = useState("");
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<{ created: number; errors: string[]; total: number } | null>(null);

  const importData = useMutation({
    mutationFn: (data: { type: string; rows: Record<string, string>[] }) =>
      apiRequest("POST", "/api/import", data).then(r => r.json()),
    onSuccess: (data) => {
      setResult(data);
      // Invalidate all caches
      queryClient.invalidateQueries();
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setFileContent(text);
      const rows = parseCSV(text);
      setPreview(rows);
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!selectedType || preview.length === 0) return;
    importData.mutate({ type: selectedType, rows: preview });
  };

  const selectedTemplate = IMPORT_TYPES.find(t => t.value === selectedType);

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
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          Import Data
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload CSV files to bulk-import your data into Momentum.
        </p>
      </div>

      {/* Import order guide */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-xs font-medium flex items-center gap-1 mb-2">
            <Info className="w-3 h-3" /> Recommended import order
          </p>
          <p className="text-xs text-muted-foreground">
            Import in this order so references resolve correctly: Purposes → Visions → Areas → Identities → Habits → Goals → Tasks.
            Each type can reference items from earlier types by name.
          </p>
        </CardContent>
      </Card>

      {/* Step 1: Select type */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium">1. Select what to import</h2>
        <Select value={selectedType} onValueChange={(v) => { setSelectedType(v); setPreview([]); setResult(null); setFileContent(null); setFileName(""); }}>
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
                onChange={handleFileUpload}
                className="hidden"
                data-testid="file-upload"
              />
            </label>
          </div>

          {/* Preview */}
          {preview.length > 0 && (
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
                disabled={importData.isPending}
                data-testid="button-import"
              >
                {importData.isPending ? "Importing..." : `Import ${preview.length} ${selectedTemplate.label}`}
              </Button>
            </div>
          )}

          {/* Result */}
          {result && (
            <Card className={result.errors.length > 0 ? "border-amber-500/50" : "border-emerald-500/50"}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {result.errors.length === 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  )}
                  <p className="text-sm font-medium">
                    {result.created} of {result.total} imported successfully
                  </p>
                </div>
                {result.errors.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Issues:</p>
                    {result.errors.map((err, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{err}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
