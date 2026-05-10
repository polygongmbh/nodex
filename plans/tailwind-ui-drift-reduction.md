# Tailwind UI Drift Reduction Plan

## Goal

Reduce unintentional visual drift caused by long, duplicated Tailwind class strings
in shared form and control components,
without replacing Tailwind or forcing a broad UI rewrite.

## Opinionated Approach

Keep Tailwind,
but move the codebase away from raw repeated utility strings in product components.
The primary mechanism should be:

1. shared primitives for common control chrome
2. explicit variant APIs for size, tone, and state
3. a small set of semantic component classes for repeated composite surfaces

This keeps the existing stack,
avoids a risky styling migration,
and directly addresses the actual failure mode:
policy drift across many local `className` strings.

## Scope

Initial scope should target the highest-leverage shared UI surfaces:

- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/command.tsx`
- repeated search/filter controls such as `src/components/tasks/DesktopSearchDock.tsx`

Do not attempt a repo-wide restyle in the first pass.
Treat this as infrastructure work for future UI consistency.

## Plan

### 1. Inventory repeated control patterns

Audit form and search/filter surfaces for repeated combinations of:

- border, radius, padding, and background chrome
- focus rings and interactive states
- placeholder and secondary text treatment
- icon-leading input layouts
- compact vs default sizing

Deliverable:
a short map of repeated style groups and the components that currently duplicate them.

### 2. Define control styling policy

Establish a small policy for shared controls:

- which states belong in every field by default
- which tokens come from CSS variables vs utility classes
- which dimensions become variants instead of one-off overrides
- which downstream overrides are still acceptable

Deliverable:
a documented variant model for core controls before refactoring call sites.

### 3. Refactor shared primitives to variants

Refactor shared UI primitives so repeated styling is encoded once.
Likely implementation:

- use `cva` or equivalent variant composition already compatible with the repo
- add variants only where there is real repetition
- keep primitives readable and avoid a “variant explosion”

Candidate variants:

- `size`: compact, default, large if justified
- `tone`: default, subtle, destructive only if existing use cases require them
- `leadingIcon`: where layout shifts are otherwise repeated

Guardrail:
do not encode page-specific layout concerns into primitives.

### 4. Extract semantic composite classes for repeated surfaces

For higher-order controls that are more than a single field,
introduce semantic classes in `src/index.css` `@layer components`
or a similarly centralized styling location.

Good candidates:

- desktop search bars
- filter rows
- toolbar control groups

This is the right layer for composite chrome
that would be awkward to force into every primitive variant.

### 5. Convert the worst drift-prone call sites

Replace the most duplicated and high-traffic raw class strings first.
Prioritize components used across views rather than isolated one-offs.

Initial candidates:

- `DesktopSearchDock`
- mobile/desktop filter controls
- shared auth/profile field groups

Leave isolated local layout styling alone unless it duplicates a known pattern.

### 6. Add regression coverage for styling policy

Avoid brittle class snapshots.
Instead,
add focused tests around component variants and stable behavior contracts where useful.

Examples:

- shared controls render expected size/state class hooks
- placeholder/disabled/error states remain distinguishable
- search/filter controls retain accessible semantics

If test coverage is not practical for a styling rule,
document the rule in the primitive API and verify with build plus targeted manual review.

### 7. Add maintenance guardrails

After the refactor,
update repo guidance so future changes do not regress back to raw class sprawl.

Candidate guardrails:

- new shared control patterns must land in primitives or semantic component classes
- product components should not repeat full control chrome strings when a shared option exists
- long `className` strings are acceptable for local layout,
  not for repeated design policy

This likely belongs in `AGENTS.md`
once the implementation pattern is proven rather than before.

## Verification Strategy

Because this is a cross-view UI refactor,
the implementation pass should follow the repo’s larger-change matrix:

- `npm run lint`
- `npx vitest run`
- `npm run build`

Manual review should include:

- placeholder readability
- focus visibility
- disabled-state clarity
- desktop and mobile search/filter surfaces

## Risks

- Over-abstracting variants too early can make primitives harder to use than the current inline classes.
- Moving too much into primitives can accidentally absorb page-level layout concerns.
- A repo-wide conversion in one pass would create noisy diffs with weak reviewability.

## Recommended Execution Order

1. inventory and define policy
2. refactor `Input`, `Textarea`, `Select`, and `CommandInput`
3. extract one semantic composite pattern for search/filter chrome
4. convert the most duplicated callers
5. run full verification
6. decide whether a second cleanup milestone is justified

## Success Criteria

- shared controls own the common field styling policy
- repeated search/filter chrome is centralized
- new placeholder/focus/chrome changes can be made in one place
- product components contain less raw repeated control styling
- diffs for future UI tweaks become smaller and more predictable
