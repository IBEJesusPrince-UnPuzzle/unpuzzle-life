import { AGENDA_PALETTE } from "@/lib/agenda-colors";
import { Check } from "lucide-react";

type Props = {
  value: string; // hex
  onChange: (hex: string) => void;
};

export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="color-picker">
      {AGENDA_PALETTE.map((c) => {
        const selected = c.hex.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.hex)}
            title={c.label}
            data-testid={`color-${c.id}`}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              selected
                ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/40 scale-110"
                : "hover:scale-105"
            }`}
            style={{ backgroundColor: c.hex }}
            aria-label={c.label}
            aria-pressed={selected}
          >
            {selected && <Check className="w-3.5 h-3.5 text-white" />}
          </button>
        );
      })}
    </div>
  );
}
