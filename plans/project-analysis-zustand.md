# Three Structural Faults Forcing Everything Through `Index`

Looking at the full dependency graph, three structural faults force everything through `Index`. These problems are not React-specific — they would create a god-object in any framework.

---

## Fault 1: Shared Mutable State Requires a Common Ancestor

`setLocalTasks` is passed to 3 hooks.
`setPeople` to 4.
`setChannelFilterStates` to 4.
`setActiveRelayIds` to 4+.

These are all `useState` values owned by `Index`, because React requires shared mutable state to live in the lowest common ancestor of every reader and writer.

But the hooks sharing that state often do not depend on each other.

For example:

* `useTaskStatusController`
* `useTaskPublishFlow`
* `useListingStatusPublish`

All write to `localTasks` independently. They only need access to the same mutable cell, not to one another.

So `Index` exists largely to host shared state and thread setters into every consumer.

### Remedy

Move shared mutable state into domain stores (`Zustand`, `Jotai`, or `useSyncExternalStore` wrappers).

**Example stores**

**`taskMutationStore`**

* `localTasks`
* `suppressedNostrEventIds`
* `postedTags`

**`filterStore`**

* `channelFilterStates`
* `channelMatchMode`
* `quickFilters`
* people selection state
* `activeRelayIds`

Each hook reads and writes directly.

### Result

* No setter propagation
* No artificial common ancestor
* Less dependency threading

---

## Fault 2: Sequential Hook Outputs Create an Ordering Chain

The dependency graph has strict tiers:

```
useNostrEventCache
  → useKind0People
  → useIndexDerivedData
  → baseAllTasks
  → useTaskPublishControls
  → guardInteraction
  → useTaskStatusController
  → sortOverlays
  → allTasks
  → useTaskPublishFlow / useListingStatusPublish / useFeedNavigation / ...
```

Each hook consumes the return value of the previous stage as an explicit argument.

That forces one component to:

1. Call hooks in the correct order
2. Hold intermediate outputs
3. Pass each output into the next stage

That component is `Index`.

### Core Issue

Hooks declare dependencies as constructor arguments instead of subscriptions.

For example, `useTaskPublishFlow` does not truly need `allTasks` passed in as a prop. It needs access to the current task list wherever it lives.

### Remedy

Make the events → tasks pipeline a reactive derivation chain rather than a call-order chain.

If `allTasks` lives in a store (or focused context), any hook can subscribe directly.

**Examples**

* `useTaskPublishControls` reads relay state and auth state from stores
* `useTaskStatusController` reads `allTasks` and `guardInteraction` from stores

### Result

* No orchestration bottleneck
* No fragile call sequencing
* Easier composition

---

## Fault 3: Hooks Mix Commands, Domain State, and UI State

### Example: `useTaskStatusController`

Returns all of these together:

**Commands**

* `handleToggleComplete`
* `handleStatusChange`

**Derived internal state**

* `sortStatusHoldByTaskId`
* `sortModifiedAtHoldByTaskId`

**UI preference**

* `completionSoundEnabled`

These belong to different consumers, but they are bundled into one return object.

So `Index` must receive everything, unpack it, and route each piece manually.

---

### Example: `useTaskPublishFlow`

Returns:

**Commands**

* `handleNewTask`
* `handleRetryFailedPublish`

**Display state**

* `failedPublishDrafts`
* `isPendingPublishTask`

**Compose state**

* `composeRestoreRequest`

`Index` then redistributes these across:

* `taskCommands`
* `feedTaskViewModel`
* `feedViewState`

### Remedy

Hooks should write outputs directly to the appropriate stores instead of returning everything upward.

**Example**

`useTaskStatusController` could:

* write sort overlays into the task store
* let the task store recompute `allTasks`
* write `completionSoundEnabled` into a preferences store
* expose commands through store actions or focused context

### Result

`Index` no longer needs to receive, rename, or route unrelated outputs.

---

# What This Means for the Provider Approach

Context alone does not solve these faults.

A `FeedRelayProvider` exposing 22 values through context only relocates the problem:

* consumers still receive a bag of values
* the provider still orchestrates hooks
* the provider becomes the new `Index`

---

# What Actually Solves It

Stores solve all three structural issues:

## 1. State Lives With Its Domain

Not lifted to a common ancestor.

## 2. Derivations Become Subscriptions

Not sequential hook chains.

## 3. Outputs Go Straight to Their Destination

Not back through a central coordinator.

---

# Providers That Still Make Sense

Providers are useful when they are thin render-boundary wrappers:

* scope state to a subtree
* connect store subscriptions to rendering
* provide focused APIs

They should not be computation owners or orchestration hubs.
