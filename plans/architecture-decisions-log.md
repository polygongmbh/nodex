# Architecture decisions & corrections log

A running record of architectural steers, corrections, and mistakes
caught while working on this codebase — the *reasoning* behind changes
that the diffs and commit messages don't capture. Append new entries at
the top. Each entry: what was proposed, what was wrong with it, what we
did instead, and the durable rule it establishes.

The governing test that recurs below: **a React context / provider must
justify itself with real, hook-level consumers. State that only travels
from a producer, through a provider, back to one consumer is
prop-drilling laundered through context — delete the context.**

---

## 2026-06→07 — Collapse the FeedPageProviders pyramid + fold onboarding

Context: `plans/feed-bundles-refactor.md` Part A originally said to
*split* three command god-bundles into more concern-specific contexts
("break up rather than renaming"). Executing that produced an 11-deep
provider pyramid. The user challenged it, and the plan inverted.

### Steer 1 — "what is the rationale about this?" (the 4-way split)
Splitting `FeedSidebarCommands` into four contexts assumed
consumer-level fan-out. **grep proved there were zero component
consumers** — the only reader was the interaction bus in the same file.
→ **Correction:** don't split bus-only contexts; *delete* them and pass
their values to the bus as plain props. The bus is now fully
prop-driven and reads no context.
→ **Rule:** verify a context has real `useX()` call sites (outside the
file that produces it) before preserving — let alone splitting — it.

### Steer 2 — "clarify the role of every remaining provider with scrutiny"
A blanket "these all have fan-out" claim was wrong. Per-provider grep
found:
- `isSidebarFocused` in `FeedViewState` had **zero** context readers
  (consumed via the `desktopSidebarController` prop path) — dead field.
- `currentView` had a **single producer** (`useFeedNavigation`) and a
  handful of readers → prop-drill, don't re-aggregate into a context.
- `FeedTaskCommands`' 15 methods: only `createTask` had real component
  consumers; the rest were bus-only.
→ **Rule:** audit each field/method individually. "This provider has
consumers" is not a license for everything it carries.

### Steer 3 — "I believe these should be read from stores instead" (FeedViewState)
`FeedViewState` was a junk-drawer context re-aggregating values that
each had a real home. → Dismantled field-by-field to the real source:
`displayDepthMode`→preferences store, `canCreateContent`→
`useAuthActionPolicy`, onboarding→OnboardingController, etc. Context
deleted.
→ **Rule:** don't create an aggregation context that mirrors values
already owned elsewhere; read from the owner.

### Steer 4 — prop-drill vs a new hook that reads the router
Plan wanted a `useViewRoute()` deriving `currentView` from the URL so
leaf shells wouldn't need a prop. But that couples leaf components to
the router and forces `MemoryRouter` into their unit tests (a
documented anti-pattern here). `currentView` already has a single
producer in Index.
→ **Correction:** prop-drill `currentView` from Index instead. Fewer
than 3 levels, keeps leaf components router-free and prop-testable.
→ **Rule:** don't couple a leaf component to global/router context just
to avoid a shallow prop. A prop from the single producer beats a second
derivation site (which also risks "two sources of one value").

### Steer 5 — "treat the manage route more like a temporary overlay"
Mobile `/manage` was a real URL whose `isManageRouteActive` merely
synced into MobileLayout's local `showFilters` — a redundant mirror.
Making `currentView` a pure function of the URL was blocked by the
`lastContentViewRef` fallback that existed only for the `/manage`
detour.
→ **Correction:** demoted `manage` to a pure local overlay (no route),
which removed `lastContentViewRef` and made `currentView` URL-pure.
User-facing tradeoff (accepted): `/manage` is no longer deep-linkable /
back-button-closable. USER_GUIDE already described it as a pane.
→ **Rule:** don't route transient overlays whose state already lives
locally; the URL mirror is dead weight and it distorts derived state.

### Steer 6 — "I don't think the manage overlay needs a separate store; why does onboarding close the pane?"
Investigation: onboarding never *opens* the pane (a guide step tells the
*user* to tap Manage). It only *closes* it on the mobile compose step,
to reveal the composer the overlay covers. And the compose-guide already
raises `forceShowComposer` (via `composer-signals-store`), which
MobileLayout **already consumes**.
→ **Correction:** key the overlay-close off the existing
`forceComposeMode` signal. No new store, no onboarding-step prop —
MobileLayout ends up fully decoupled from onboarding.
→ **Rule:** before adding a store/prop for cross-component coordination,
check whether an existing signal already carries the intent. Reuse it.

### Steer 7 — "fold use-onboarding into OnboardingController; it's mostly re-exporting"
`useOnboarding` lived in Index only to wire to navigation setters, then
~8 outputs were forwarded straight back down to OnboardingController.
→ **Correction:** OnboardingController now owns `useOnboarding`; the
hook dispatches interaction intents (`ui.view.change`,
`task.focus.change`) instead of taking Index setters, writes its
composer signals to the store directly, and reads open-state from a new
focused `useOnboardingStore` (needed because the guide is opened from
outside its tree via the `ui.openGuide` bus intent).
→ **Rule:** a controller hook shouldn't be hoisted to a parent just to
borrow setters and then re-export its results. Have it dispatch intents
/ read+write stores so it's self-sufficient and lives with its UI.

### Residual seam (intentional, documented)
`OnboardingController` still receives `onBeforeResetFocusedTaskScope`
(clears an Index-local filter-restore ref) as one command prop. Fully
removing it would mean moving `useTaskScopeSpecificFilters`'
`suspendedSnapshotRef` into a store — out of scope, deferred. A single
command prop from the owner is acceptable; it's not state re-export.

---

## Process corrections caught this session

### `git commit <pathspec>` silently dropped `git add`ed new files (×3)
`git add <newfile> && git commit -m "…" <pathspec-without-newfile>`
commits only the named paths — the new file stays staged, so HEAD
imports a file it doesn't contain (broken on clean checkout / bisect).
Happened three times (`feed-interaction-inputs.ts`,
`onboarding-store.ts`, plus prior test files).
→ **Rule (now a hard habit):** never `git add` then `git commit
<pathspec>`. Either name every file incl. new ones in the pathspec, or
`git commit` the staged set with no pathspec — and **always `git status`
after** (clean tree = nothing dropped). Fix: amend if unpushed,
forward-fix commit if already pushed.

### Overlapping-file commits can't be cleanly split after the fact
Two intended commits (collapse contexts / peel failed-publish) shared
edits in the same files (`Index.tsx`, `FeedPageProviders.tsx`, the new
inputs module), so a clean 2-way split was impossible without hunk-level
staging.
→ **Rule:** when consecutive commits will touch the same files, decide
up front whether they're really one logical unit; if so, commit once.
Don't `git add`-then-partial-commit your way into an unsplittable mess.

---

## Open follow-ups (not yet done)
- **`plans/feed-bundles-refactor.md` Part B** — the `Feed*` naming
  sweep. Part A is done; B is the only remaining work there.
- **`composer-shell-ownership-refactor`** — once mobile submission
  routes through the shared composer hook, `FeedTaskCommands` has a
  single consumer and its context can be deleted (see its `// TODO`).
- **`discardTaskScopeFilterRestore` seam** — could become a store
  action / intent to fully decouple OnboardingController from Index.
