import { useEmptyScopeModel } from "@/features/feed-page/controllers/use-empty-scope-model";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";

export function ScopeFooterHint() {
  const surface = useFeedSurfaceState();
  const { focusedTaskId, allTasks } = useFeedTaskViewModel();
  const contextTaskTitle = focusedTaskId
    ? allTasks.find((task) => task.id === focusedTaskId)?.content ?? ""
    : "";
  const scopeModel = useEmptyScopeModel({
    relays: surface.relays,
    channels: surface.channels,
    people: surface.people,
    quickFilters: surface.quickFilters,
    searchQuery: surface.searchQuery,
    contextTaskTitle,
    focusedTaskId,
  });

  if (!scopeModel.hasSelectedScope || !scopeModel.scopeFooterSentence) {
    return null;
  }

  return (
    <div className="flex justify-center px-4 py-6 text-center">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        {scopeModel.scopeFooterSentence}
      </p>
    </div>
  );
}
