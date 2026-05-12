import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, useDayPicker, type MonthCaptionProps } from "react-day-picker";
import { format, type Locale } from "date-fns";
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

function CompactMonthCaption({ calendarMonth }: MonthCaptionProps) {
  const { goToMonth, nextMonth, previousMonth, dayPickerProps } = useDayPicker();
  const locale = dayPickerProps.locale ?? enUS;
  const hideNav = (dayPickerProps as { hideNavigation?: boolean }).hideNavigation;
  return (
    <div className="flex items-center justify-center gap-1 h-7">
      {!hideNav && (
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
      )}
      <span className="text-sm font-medium min-w-[8rem] text-center">
        {format(calendarMonth.date, "LLLL yyyy", { locale: locale as Locale })}
      </span>
      {!hideNav && (
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
      )}
    </div>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
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
        month_caption: "flex justify-center pt-1 items-center",
        caption_label: "hidden",
        nav: "hidden",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-8 font-normal text-[0.7rem]",
        week: "flex w-full mt-1",
        day: "h-8 w-8 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100",
        ),
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:focus]:bg-primary",
        today: "[&>button]:bg-accent [&>button]:text-accent-foreground",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        MonthCaption: CompactMonthCaption,
        Chevron: ({ orientation }) =>
          orientation === "left" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
