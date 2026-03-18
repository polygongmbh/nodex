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

export const getComposerPrimaryAction = () =>
  screen.getByRole("button", {
    name: /create task|post offer|post request/i,
  });
export const getComposerCommentAction = () =>
  screen.getByRole("button", { name: /add comment/i });

export const getMobilePrimaryAction = () =>
  screen.getByRole("button", { name: /create task( \/ add comment)?|sign in to create/i });
export const getMobileCommentAction = () =>
  screen.getByRole("button", { name: /^add comment$/i });
export const getMobileSubmitBlockPanel = () => screen.getByRole("alert");
export const openMobileComposeOptions = () => fireEvent.click(getMobilePrimaryAction());
