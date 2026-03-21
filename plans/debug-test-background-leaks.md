# Debug Test Background Leaks

## What I found

- `src/lib/nostr/provider/ndk-provider.tsx` schedules reconnect retries with bare `setTimeout(...)` calls in the `relay:disconnect` path and does not retain handles for cleanup on unmount.
- `src/lib/nostr/provider/ndk-provider.tsx`, `src/lib/nostr/provider/use-profile-sync.ts`, and `src/lib/nostr/provider/use-relay-enrichment.ts` all create fallback `setTimeout(finish, ...)` timers around NDK subscriptions without clearing those timers once the promise resolves early.
- `src/test/setup.ts` only restores mocks in `afterAll`; it does not enforce `afterEach` cleanup, timer reset, or leak detection for leftover timers / RAF work / DOM subscriptions.
- The slowest UI tests already point at the same pressure areas:
  - `src/components/tasks/CalendarView.test.tsx` relies on real scroll / RAF behavior and needed longer timeouts.
  - `src/components/onboarding/OnboardingGuide.tsx` uses multiple intervals, observers, scroll listeners, and timeouts that are cleanup-sensitive.

## Likely failure mode

Vitest workers are probably not leaking OS terminals by themselves; they are being kept alive by queued timers / animation work / subscription fallbacks that outlive the test that created them. Under parallel load, that turns into higher memory pressure and longer teardown, which matches the hanging / timing-out behavior seen during the release verification run.

## Opinionated fix path

1. Add strict per-test teardown in `src/test/setup.ts`.
   - Run `cleanup()` after each test.
   - Always restore real timers after each test.
   - Add a lightweight leak detector in test mode that tracks outstanding `setTimeout`, `setInterval`, and `requestAnimationFrame` handles created by app code and fails the test if they remain after cleanup.

2. Make NDK timer usage explicitly cancellable.
   - In `src/lib/nostr/provider/ndk-provider.tsx`, track reconnect retry timeout IDs in a ref and clear them in the provider cleanup path.
   - Replace fallback `setTimeout(finish, ...)` patterns in provider/profile/relay-enrichment helpers with cancellable handles that are cleared both on normal completion and on teardown.
   - Prefer one small shared helper for cancellable subscription fallback timers instead of repeating ad hoc timeout code.

3. De-risk the heaviest UI tests.
   - Refactor `CalendarView` tests to stub or fake time/RAF-sensitive behavior where possible instead of depending on full real scroll scheduling.
   - Audit `OnboardingGuide` tests for any missing timer restoration or unmount reliance and move repeated timer hygiene into shared test utilities.

4. Re-run the suite with instrumentation, then tune Vitest only if necessary.
   - First confirm the real leaks are gone with the new teardown guard.
   - If memory is still too high, cap Vitest worker concurrency in `vitest.config.ts` for jsdom-heavy local runs instead of using the current unconstrained default.

## Verification plan

- Run targeted tests first:
  - `npx vitest run src/lib/nostr/provider/ndk-provider.test.tsx`
  - `npx vitest run src/components/tasks/CalendarView.test.tsx`
  - `npx vitest run src/components/onboarding/OnboardingGuide.test.tsx`
- Then run full verification:
  - `npm run lint`
  - `npx vitest run`
  - `npm run build`
- Success criteria:
  - No leftover timer / RAF leak detector failures.
  - Full Vitest run exits cleanly without hanging in teardown.
  - No need for orphaned background sessions to remain open after test completion.
