import { useEmptyScopeModel } from "@/features/feed-page/controllers/use-empty-scope-model";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";

interface ScopeFooterHintProps {
  contextTaskTitle?: string;
}

export function ScopeFooterHint({ contextTaskTitle = "" }: ScopeFooterHintProps) {
  const surface = useFeedSurfaceState();
  const scopeModel = useEmptyScopeModel({
    relays: surface.relays,
    channels: surface.channels,
    people: surface.people,
    quickFilters: surface.quickFilters,
    searchQuery: surface.searchQuery,
    contextTaskTitle,
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
