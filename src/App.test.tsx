// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";
import * as storage from "./storage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("creates, edits, and moves a command between categories", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue({
    categories: [{ id: "git", name: "Git" }],
    commands: [],
  });
  const save = vi.spyOn(storage, "saveData").mockResolvedValue();
  render(<App />);
  const newCommand = await screen.findByRole("button", { name: "New command" });
  await waitFor(() => expect(newCommand).not.toHaveProperty("disabled", true));
  fireEvent.click(newCommand);
  let dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Title"), {
    target: { value: "Git status" },
  });
  fireEvent.change(within(dialog).getByLabelText("Command"), {
    target: { value: "git status" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add command" }));
  await screen.findByRole("button", { name: /Git status/ });
  expect(save).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: /Git status/ }));
  dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Category"), {
    target: { value: "git" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /Git status/ })).toBeNull(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Git, 1 command" }));
  expect(screen.getByRole("button", { name: /Git status/ })).toBeTruthy();
  expect(save).toHaveBeenCalledTimes(2);
});

test("does not allow saving after data fails to load", async () => {
  vi.spyOn(storage, "loadData").mockRejectedValue(new Error("Invalid JSON"));
  render(<App />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Invalid JSON",
  );
  expect(screen.getByRole("button", { name: "New command" })).toHaveProperty(
    "disabled",
    true,
  );
});
