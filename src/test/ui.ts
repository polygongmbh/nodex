import { fireEvent, screen } from "@testing-library/react";

export const getTaskComposerInput = () =>
  screen.getByRole("textbox");

export const getCommentComposerInput = () =>
  screen.getByRole("textbox");

export const getOfferComposerInput = () =>
  screen.getByRole("textbox");

export const getRequestComposerInput = () =>
  screen.getByRole("textbox");

export const getComposerPrimaryAction = () => screen.getByTestId("composer-primary-action");
export const getComposerCommentAction = () => screen.getByTestId("composer-comment-action");

export const getMobilePrimaryAction = () => screen.getByTestId("mobile-primary-action");
export const getMobileCommentAction = () => screen.getByTestId("mobile-comment-action");
export const getMobileSubmitBlockPanel = () => screen.getByRole("alert");
export const openMobileComposeOptions = () => fireEvent.click(getMobilePrimaryAction());
