import { useState } from "react";
import html2canvas from "html2canvas";
import { MessageSquareWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ReportType = "Bug" | "Question" | "Suggestion";

export function ReportIssueButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ReportType>("Bug");
  const [submitting, setSubmitting] = useState(false);

  function resetState() {
    setScreenshot(null);
    setDescription("");
    setType("Bug");
    setSubmitting(false);
    setCapturing(false);
  }

  async function handleClick() {
    setCapturing(true);
    try {
      // Capture the main scrollable content area (excludes sidebar/floating elements)
      const target = document.querySelector("main") || document.body;
      const canvas = await html2canvas(target as HTMLElement, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        scale: 1, // 1:1 to avoid oversized images
        backgroundColor: null, // preserve transparent backgrounds
        foreignObjectRendering: true, // better SVG support
        removeContainer: true,
        ignoreElements: (el) => {
          // Skip the report button itself and any fixed overlays
          return el.getAttribute?.("data-testid") === "button-report-issue";
        },
      });
      const dataUrl = canvas.toDataURL("image/png", 0.85);
      setScreenshot(dataUrl);
    } catch (err) {
      setScreenshot(null);
    } finally {
      setCapturing(false);
      setOpen(true);
    }
  }

  async function handleSubmit() {
    if (!description.trim()) {
      toast({ variant: "destructive", title: "Please describe the issue" });
      return;
    }
    setSubmitting(true);
    try {
      const fullDescription = `[${type}] ${description.trim()}`;
      await apiRequest("POST", "/api/support-requests", {
        description: fullDescription,
        screenshotBase64: screenshot || undefined,
        pageUrl: window.location.hash || window.location.pathname,
        userAgent: navigator.userAgent,
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
      });
      toast({ title: "Report submitted — we'll look into it" });
      setOpen(false);
      resetState();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to submit report",
        description: err?.message || "Please try again",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={capturing}
        aria-label="Report an issue"
        className="fixed z-40 bottom-20 right-4 md:bottom-6 md:right-6 h-10 w-10 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground shadow-md border border-border flex items-center justify-center transition-colors disabled:opacity-50"
        data-testid="button-report-issue"
      >
        <MessageSquareWarning className="h-4 w-4" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetState();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report an issue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {screenshot ? (
              <div className="relative">
                <img
                  src={screenshot}
                  alt="Screenshot preview"
                  className="max-h-40 w-full object-contain rounded border bg-muted"
                />
                <button
                  type="button"
                  onClick={() => setScreenshot(null)}
                  aria-label="Remove screenshot"
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/90 border flex items-center justify-center hover:bg-background"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No screenshot attached.</p>
            )}

            <div className="space-y-2">
              <Label htmlFor="report-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
                <SelectTrigger id="report-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bug">Bug</SelectItem>
                  <SelectItem value="Question">Question</SelectItem>
                  <SelectItem value="Suggestion">Suggestion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-description">What happened?</Label>
              <Textarea
                id="report-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue you encountered..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !description.trim()}>
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
