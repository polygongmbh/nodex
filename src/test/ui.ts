import { fireEvent, screen } from "@testing-library/react";

export const getTaskComposerInput = () =>
  screen.getByRole("textbox");

export const getCommentComposerInput = () =>
  screen.getByRole("textbox");

export const getOfferComposerInput = () =>
  screen.getByRole("textbox");

export const getRequestComposerInput = () =>
  screen.getByRole("textbox");

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
