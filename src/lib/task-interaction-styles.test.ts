import { describe, it, expect } from "vitest";
import { TASK_INTERACTION_STYLES } from "./task-interaction-styles";

describe("TASK_INTERACTION_STYLES", () => {
  it("uses stable shared class contracts", () => {
    expect(TASK_INTERACTION_STYLES.hoverText).toBe("task-hover-text");
    expect(TASK_INTERACTION_STYLES.hoverLinkText).toBe("task-hover-link");
    expect(TASK_INTERACTION_STYLES.hashtagChip).toBe("task-hashtag-chip");
    expect(TASK_INTERACTION_STYLES.inlineLink).toBe("task-inline-link");
  });
});
