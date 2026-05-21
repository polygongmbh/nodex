export interface TitledPostFieldsProps {
  title: string;
  location: string;
  summary: string;
  onTitleChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  titleLabel: string;
  locationLabel: string;
  summaryLabel: string;
}

export function TitledPostFields({
  title,
  location,
  summary,
  onTitleChange,
  onLocationChange,
  onSummaryChange,
  titleLabel,
  locationLabel,
  summaryLabel,
}: TitledPostFieldsProps) {
  return (
    <>
      <input
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder={titleLabel}
        aria-label={titleLabel}
        className="h-8 min-w-[12rem] flex-1 rounded-md border border-border/50 bg-background px-2 text-xs"
      />
      <input
        value={location}
        onChange={(event) => onLocationChange(event.target.value)}
        placeholder={locationLabel}
        aria-label={locationLabel}
        className="h-8 min-w-[8rem] rounded-md border border-border/50 bg-background px-2 text-xs"
      />
      <input
        value={summary}
        onChange={(event) => onSummaryChange(event.target.value)}
        placeholder={summaryLabel}
        aria-label={summaryLabel}
        className="h-8 min-w-[12rem] flex-[2] rounded-md border border-border/50 bg-background px-2 text-xs"
      />
    </>
  );
}
