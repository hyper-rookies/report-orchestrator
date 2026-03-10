"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatWeekRangeLabel } from "@/lib/weekRangeLabel";

export interface WeekRange {
  start: string;
  end: string;
  label: string;
}

interface WeekSelectorProps {
  weeks: WeekRange[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

export default function WeekSelector({ weeks, selectedIndex, onChange }: WeekSelectorProps) {
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < weeks.length - 1;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={!hasPrev}
        onClick={() => onChange(selectedIndex - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[280px] text-center text-sm font-medium">
        {weeks[selectedIndex] ? formatWeekRangeLabel(weeks[selectedIndex]) : "-"}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={!hasNext}
        onClick={() => onChange(selectedIndex + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
