import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CalendarDays } from "lucide-react";
import { toIsoDate } from "@/lib/agenda-utils";
import type { AgendaWindowItem } from "@/components/agenda-task-modal";

export type RecurrenceScope = "this" | "following" | "all";

export function RescheduleSheet({ item, onClose, onConfirm }: {
  item: AgendaWindowItem | null;
  onClose: () => void;
  onConfirm: (newDate: string, newTime: string) => void;
}) {
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  useEffect(() => {
    if (item) { setNewDate(item.startDate ?? ""); setNewTime(item.time ?? ""); }
  }, [item]);
  return (
    <Sheet open={item !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="p-0 max-h-[90vh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="text-base">Reschedule: {item?.title ?? ""}</SheetTitle>
        </SheetHeader>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label>New date</Label>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <CalendarDays className="w-4 h-4 mr-2 shrink-0" />
                  {newDate || "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single"
                  selected={newDate ? new Date(newDate + "T12:00:00") : undefined}
                  onSelect={(d) => { if (d) { setNewDate(toIsoDate(d)); setCalOpen(false); } }}
                  initialFocus />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label>New time</Label>
            <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
          </div>
          <Button className="w-full" disabled={!newDate}
            onClick={() => { onConfirm(newDate, newTime); onClose(); }}>
            Confirm reschedule
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
