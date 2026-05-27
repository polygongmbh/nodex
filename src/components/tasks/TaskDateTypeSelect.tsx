import type { ComponentPropsWithoutRef } from "react";
import type { TaskDateType } from "@/types";
import { TASK_DATE_TYPES, getTaskDateTypeLabel } from "@/lib/task-dates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TaskDateTypeSelectProps {
  id?: string;
  value: TaskDateType;
  onChange: (value: TaskDateType) => void;
  className?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: ComponentPropsWithoutRef<typeof SelectContent>["onCloseAutoFocus"];
}

export function TaskDateTypeSelect({
  id,
  value,
  onChange,
  className,
  disabled,
  onOpenChange,
  onCloseAutoFocus,
}: TaskDateTypeSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as TaskDateType)}
      disabled={disabled}
      onOpenChange={onOpenChange}
    >
      <SelectTrigger
        id={id}
        className={cn("h-8 w-auto gap-1 text-xs", className)}
      >
        <SelectValue>{getTaskDateTypeLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="pointer-events-auto" onCloseAutoFocus={onCloseAutoFocus}>
        {TASK_DATE_TYPES.map((dateType) => (
          <SelectItem key={dateType} value={dateType}>
            {getTaskDateTypeLabel(dateType)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
