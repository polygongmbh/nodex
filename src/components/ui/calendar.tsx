import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, useDayPicker, useNavigation } from "react-day-picker";
import { format } from "date-fns";
import { de, es, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

const LOCALE_MAP: Record<string, Locale> = { de, es, en: enUS };

function resolveLocale(lang: string | undefined): Locale {
  if (!lang) return enUS;
  const base = lang.toLowerCase().split("-")[0];
  return LOCALE_MAP[base] ?? enUS;
}

function CompactMonthCaption() {
  const { goToMonth, nextMonth, previousMonth } = useNavigation();
  const { currentMonth, locale } = useDayPicker();
  return (
    <div className="flex items-center justify-center gap-1 pt-1 h-7">
      <button
        type="button"
        aria-label="Previous month"
        disabled={!previousMonth}
        onClick={() => previousMonth && goToMonth(previousMonth)}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "h-6 w-6 p-0 opacity-60 hover:opacity-100 disabled:opacity-30",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium min-w-[8rem] text-center">
        {format(currentMonth, "LLLL yyyy", { locale })}
      </span>
      <button
        type="button"
        aria-label="Next month"
        disabled={!nextMonth}
        onClick={() => nextMonth && goToMonth(nextMonth)}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "h-6 w-6 p-0 opacity-60 hover:opacity-100 disabled:opacity-30",
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = false,
  locale,
  ...props
}: CalendarProps) {
  const { i18n } = useTranslation();
  const resolvedLocale = locale ?? resolveLocale(i18n.resolvedLanguage || i18n.language);
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={resolvedLocale}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-2",
        caption: "flex justify-center relative items-center",
        caption_label: "hidden",
        nav: "hidden",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[0.7rem]",
        row: "flex w-full mt-1",
        cell: "h-8 w-8 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100",
        ),
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside: "text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-50",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Caption: CompactMonthCaption,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
