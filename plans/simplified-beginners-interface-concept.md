# Plan: Simplified beginner interface with progressive advanced controls

## Goal
Define a beginner-friendly Nodex interface that reduces setup and filter complexity at first launch, while keeping the current underlying model intact so advanced controls can be enabled later without a product fork.

## Product Intent
- Make the first-run experience feel like "pick a space and start posting" instead of "configure a feed engine."
- Remove concepts that require understanding filter logic before the user has seen value.
- Keep advanced filtering power available behind explicit progression, not deleted from the product.
- Prefer fewer visible controls over teaching every current control via onboarding.

## Opinionated Direction
Ship a single UI with two surface levels:
- `simple` mode as the default for new users
- `advanced` mode as an explicit upgrade path

Do not build separate filter logic for the two modes.
Instead:
- keep `use-index-filters` and the current domain filtering model as the source of truth
- hide or constrain advanced controls in `simple` mode
- translate simple actions into today’s existing state transitions

Why this path:
- Lowest implementation risk
- Preserves compatibility with URL hydration, saved state, and existing tests
- Lets advanced mode be enabled later without migrating user data twice

## Beginner Surface Definition

### Visible in simple mode
- Relay selection as a single plain-language "Spaces" section
- Channel chips with single-select behavior: tap/click a channel to show that channel only
- People filter as a lightweight "From people" shortcut only if already obvious in context; otherwise defer
- Search
- Compose
- Clear filters / reset view

### Hidden in simple mode
- Saved filter configurations
- Channel include/exclude tri-state controls
- Channel `AND/OR` match mode toggle
- Pinned channels/people affordances
- Multi-relay power-user management details beyond basic space selection
- Quick filters such as priority/recent-days unless they are reintroduced later as guided shortcuts
- Power-user onboarding copy that teaches filter combinatorics

### Behavioral simplifications
- Selecting a channel behaves like today’s exclusive channel action
- Selecting a person behaves like today’s exclusive person action
- Selecting a different channel/person replaces the previous one instead of composing rules
- Relay scope uses simple selected-space semantics with clear defaults
- Reset returns to one predictable default feed state

## Proposed Information Architecture

### Desktop
- Sidebar becomes:
  - `Spaces`
  - `Channels`
  - `Search`
  - optional `People` only if it earns its place in usability testing
- Remove secondary icon actions from row items in simple mode
- Replace tri-state row controls with one primary action target per row
- Add a small `Advanced filters` entry point near the bottom of the sidebar, not inline beside every control

### Mobile
- `Manage` sheet becomes a simpler "Browse" or "Filters" sheet with only:
  - spaces
  - channels
  - search
  - reset
- Move profile/account/preferences below the discovery controls or into a separate account sheet if crowding remains
- Avoid making mobile beginners interpret different tap targets for select vs include/exclude vs pin

### Onboarding
- Reframe onboarding around:
  - choose a space
  - narrow by one channel
  - search
  - post a task/comment
- Remove current explanations of include/exclude and `AND/OR` logic from the beginner track

## Progressive Disclosure Path

### Phase 1: simple by default
- New users land in `simple` mode
- Existing users remain in current `advanced` mode by default to avoid surprise regression
- A local preference stores the selected interface level

### Phase 2: lightweight upgrade prompt
- After repeated filter usage or an explicit "need more control" click, offer:
  - include/exclude channels
  - combine channels with `AND/OR`
  - people and relay power controls
  - saved filter setups

### Phase 3: advanced mode parity
- Advanced mode exposes the current full filter surface with minimal behavior change
- Saved filters remain advanced-only until the simple mode semantics are stable

## Data and State Strategy

### New preference
Add a user-facing interface complexity preference:
```ts
type InterfaceComplexity = "simple" | "advanced";
```

Recommended storage:
- local preference first
- optional later sync with user preferences/NIP-78 if interface personalization is being synced elsewhere

### State mapping rules
- `simple` mode channel selection maps to existing `sidebar.channel.exclusive`
- `simple` mode person selection maps to existing `sidebar.person.exclusive`
- `simple` mode reset maps to existing full reset flow
- Hidden advanced state should not be silently destroyed on mode switches unless user explicitly resets

Important rule:
- if a user drops from advanced back to simple, preserve advanced state internally but do not expose contradictory controls
- if hidden advanced state would make the simple UI misleading, show a compact "advanced filters active" notice with a one-click reset or reopen-advanced action

## Recommended Implementation Milestones

### Milestone A: concept-safe foundation
1. Add `interfaceComplexity` preference plumbing and defaulting rules.
2. Add mode-aware render gates in desktop and mobile filter surfaces.
3. Keep existing filter engine unchanged.

### Milestone B: simple-mode UI
1. Desktop sidebar:
- replace channel tri-state affordances with exclusive-select rows in simple mode
- hide saved presets and match-mode toggle
2. Mobile filters:
- mirror the same simplified semantics
- reduce crowded secondary actions
3. Add a clear `Advanced filters` affordance

### Milestone C: onboarding and copy reset
1. Split onboarding into beginner-safe guidance versus advanced guidance.
2. Update i18n copy in `en`, `de`, and `es`.
3. Simplify empty states and helper copy to match the new mental model.

### Milestone D: polish and safety
1. Add "advanced filters active" notice when hidden state exists.
2. Review keyboard navigation and accessibility labels after row action simplification.
3. Add dev/debug logs for the new user-facing mode transitions per repo policy.

### Milestone E: optional follow-up
1. Evaluate moving profile/account controls out of the mobile filter sheet.
2. Reintroduce selected advanced features one at a time based on actual adoption.

## Files Most Likely Involved
- `src/features/feed-page/controllers/use-index-filters.ts`
- `src/components/layout/Sidebar.tsx`
- `src/components/mobile/MobileFilters.tsx`
- `src/components/filters/ChannelMatchModeToggle.tsx`
- `src/components/tasks/SavedFilterPresetRow.tsx`
- `src/components/onboarding/onboarding-steps.ts`
- `src/lib/app-preferences.ts`
- `src/infrastructure/preferences/user-preferences-storage.ts`
- `src/locales/en/common.json`
- `src/locales/de/common.json`
- `src/locales/es/common.json`

## UX Risks and Mitigations
- Risk: beginners lose useful narrowing power if people filters disappear completely.
  - Mitigation: keep only exclusive "show only this person" interactions where context already introduces the person.
- Risk: hidden advanced state makes the simple UI appear broken.
  - Mitigation: add explicit hidden-state notice and reset path.
- Risk: existing users perceive a downgrade.
  - Mitigation: keep existing users on advanced by default and scope simple mode to new-user default first.
- Risk: mobile sheet remains too crowded even after filter simplification.
  - Mitigation: split account/preferences from discovery controls in a follow-up if needed.

## Verification Strategy
- Category: major feature / cross-view UI change once implemented
- Required on implementation:
  - `npm run lint`
  - `npx vitest run`
  - `npm run build`

### Tests to add when implementing
- preference defaulting and persistence for interface complexity
- desktop simple-mode rendering hides advanced controls
- mobile simple-mode rendering hides advanced controls
- simple-mode channel selection maps to exclusive filter behavior
- switching between simple and advanced preserves compatible state
- hidden advanced-state notice appears only when needed

## Definition of Done
- New users can understand the feed controls without learning include/exclude or `AND/OR`
- Desktop and mobile share the same simplified mental model
- Advanced controls remain recoverable without data loss
- Onboarding and copy match the simplified product story
- Existing advanced users are not unexpectedly downgraded

## Recommendation
The best first slice is not "remove filters."
It is:
- default new users to `simple`
- make channel/person actions exclusive and singular in that mode
- move all combinatorial filtering behind one explicit `Advanced filters` entry point

That gives a genuinely easier beginner experience while preserving Nodex’s current filtering engine and future power-user path.
