import { fireEvent, screen } from "@testing-library/react";

const composerPlaceholders = {
  task: /what's up\? use #channels and @mentions/i,
  comment: /add your comment with #channels and @mentions/i,
  offer: /post an offer with #channels and @mentions/i,
  request: /post a request with #channels and @mentions/i,
};

export const getTaskComposerInput = () =>
  screen.getByRole("textbox", { name: composerPlaceholders.task });

export const getCommentComposerInput = () =>
  screen.getByRole("textbox", { name: composerPlaceholders.comment });

export const getOfferComposerInput = () =>
  screen.getByRole("textbox", { name: composerPlaceholders.offer });

export const getRequestComposerInput = () =>
  screen.getByRole("textbox", { name: composerPlaceholders.request });

export const getComposerPrimaryAction = () => screen.getByTestId("composer-primary-action");
export const getComposerCommentAction = () => screen.getByTestId("compose-secondary-action-comment");

export const getMobilePrimaryAction = () => screen.getByTestId("mobile-compose-primary-action");
export const getMobileCommentAction = () => screen.getByTestId("mobile-compose-comment-action");
export const getMobileSubmitBlockPanel = () => screen.getByTestId("mobile-task-submit-block-panel");
export const openMobileComposeOptions = () => fireEvent.click(getMobilePrimaryAction());
