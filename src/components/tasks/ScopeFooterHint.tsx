import { useEmptyScopeModel } from "@/features/feed-page/controllers/use-empty-scope-model";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { usePosts } from "@/features/feed-page/stores/posts-store";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";

export function ScopeFooterHint({
  focusedTaskId,
}: {
  focusedTaskId: string | null;
}) {
  const surface = useFeedSurfaceState();
  const posts = usePosts();
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const contextTaskTitle = focusedTaskId
    ? posts.find((post) => post.id === focusedTaskId)?.content ?? ""
    : "";
  const scopeModel = useEmptyScopeModel({
    relays: surface.relays,
    channels: surface.channels,
    people: surface.people,
    quickFilters: surface.quickFilters,
    searchQuery,
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
