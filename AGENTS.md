# AGENTS.md Instructions

These rules apply to all AI-assisted changes in this repository.

## Commit Discipline
- After every change, create atomic commits that build individually and are coherent.
- You may amend commits with corrections if they are not yet pushed.
- Use semantic commit messages (Conventional Commits), e.g. `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.

## Test-First Workflow
- Write tests before each change.
- Verify all tests run after each change.
- Ask before adjusting existing tests and explain why.
- Before adjusting existing tests, first consider whether the implementation can be changed to preserve current functionality.

## Protocol Compliance
- Conform to Nostr protocol standards as written in the NIPs repository:
  - https://github.com/nostr-protocol/nips/
- Reference relevant NIPs in commit messages and/or PR descriptions when protocol behavior is affected.

## Product Stage
- The software is currently in beta state.
- Breaking changes are allowed when justified, but document them clearly in commit messages and user-facing notes.

## Logging and User Feedback
- Implement consistent but safe console logging:
  - Keep logs structured and minimal.
  - Never log secrets, private keys, tokens, or sensitive user data.
  - Prefer `console.warn`/`console.error` for actionable issues and avoid noisy debug output in normal flows.
- Provide user feedback via toasts for significant outcomes:
  - Success toast for completed user actions.
  - Error toast for failures with clear next-step guidance where possible.
  - Avoid duplicate or spammy toasts for the same event.
