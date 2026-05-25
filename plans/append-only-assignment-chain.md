# append-only assignment chain

  Drop addressable/replaceable entirely. Use regular events, link each one to its predecessor, and let authority flow with the assignment.

  {
    "kind": 1634,
    "content": "<optional handoff note>",
    "tags": [
      ["e", "<issue-or-PR-event-id>", "<relay-url>", "root"],
      ["e", "<previous-1634-event-id>", "<relay-url>", "reply"], // omit on the first assignment
      ["a", "30617:<repo-owner>:<repo-id>", "<relay-url>"],
      ["r", "<earliest-unique-commit-id-of-repo>"],

      // current assignees after this event; zero entries = unassigned
      ["p", "<new-assignee-pubkey>", "<relay-url>", "assignee"],
      ["e", "<issue-or-PR-event-id>", "<relay-url>", "root"],
      ["e", "<previous-1634-event-id>", "<relay-url>", "reply"], // omit on the first assignment
      ["a", "30617:<repo-owner>:<repo-id>", "<relay-url>"],
      ["r", "<earliest-unique-commit-id-of-repo>"],
      ["a", "30617:<repo-owner>:<repo-id>", "<relay-url>"],
      ["r", "<earliest-unique-commit-id-of-repo>"],
      ["a", "30617:<repo-owner>:<repo-id>", "<relay-url>"],
      ["r", "<earliest-unique-commit-id-of-repo>"],

      // current assignees after this event; zero entries = unassigned
      ["p", "<new-assignee-pubkey>", "<relay-url>", "assignee"],

      // courtesy notifications
      ["p", "<previous-assignee-pubkey>"],
      ["p", "<issue-author-pubkey>"]
    ]
  }

  Authority rule

  A 1634 event is valid iff its pubkey (the signer) is, at the moment of created_at:

  - the issue/PR author, or
  - a maintainer of the referenced repo (per the latest 30617 maintainers tag), or
  - listed as an assignee-marked p in the most recent prior valid 1634 for this issue.

  Clients reduce by walking valid 1634 events in created_at order starting from the root issue. The newest valid event determines the current assignee set. History is the full event list — nothing is replaced
   or deleted.

  Why this works for your constraints

  - Assignee can reassign: the authority rule includes the current assignee, so handoff is self-served. Once they publish a valid 1634 naming someone else, that someone else inherits the authority and the
  prior assignee loses it (unless re-listed).
  - Full history: every reassignment is its own event; the prev-marked e tag forms an auditable chain you can render as a timeline.
  - Forks under concurrency: if two valid signers publish at the same time referencing the same predecessor, tiebreak by created_at, then lexicographic event id (the same convention NIP-34 Status implicitly
  relies on). Clients MAY surface the fork; resolution is a new 1634 from any current authority.
  - Unassign: publish a 1634 with no assignee-marked p. The next reassignment must then come from the author or a maintainer (assignee-derived authority is empty).
  - Self-assignment by a maintainer/author: same event, signer just lists themselves under assignee.

  One subtlety worth calling out in the spec

  "Maintainer" is itself mutable (the repo's 30617 is addressable). To keep validation deterministic, define it as: the maintainer set of the 30617 event with the greatest created_at ≤ the 1634's created_at.
  Otherwise a maintainer-set change could retroactively invalidate old assignments.
