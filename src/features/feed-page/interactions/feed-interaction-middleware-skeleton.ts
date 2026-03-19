import type { FeedInteractionMiddleware } from "./feed-interaction-pipeline";

// Stage-1 placeholders: these define the pipeline boundary while legacy handlers remain in place.
export const normalizeIntentMiddleware: FeedInteractionMiddleware = async (_envelope, _api, next) => {
  await next();
};

export const guardIntentMiddleware: FeedInteractionMiddleware = async (_envelope, _api, next) => {
  await next();
};

export function createFeedInteractionMiddlewareSkeleton(): FeedInteractionMiddleware[] {
  return [normalizeIntentMiddleware, guardIntentMiddleware];
}
