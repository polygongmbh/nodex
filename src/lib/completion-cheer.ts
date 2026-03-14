export function triggerTaskCompletionCheer(
  taskId: string,
  completionConfettiLastAt: Map<string, number>
): void {
  const launchCompletionConfetti = (taskElement: HTMLElement) => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const now = Date.now();
    const lastAt = completionConfettiLastAt.get(taskId) || 0;
    if (now - lastAt < 220) return;
    completionConfettiLastAt.set(taskId, now);

    const rect = taskElement.getBoundingClientRect();
    const burst = document.createElement("div");
    burst.setAttribute("data-confetti-burst", taskId);
    burst.style.position = "fixed";
    burst.style.left = `${rect.left + Math.min(44, rect.width * 0.2)}px`;
    burst.style.top = `${rect.top + Math.min(24, rect.height * 0.5)}px`;
    burst.style.pointerEvents = "none";
    burst.style.zIndex = "250";

    const particles = [
      { x: -18, y: -22, rotate: -22, color: "hsl(var(--success))" },
      { x: -8, y: -28, rotate: -6, color: "hsl(var(--primary))" },
      { x: 6, y: -26, rotate: 12, color: "hsl(var(--warning))" },
      { x: 18, y: -20, rotate: 24, color: "hsl(var(--success))" },
      { x: -3, y: -18, rotate: -14, color: "hsl(var(--primary))" },
      { x: 12, y: -16, rotate: 18, color: "hsl(var(--warning))" },
    ];

    for (const particle of particles) {
      const node = document.createElement("span");
      node.className = "motion-confetti-particle";
      node.style.position = "absolute";
      node.style.left = "0px";
      node.style.top = "0px";
      node.style.width = "0.28rem";
      node.style.height = "0.28rem";
      node.style.borderRadius = "9999px";
      node.style.background = particle.color;
      node.style.setProperty("--confetti-x", `${particle.x}px`);
      node.style.setProperty("--confetti-y", `${particle.y}px`);
      node.style.setProperty("--confetti-rotate", `${particle.rotate}deg`);
      burst.appendChild(node);
    }

    document.body.appendChild(burst);
    window.setTimeout(() => {
      burst.remove();
    }, 420);
  };

  window.setTimeout(() => {
    const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(taskId) : taskId;
    const taskElement = document.querySelector(`[data-task-id="${escapedId}"]`) as HTMLElement | null;
    if (!taskElement) return;
    taskElement.classList.remove("motion-completion-cheer");
    void taskElement.offsetWidth;
    taskElement.classList.add("motion-completion-cheer");
    launchCompletionConfetti(taskElement);
    window.setTimeout(() => {
      taskElement.classList.remove("motion-completion-cheer");
    }, 700);
  }, 0);
}
