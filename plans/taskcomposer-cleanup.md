# TaskComposer Cleanup Plan

## Goal

Make `TaskComposer` a pure controlled form component. All publish logic, relay validation, auth checks, filter sync, and post-submit side-effects move out of it — but NOT into a bloated `TaskCreateComposer`. Instead, each concern becomes a focused hook. `TaskCreateComposer` becomes a thin compositor that calls those hooks and wires their outputs to `TaskComposer`.

---

## Current Problems

### 1. Async `onSubmit` couples UI to the publish pipeline

`TaskComposer.onSubmit` returns `Promise<TaskCreateResult>`. TaskComposer then:
- Shows a `toast.loading("publishing…")` while awaiting
- Sets `isPublishing = true`
- Only clears its own state if `result.ok === true`

A form component should not wait on a publish result.

### 2. `useFeedInteractionDispatch` — filter mutations inside the form

When the user removes a tag pill that was injected by an active channel filter, `removeExplicitTag` dispatches `filter.clearChannel`. Same for mention → `filter.clearPerson`. A form should not mutate app-level filter state.

### 3. `useAuthActionPolicy` — auth gating inside the form

`canCreateContent` is used to render a sign-in button variant and gate submit-block UI. Auth gating belongs in the caller.

### 4. `useNDK` — upload auth inside the form

Only `createHttpAuthHeader` is used (for NIP-96 uploads). Should be a callback prop.

### 5. Auto-managed filter tag sync — environment watching inside the form

Two `useEffect` hooks watch `includedChannels` and `selectedPeoplePubkeys` from context and mirror them into form state. This is filter orchestration, not form logic.

### 6. `submitBlockByType` is partially hardcoded in `TaskCreateComposer`

TaskCreateComposer passes `hasMeaningfulContent: true`, `hasAtLeastOneTag: true`, etc. as hardcoded placeholders because it cannot see the form content. TaskComposer re-derives those checks internally. Block resolution is split.

### 7. `isWritableRelay` defined in three places

Duplicated in `TaskCreateComposer`, `SharedViewComposer`, and implicitly in `task-composer-runtime.ts`.

---

## New TaskComposer Contract

### Props (simplified)

```typescript
interface TaskComposerProps {
  // Relay/auth blocks from caller — content blocks computed internally
  externalSubmitBlockByType?: Partial<Record<PostType, ComposeSubmitBlockState | null>>;

  // Autocomplete data
  channels: { name: string; isIncluded: boolean }[];
  people: Person[];

  // Filter-injected tags/mentions — source of truth owned by caller
  filterTagNames?: string[];
  filterMentionPubkeys?: string[];
  onRemoveFilterTag?: (name: string) => void;
  onRemoveFilterMention?: (pubkey: string) => void;

  // Upload auth — injected so TaskComposer doesn't need useNDK
  getUploadAuthHeader?: (url: string, method: string) => Promise<string | null>;
  uploadEnabled?: boolean;

  // Draft — TaskComposer owns read/write/clear
  draftStorageKey?: string;

  // Behavior options (unchanged)
  options?: TaskComposerOptions;

  // Callbacks
  onSubmit: (data: TaskComposerFormData) => void;  // synchronous, no return value
  onCancel: () => void;
}
```

### `onSubmit` data shape

```typescript
interface TaskComposerFormData {
  content: string;
  tags: string[];
  taskType: PostType;
  dueDate?: Date;
  dueTime?: string;
  dateType?: TaskDateType;
  explicitMentionPubkeys: string[];
  mentionIdentifiers: string[];
  priority?: number;
  attachments: PublishedAttachment[];
  nip99?: Nip99Metadata;
  locationGeohash?: string;
}
```

`onSubmit` is **synchronous and void**. TaskComposer clears its state immediately after calling it. The caller owns all publish feedback.

### What TaskComposer still owns internally

- All form field state (content, tags, dates, nip99, priority, location)
- Attachment upload queue and retry state (using injected `getUploadAuthHeader`)
- Draft read/write/clear (via `draftStorageKey`)
- Autocomplete popup state and keyboard navigation
- Expand/collapse UI behavior
- Content-based submit blocking (empty content, no tags, pending/failed uploads)
- `isSendLaunching` animation
- Filter tag tracking: which tags came from `filterTagNames` vs user-typed (internal ref, same logic as today but driven by prop changes not context)

### What TaskComposer no longer owns

- `useNDK`
- `useAuthActionPolicy`
- `useFeedInteractionDispatch`
- The two `useEffect` hooks watching `includedChannels` / `selectedPeoplePubkeys`
- `autoManagedFilterTagNamesRef` / `autoManagedFilterMentionPubkeysRef` (replaced by prop-driven sync)
- Publishing toast and `isPublishing` (awaiting async result)

---

## The Three New Hooks (beside TaskCreateComposer)

The logic that leaves TaskComposer is split into three focused hooks. TaskCreateComposer calls all three and wires their outputs to TaskComposer. This keeps each piece isolated and testable independently.

### `useComposerRelayBlock(parentId, relays)`

**File:** `use-composer-relay-block.ts` (alongside TaskCreateComposer)

**Responsibility:** All relay- and auth-based submit validation, plus visibility determination.

**Returns:**
```typescript
{
  shouldHideComposer: boolean;           // parent task is on all read-only relays
  activeWritableRelayIds: string[];      // used when dispatching task.create
  externalSubmitBlockByType: Partial<Record<PostType, ComposeSubmitBlockState | null>>;
}
```

**Internally uses:** `useFeedSurfaceState()`, `useAuthActionPolicy()`, `isWritableRelay` (shared util)

**Block logic:**
- `task` type: blocked if not signed in, OR (no parentId AND writable relay count ≠ 1)
- `comment`/`offer`/`request`: blocked if not signed in, OR writable relay count === 0
- Content checks (`hasMeaningfulContent`, etc.) are **not** passed — they remain `true` as before since TaskComposer handles them internally

---

### `useComposerFilterSync(environment)`

**File:** `use-composer-filter-sync.ts` (alongside TaskCreateComposer)

**Responsibility:** Derives filter-injected tags/mentions from environment and provides removal callbacks that propagate back to the filter system.

**Returns:**
```typescript
{
  filterTagNames: string[];
  filterMentionPubkeys: string[];
  onRemoveFilterTag: (name: string) => void;
  onRemoveFilterMention: (pubkey: string) => void;
}
```

**Internally uses:** `useFeedInteractionDispatch()`, `environment.includedChannels`, `environment.selectedPeoplePubkeys`, `environment.channels` (to resolve channelId from name)

**Behavior:** `onRemoveFilterTag` dispatches `filter.clearChannel`; `onRemoveFilterMention` dispatches `filter.clearPerson`. No state — just derives and provides callbacks.

---

### `useComposerSubmitHandler({ parentId, initialStatus, activeRelayIds, closeOnSuccess, onCancel })`

**File:** `use-composer-submit-handler.ts` (alongside TaskCreateComposer)

**Responsibility:** Wraps `TaskComposerFormData` → FeedInteractionBus dispatch, including loading toasts and error handling.

**Returns:**
```typescript
handleSubmit: (data: TaskComposerFormData) => void  // sync interface; async internally
```

**Behavior:**
1. Shows `toast.loading("publishing…")`
2. Dispatches `{ type: "task.create", ...data, relays: activeRelayIds, parentId, initialStatus }`
3. On success: dismisses toast; calls `onCancel()` if `closeOnSuccess`
4. On failure: dismisses toast; shows error toast; does not call back into TaskComposer (already reset)

**Internally uses:** `useFeedInteractionDispatch()`, `useTranslation()`

---

## TaskCreateComposer After Cleanup

Thin compositor — calls the three hooks, wires outputs:

```typescript
export function TaskCreateComposer(props) {
  const environment = useResolvedTaskComposerEnvironment({});
  const { shouldHideComposer, activeWritableRelayIds, externalSubmitBlockByType } =
    useComposerRelayBlock(props.parentId, relays);
  const filterSync = useComposerFilterSync(environment);
  const handleSubmit = useComposerSubmitHandler({
    parentId: props.parentId,
    initialStatus: props.initialStatus,
    activeRelayIds: activeWritableRelayIds,
    closeOnSuccess: props.closeOnSuccess,
    onCancel: props.onCancel,
  });
  const { createHttpAuthHeader } = useNDK();

  if (shouldHideComposer) return null;

  return (
    <TaskComposerRuntimeProvider value={{ environment, draftStorageKey: props.draftStorageKey }}>
      <TaskComposer
        externalSubmitBlockByType={externalSubmitBlockByType}
        {...filterSync}
        getUploadAuthHeader={createHttpAuthHeader}
        onSubmit={handleSubmit}
        onCancel={props.onCancel}
        options={{ ... }}
      />
    </TaskComposerRuntimeProvider>
  );
}
```

`useFeedSurfaceState`, `useAuthActionPolicy`, and `useFeedInteractionDispatch` all move into the hooks — not a single one remains in TaskCreateComposer itself.

---

## SharedViewComposer: Minor Cleanup

- Import `isWritableRelay` from `task-composer-runtime.ts` (Phase 1 extraction) instead of redefining it.
- No behavioral change.

---

## Phase Plan

### Phase 1 — Extract `isWritableRelay` util
Extract to `task-composer-runtime.ts`, update `TaskCreateComposer` and `SharedViewComposer` to import it. No behavior change. ~5 lines changed.

### Phase 2 — Add `getUploadAuthHeader` prop; remove `useNDK` from TaskComposer
- Add `getUploadAuthHeader` prop to `TaskComposer`
- Replace the `useNDK()` call in TaskComposer with the prop
- Update TaskCreateComposer to pass `createHttpAuthHeader` from `useNDK()`
- Update TaskComposer tests (pass a mock function)

### Phase 3 — Make `onSubmit` synchronous; extract `useComposerSubmitHandler`
- Write `use-composer-submit-handler.ts` with the hook
- Change `TaskComposerSubmit` type to `(data: TaskComposerFormData) => void`
- Remove `isPublishing` state and async-await from `handleSubmit` in TaskComposer
- Remove publishing toast from TaskComposer
- TaskComposer resets state immediately after calling `onSubmit`
- Wire the new hook into TaskCreateComposer, replacing the existing `handleSubmit` callback
- Rename `TaskComposerSubmitRequest` → `TaskComposerFormData`
- Update tests: `onSubmit` mock is sync; assert state cleared unconditionally

### Phase 4 — Extract `useComposerFilterSync`; remove `useFeedInteractionDispatch` from TaskComposer
- Write `use-composer-filter-sync.ts` with the hook
- Add `filterTagNames`, `filterMentionPubkeys`, `onRemoveFilterTag`, `onRemoveFilterMention` props to TaskComposer
- Replace the two `useEffect` filter-sync hooks in TaskComposer with a single effect driven by the new props
- Replace `dispatchFeedInteraction` calls in `removeExplicitTag` / `removeExplicitMention` with `onRemoveFilterTag` / `onRemoveFilterMention` prop calls
- Remove `useFeedInteractionDispatch` import from TaskComposer
- Wire the hook into TaskCreateComposer
- Update tests

### Phase 5 — Extract `useComposerRelayBlock`; remove `useAuthActionPolicy` from TaskComposer
- Write `use-composer-relay-block.ts` with the hook (absorbs `useAuthActionPolicy`, relay validation, `shouldHideComposer`, `activeWritableRelayIds`)
- Rename `submitBlockByType` prop → `externalSubmitBlockByType` in TaskComposer
- Remove hardcoded `hasMeaningfulContent: true` etc. from TaskCreateComposer (those remain inside TaskComposer's own block computation)
- Remove `useAuthActionPolicy` import from TaskComposer; add `canCreateContent` as a boolean prop or fold into the external block
- Move the `shouldHideComposer` / `parentTask` / `activeWritableRelayIds` logic out of TaskCreateComposer and into the hook
- Wire into TaskCreateComposer
- Update tests: `useComposerRelayBlock` is independently testable

### Phase 6 — Clean up props interface
- Remove the flat duplicate props from `TaskComposerProps` that duplicate `TaskComposerOptions` fields (only `options` remains)
- Remove `useFeedSurfaceState` and `useFeedTaskViewModel` imports from TaskCreateComposer (moved into `useComposerRelayBlock`)
- Verify TaskCreateComposer has no remaining feed-level context hook calls besides `useNDK`

---

## New File Summary

| File | Role |
|------|------|
| `use-composer-relay-block.ts` | Relay validation, auth check, `shouldHideComposer`, `activeWritableRelayIds` |
| `use-composer-filter-sync.ts` | Filter-injected tag/mention derivation + removal dispatch |
| `use-composer-submit-handler.ts` | Dispatch to FeedInteractionBus + publish toasts + `closeOnSuccess` |
| `task-composer-runtime.ts` | Add exported `isWritableRelay` util |

## Modified File Summary

| File | Net change |
|------|-----------|
| `TaskComposer.tsx` | Remove 3 context hook imports; add 5 props; sync `onSubmit`; ~−150 lines |
| `TaskCreateComposer.tsx` | Replace inline logic with 3 hook calls; become thin compositor; ~−80 lines |
| `SharedViewComposer.tsx` | Import shared `isWritableRelay`; remove duplicate definition |
| `TaskComposer.test.tsx` | Sync onSubmit mocks; new filter prop tests |
| `TaskCreateComposer.test.tsx` | Add publish toast, error, filter-dispatch tests |
| `use-composer-relay-block.test.ts` | New — test relay/auth block logic in isolation |
| `use-composer-filter-sync.test.ts` | New — test filter sync and removal dispatch in isolation |
| `use-composer-submit-handler.test.ts` | New — test publish flow, toast lifecycle, closeOnSuccess |

---

## What This Achieves

- **TaskComposer** has zero knowledge of Nostr, relays, auth, or filter state. It is testable with plain props and a sync mock callback.
- **TaskCreateComposer** is a thin wiring layer — readable at a glance, no logic of its own.
- **Each concern** (relay validation, filter sync, publish dispatch) lives in a focused, independently testable hook.
- **No bloat transfer**: the complexity distributes across four small files instead of concentrating in one.
