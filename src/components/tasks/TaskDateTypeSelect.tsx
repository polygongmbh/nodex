import type { ComponentPropsWithoutRef } from "react";
import type { TaskDateType } from "@/types";
import { TASK_DATE_TYPES, getTaskDateTypeLabel } from "@/lib/task-dates";

type TaskDateTypeSelectProps = Omit<
  ComponentPropsWithoutRef<"select">,
  "children" | "defaultValue" | "onChange" | "value"
> & {
  value: TaskDateType;
  onChange: (value: TaskDateType) => void;
};

export function TaskDateTypeSelect({
  value,
  onChange,
  ...selectProps
}: TaskDateTypeSelectProps) {
  return (
    <select
      value={value}
      {...selectProps}
      onChange={(event) => {
        onChange(event.target.value as TaskDateType);
      }}
    >
      {TASK_DATE_TYPES.map((dateType) => (
        <option key={dateType} value={dateType}>
          {getTaskDateTypeLabel(dateType)}
        </option>
      ))}
    </select>
  );
}
