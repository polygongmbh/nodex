---
name: squash
description: Inspect recent unpushed commits and suggest sensible squashes for fixups and tightly related follow-ups. Invoke when the user says "squash" or asks to tidy local history before pushing. Only rewrites unpushed commits unless the user explicitly says otherwise.
---

# squash — local-history tidy

## 1. Survey
- `git log --oneline @{u}..HEAD` (unpushed commits only by default).
- If no upstream, fall back to `git log --oneline <main-branch>..HEAD` and note this.
- Read each commit's full message + diff stat to spot fixup/tightly-related pairs.

## 2. Propose candidates
List each proposed squash as:

```
<short-hash> <original message>
  → squash into <target-hash> <target message>
  reason: <why these belong together>
```

Group fixups with their target; keep unrelated functional changes separate. Preserve atomic, coherent, individually-buildable history.

**Wait for user confirmation before executing.**

## 3. Execute
- **Preferred (contiguous tip block):** `git reset --soft <target>` then selective recommits with the consolidated messages.
- **Interactive rebase** only when the edits span non-contiguous history or a soft reset would make reconstruction materially less clear.
- Never rewrite pushed history unless the user explicitly says so.

## 4. Verify
After squashing, diff the new tip against the pre-squash head:
```sh
git diff <pre-squash-sha> HEAD
```
There should be **no difference**. If there is, stop and ask how to proceed.

Report the resulting commits in the format: `✅ <hash> <type>: <message> (+<added> ~<changed> -<removed>)`.

## Notes
- This skill encapsulates what AGENTS.md §"Special Commands → squash" prescribes; keep them in sync.
- For a direct fixup of the immediately previous local commit, prefer `git commit --amend` at commit time rather than squashing later.
