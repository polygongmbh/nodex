import { describe, expect, it, vi } from "vitest";
import { createFeedInteractionBus } from "./feed-interaction-pipeline";

describe("feed interaction pipeline", () => {
  it("runs middleware, handler, and effects in order", async () => {
    const order: string[] = [];

    const bus = createFeedInteractionBus({
      middlewares: [
        async (_envelope, _api, next) => {
          order.push("mw:before");
          await next();
          order.push("mw:after");
        },
      ],
      handlers: {
        "ui.focusSidebar": async () => {
          order.push("handler");
        },
      },
      effects: [
        async (event) => {
          order.push(`effect:${event.outcome.status}`);
        },
      ],
    });

    const event = await bus.dispatch({ type: "ui.focusSidebar" });

    expect(event.outcome.status).toBe("handled");
    expect(order).toEqual(["mw:before", "handler", "mw:after", "effect:handled"]);
  });

  it("marks an interaction as blocked when middleware short-circuits", async () => {
    const handler = vi.fn();
    const statuses: string[] = [];

    const bus = createFeedInteractionBus({
      middlewares: [
        async () => {
          // Intentionally stop the chain.
        },
      ],
      handlers: {
        "ui.focusSidebar": handler,
      },
      effects: [
        async (event) => {
          statuses.push(event.outcome.status);
        },
      ],
    });

    const event = await bus.dispatch({ type: "ui.focusSidebar" });

    expect(event.outcome.status).toBe("blocked");
    expect(handler).not.toHaveBeenCalled();
    expect(statuses).toEqual(["blocked"]);
  });

  it("marks an interaction as unhandled and calls onUnhandledIntent", async () => {
    const onUnhandledIntent = vi.fn();

    const bus = createFeedInteractionBus({
      onUnhandledIntent,
    });

    const event = await bus.dispatch({ type: "ui.focusSidebar" });

    expect(event.outcome.status).toBe("unhandled");
    expect(onUnhandledIntent).toHaveBeenCalledTimes(1);
    expect(onUnhandledIntent.mock.calls[0][0].intent.type).toBe("ui.focusSidebar");
  });

  it("exposes the handler result on the interaction outcome", async () => {
    const bus = createFeedInteractionBus({
      handlers: {
        "ui.focusSidebar": async () => ({ ok: true }),
      },
    });

    const event = await bus.dispatch({ type: "ui.focusSidebar" });

    expect(event.outcome.status).toBe("handled");
    expect(event.outcome.result).toEqual({ ok: true });
  });
});
