# Expand Loading "Easter Eggs" and Rename to Clearer Keys

## Goal
Increase the variety of loading subtitles in filtered empty states and replace the vague/internal-sounding `easterEggs` key naming with product-facing, intention-revealing names.

## Why this change
- `easterEggs` implies hidden jokes; these are actually user-facing waiting prompts shown intentionally.
- More prompt variety reduces repetition when relay connections are slow.
- Better key names improve long-term maintainability and translation clarity.

## Opinionated approach
1. Rename `tasks.empty.loading.easterEggs` to `tasks.empty.loading.waitingPrompts`.
2. Rename current leaf keys to action-oriented names that describe user intent, not internal humor.
3. Expand from 3 prompts to 8 prompts.
4. Keep tone friendly and lightweight (short, calm, non-patronizing), and preserve parity across `en`, `de`, and `es`.

## Proposed key naming
Current:
- `tasks.empty.loading.easterEggs.glanceWindow`
- `tasks.empty.loading.easterEggs.stretch`
- `tasks.empty.loading.easterEggs.water`

Proposed:
- `tasks.empty.loading.waitingPrompts.glanceOutside`
- `tasks.empty.loading.waitingPrompts.standAndStretch`
- `tasks.empty.loading.waitingPrompts.drinkWater`
- `tasks.empty.loading.waitingPrompts.deepBreath`
- `tasks.empty.loading.waitingPrompts.postureReset`
- `tasks.empty.loading.waitingPrompts.eyeBreak`
- `tasks.empty.loading.waitingPrompts.quickWalk`
- `tasks.empty.loading.waitingPrompts.shoulderRoll`

## Suggested prompt copy (English baseline)
- `glanceOutside`: "Take a quick glance outside."
- `standAndStretch`: "Stand up and stretch for 10 seconds."
- `drinkWater`: "Take a sip of water."
- `deepBreath`: "One deep breath while we sync."
- `postureReset`: "Quick posture check: shoulders relaxed."
- `eyeBreak`: "Look into the distance for a moment."
- `quickWalk`: "Take a few steps and come back."
- `shoulderRoll`: "Roll your shoulders once to reset."

## Implementation steps
1. **Locale keys and copy**
   - Update `src/locales/en/common.json`, `src/locales/de/common.json`, and `src/locales/es/common.json`.
   - Replace `loading.easterEggs` block with `loading.waitingPrompts` and add all 8 entries.
   - Keep localized tone equivalent (not literal word-for-word).

2. **Component key references**
   - Update `src/components/tasks/FilteredEmptyState.tsx` to use `tasks.empty.loading.waitingPrompts.*` keys.
   - Prefer a single constant list in the component to keep deterministic testability.

3. **Tests**
   - Update `src/components/tasks/FilteredEmptyState.test.tsx` test name from “easter egg subtitle” to “waiting prompt subtitle”.
   - Keep `Math.random` mock-based deterministic assertion and update expected subtitle text.

4. **Changelog**
   - Add one concise `Unreleased` note in `CHANGELOG.md` describing expanded loading prompt variety and clearer naming.

## Validation
- Focused checks for localized logic/UI change:
  - `npx vitest run src/components/tasks/FilteredEmptyState.test.tsx`
  - `npx vitest run src/lib/i18n/locale-parity.test.ts`
- Recommended:
  - `npm run build`

## Risks and mitigations
- **Risk:** missing key parity across locales causes runtime fallback noise.
  - **Mitigation:** run locale parity tests and keep all three locale files in the same change.
- **Risk:** tone inconsistency between languages.
  - **Mitigation:** review copy for equivalent intent (brief wellness prompt) instead of literal translation.
