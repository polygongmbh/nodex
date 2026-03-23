import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { buildEmptyScopeModel, type EmptyScopeModel } from "@/lib/empty-scope";
import type { Channel, Person, Relay, Task } from "@/types";

interface UseEmptyScopeModelOptions {
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  searchQuery?: string;
  contextTaskTitle?: string;
  focusedTaskId?: string | null;
  taskById?: Map<string, Pick<Task, "content">>;
  allTasks?: Pick<Task, "id" | "content">[];
}

export function useEmptyScopeModel({
  relays,
  channels,
  people,
  searchQuery = "",
  contextTaskTitle,
  focusedTaskId = null,
  taskById,
  allTasks,
}: UseEmptyScopeModelOptions): EmptyScopeModel {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";

  const resolvedContextTaskTitle = useMemo(() => {
    if (typeof contextTaskTitle === "string") {
      return contextTaskTitle;
    }
    if (!focusedTaskId) {
      return "";
    }
    if (taskById) {
      return taskById.get(focusedTaskId)?.content ?? "";
    }
    if (allTasks) {
      return allTasks.find((task) => task.id === focusedTaskId)?.content ?? "";
    }
    return "";
  }, [allTasks, contextTaskTitle, focusedTaskId, taskById]);

  return useMemo(
    () =>
      buildEmptyScopeModel({
        relays,
        channels,
        people,
        searchQuery,
        contextTaskTitle: resolvedContextTaskTitle,
        locale,
        t,
      }),
    [channels, locale, people, relays, resolvedContextTaskTitle, searchQuery, t]
  );
}
