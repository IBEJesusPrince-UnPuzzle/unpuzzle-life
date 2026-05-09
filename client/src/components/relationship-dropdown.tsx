// RelationshipDropdown — Phase 5 PR #18b
//
// Universal 4-option relationship selector used on every linked support row
// across all five sections (People/Places/Things/Providers/Conditions).
//
// Path A vocabulary (spec §11):
//   schema enum key      | display label
//   ---------------------+--------------
//   primary              | Critical
//   secondary            | Important
//   optional             | Helpful
//   temporary_workaround | Workaround
//
// Schema constants stay unchanged (RELATIONSHIP_TYPES). Only the user-facing
// labels are renamed. We always send schema enum keys to the server.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RelationshipType } from "@shared/schema";

interface RelationshipDropdownProps {
  value: RelationshipType;
  onChange: (next: RelationshipType) => void;
  disabled?: boolean;
  // Used to scope test ids per linked row.
  testId?: string;
}

const OPTIONS: ReadonlyArray<{ value: RelationshipType; label: string }> = [
  { value: "primary", label: "Critical" },
  { value: "secondary", label: "Important" },
  { value: "optional", label: "Helpful" },
  { value: "temporary_workaround", label: "Workaround" },
];

export function RelationshipDropdown({
  value,
  onChange,
  disabled,
  testId,
}: RelationshipDropdownProps) {
  return (
    <Select
      value={value}
      onValueChange={v => onChange(v as RelationshipType)}
      disabled={disabled}
    >
      <SelectTrigger
        className="h-7 text-xs w-[110px] shrink-0"
        data-testid={testId ?? "select-relationship"}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map(opt => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="text-xs"
            data-testid={
              testId
                ? `${testId}-option-${opt.value}`
                : `select-relationship-option-${opt.value}`
            }
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Exported so other components can render the same labels (e.g. accordion).
export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  primary: "Critical",
  secondary: "Important",
  optional: "Helpful",
  temporary_workaround: "Workaround",
};
