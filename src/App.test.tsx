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
import * as transfer from "./collection-transfer";
import * as storage from "./storage";

afterEach(() => {
  cleanup();
  localStorage.removeItem("command-pad-theme");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  vi.restoreAllMocks();
});

test("favorites are the initial view and stars toggle without opening edit", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue({
    collections: [{ id: "git", name: "Git" }],
    commands: [
      {
        id: "1",
        name: "Status",
        body: "git status",
        collection_id: "git",
        favorite: false,
      },
    ],
  });
  const save = vi.spyOn(storage, "saveData").mockResolvedValue();
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Favorites" }),
  ).toBeTruthy();
  await screen.findByRole("button", { name: "Git, 1 command" });
  fireEvent.click(screen.getByRole("button", { name: "Git, 1 command" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Add Status to favorites" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Favorites, 1 command" }));
  expect(
    screen.getByRole("button", { name: /Status.*git status/ }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Status from favorites" }),
  );
  await screen.findByText("No favorites yet");
});

test("creates and moves a command into a collection", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue({
    collections: [{ id: "git", name: "Git" }],
    commands: [],
  });
  vi.spyOn(storage, "saveData").mockResolvedValue();
  render(<App />);
  const newCommand = await screen.findByRole("button", { name: "New command" });
  await waitFor(() => expect(newCommand).not.toHaveProperty("disabled", true));
  fireEvent.click(newCommand);
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Title"), {
    target: { value: "Git status" },
  });
  fireEvent.change(within(dialog).getByLabelText("Command"), {
    target: { value: "git status" },
  });
  fireEvent.change(within(dialog).getByLabelText("Collection"), {
    target: { value: "git" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add command" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Git, 1 command" }));
  expect(
    screen.getByRole("button", { name: /Git status.*git status/ }),
  ).toBeTruthy();
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

test("imports a collection copy and preserves the existing library", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue({
    collections: [{ id: "git", name: "Git" }],
    commands: [],
  });
  const save = vi.spyOn(storage, "saveData").mockResolvedValue();
  vi.spyOn(transfer, "readCollectionFile").mockResolvedValue(
    JSON.stringify({
      format: "command-pad-collection",
      version: 1,
      collection: { name: "Git" },
      commands: [{ name: "Status", body: "git status", favorite: true }],
    }),
  );
  render(<App />);
  const button = await screen.findByRole("button", {
    name: "Import collection",
  });
  await waitFor(() => expect(button).not.toHaveProperty("disabled", true));
  fireEvent.click(button);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const saved = save.mock.calls[0][0];
  expect(saved.collections).toHaveLength(2);
  expect(saved.collections[0].id).toBe("git");
  expect(saved.collections[1].id).not.toBe("git");
  expect(saved.commands[0].collection_id).toBe(saved.collections[1].id);
  expect(
    await screen.findByRole("heading", { name: "Git (copy)" }),
  ).toBeTruthy();
});

test("does not update favorites if saving fails", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue({
    collections: [],
    commands: [
      {
        id: "1",
        name: "Status",
        body: "git status",
        collection_id: null,
        favorite: false,
      },
    ],
  });
  vi.spyOn(storage, "saveData").mockRejectedValue(new Error("disk full"));
  render(<App />);
  const uncategorized = await screen.findByRole("button", {
    name: "No collection, 1 command",
  });
  fireEvent.click(uncategorized);
  fireEvent.click(
    screen.getByRole("button", { name: "Add Status to favorites" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain("disk full");
  expect(
    screen.getByRole("button", { name: "Add Status to favorites" }),
  ).toBeTruthy();
});

test("export is available only for a named collection", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue({
    collections: [{ id: "git", name: "Git" }],
    commands: [],
  });
  const exportFile = vi
    .spyOn(transfer, "writeCollectionFile")
    .mockResolvedValue();
  render(<App />);
  const git = await screen.findByRole("button", { name: "Git, 0 commands" });
  expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  fireEvent.click(git);
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  await waitFor(() => expect(exportFile).toHaveBeenCalledTimes(1));
  expect(exportFile.mock.calls[0][0]).toBe("Git");
});

test("a new command created from Favorites is starred", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue({
    collections: [],
    commands: [],
  });
  const save = vi.spyOn(storage, "saveData").mockResolvedValue();
  render(<App />);
  const newCommand = await screen.findByRole("button", { name: "New command" });
  await waitFor(() => expect(newCommand).not.toHaveProperty("disabled", true));
  expect(screen.queryByRole("button", { name: "Add a command" })).toBeNull();
  fireEvent.click(newCommand);
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Title"), {
    target: { value: "Status" },
  });
  fireEvent.change(within(dialog).getByLabelText("Command"), {
    target: { value: "git status" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add command" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].commands[0].favorite).toBe(true);
  expect(
    await screen.findByRole("button", { name: "Remove Status from favorites" }),
  ).toBeTruthy();
});

test("appearance preference persists across app mounts", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue({
    collections: [],
    commands: [],
  });
  const first = render(<App />);
  const select = screen.getByRole("combobox", { name: "Appearance" });
  expect((select as HTMLSelectElement).value).toBe("system");
  fireEvent.change(select, { target: { value: "dark" } });
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("dark"),
  );
  expect(localStorage.getItem("command-pad-theme")).toBe("dark");
  first.unmount();
  render(<App />);
  expect(
    (screen.getByRole("combobox", { name: "Appearance" }) as HTMLSelectElement)
      .value,
  ).toBe("dark");
  fireEvent.change(screen.getByRole("combobox", { name: "Appearance" }), {
    target: { value: "light" },
  });
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("light"),
  );
});
