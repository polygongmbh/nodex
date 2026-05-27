import type { TitledPostFields as TitledPostFieldsType } from "@/types";

export interface TitledPostFieldsProps {
  value: TitledPostFieldsType;
  onChange: (patch: Partial<TitledPostFieldsType>) => void;
  titleLabel: string;
  locationLabel: string;
  summaryLabel: string;
  onTitleTouched?: () => void;
}

export function TitledPostFields({
  value,
  onChange,
  titleLabel,
  locationLabel,
  summaryLabel,
  onTitleTouched,
}: TitledPostFieldsProps) {
  return (
    <>
      <input
        value={value.title || ""}
        onChange={(event) => {
          onTitleTouched?.();
          onChange({ title: event.target.value });
        }}
        placeholder={titleLabel}
        className="h-8 min-w-[12rem] flex-1 rounded-md border border-border/50 bg-background px-2 text-xs"
      />
      <input
        value={value.location || ""}
        onChange={(event) => onChange({ location: event.target.value })}
        placeholder={locationLabel}
        className="h-8 min-w-[8rem] rounded-md border border-border/50 bg-background px-2 text-xs"
      />
      <input
        value={value.summary || ""}
        onChange={(event) => onChange({ summary: event.target.value })}
        placeholder={summaryLabel}
        className="h-8 min-w-[12rem] flex-[2] rounded-md border border-border/50 bg-background px-2 text-xs"
      />
    </>
  );
}
