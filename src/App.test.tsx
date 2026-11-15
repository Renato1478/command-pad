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
import type { Data } from "./types";

function library(overrides: Partial<Data> = {}): Data {
  return {
    collections: [],
    folders: [],
    commands: [],
    ...overrides,
  };
}

function nestedLibrary(): Data {
  return library({
    collections: [{ id: "git", name: "Git" }],
    folders: [
      { id: "utils", collection_id: "git", parent_id: null, name: "Utils" },
      {
        id: "devops",
        collection_id: "git",
        parent_id: "utils",
        name: "Devops",
      },
    ],
    commands: [
      {
        id: "root",
        name: "Root command",
        body: "echo root",
        collection_id: "git",
        folder_id: null,
        favorite: false,
      },
      {
        id: "clean",
        name: "Clean branches",
        body: "git branch -d",
        collection_id: "git",
        folder_id: "utils",
        favorite: false,
      },
      {
        id: "deploy",
        name: "Deploy staging",
        body: "./deploy.sh staging",
        collection_id: "git",
        folder_id: "devops",
        favorite: false,
      },
    ],
  });
}

afterEach(() => {
  cleanup();
  localStorage.removeItem("command-pad-theme");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  vi.restoreAllMocks();
});

test("favorites are the initial view and stars toggle without opening edit", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue(
    library({
      collections: [{ id: "git", name: "Git" }],
      commands: [
        {
          id: "1",
          name: "Status",
          body: "git status",
          collection_id: "git",
          folder_id: null,
          favorite: false,
        },
      ],
    }),
  );
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
    screen.getByRole("button", { name: /Status.*git status.*Git/ }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Status from favorites" }),
  );
  await screen.findByText("No favorites yet");
});

test("renders nested folders and expands their command cards", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue(nestedLibrary());
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Git, 3 commands" }),
  );
  expect(
    screen.getByRole("button", { name: /Root command.*echo root/ }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /Clean branches.*git branch/ }),
  ).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Utils, 2 commands" }));
  expect(
    screen.getByRole("button", { name: /Clean branches.*git branch/ }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Devops, 1 command" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /Deploy staging.*deploy\.sh/ }),
  ).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Devops, 1 command" }));
  expect(
    screen.getByRole("button", { name: /Deploy staging.*deploy\.sh/ }),
  ).toBeTruthy();
});

test("creates nested folders and commands inside them", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue(
    library({ collections: [{ id: "git", name: "Git" }] }),
  );
  const save = vi.spyOn(storage, "saveData").mockResolvedValue();
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Git, 0 commands" }),
  );

  fireEvent.click(screen.getByRole("button", { name: "New folder" }));
  let dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Folder name"), {
    target: { value: "Utils" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Create folder" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("Empty folder")).toBeTruthy();

  const utilsActions = await screen.findByRole("button", {
    name: "Actions for Utils",
  });
  fireEvent.keyDown(utilsActions, { key: "ArrowDown" });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Add subfolder" }),
  );
  dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Folder name"), {
    target: { value: "Devops" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Create folder" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));

  const devopsActions = await screen.findByRole("button", {
    name: "Actions for Devops",
  });
  fireEvent.keyDown(devopsActions, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Add command" }));
  dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Title"), {
    target: { value: "Deploy" },
  });
  fireEvent.change(within(dialog).getByLabelText("Command"), {
    target: { value: "./deploy.sh" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add command" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(3));

  expect(
    screen.getByRole("button", { name: /Deploy.*\.\/deploy\.sh/ }),
  ).toBeTruthy();
  const saved = save.mock.calls[2][0];
  const devops = saved.folders.find(
    (folder: { name: string }) => folder.name === "Devops",
  );
  expect(saved.commands[0].folder_id).toBe(devops?.id);
});

test("moves a command into a folder from the editor", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue(
    library({
      collections: [{ id: "git", name: "Git" }],
      folders: [
        { id: "utils", collection_id: "git", parent_id: null, name: "Utils" },
      ],
      commands: [
        {
          id: "1",
          name: "Status",
          body: "git status",
          collection_id: "git",
          folder_id: null,
          favorite: false,
        },
      ],
    }),
  );
  const save = vi.spyOn(storage, "saveData").mockResolvedValue();
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Git, 1 command" }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Status.*git status/ }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Folder"), {
    target: { value: "utils" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].commands[0].folder_id).toBe("utils");
  expect(screen.getByRole("button", { name: "Utils, 1 command" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /Status.*git status/ }),
  ).toBeTruthy();
});

test("deletes a folder and its contents after confirmation", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue(nestedLibrary());
  const save = vi.spyOn(storage, "saveData").mockResolvedValue();
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Git, 3 commands" }),
  );
  const actions = await screen.findByRole("button", {
    name: "Actions for Utils",
  });
  fireEvent.keyDown(actions, { key: "ArrowDown" });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Delete folder" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/2 commands and 1 subfolder/)).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Delete folder" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const saved = save.mock.calls[0][0];
  expect(saved.folders).toHaveLength(0);
  expect(saved.commands.map((command: { id: string }) => command.id)).toEqual([
    "root",
  ]);
  expect(screen.queryByRole("button", { name: /Utils/ })).toBeNull();
});

test("creates and moves a command into a collection", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue(
    library({ collections: [{ id: "git", name: "Git" }] }),
  );
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

test("imports a nested collection copy and preserves the existing library", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue(
    library({ collections: [{ id: "git", name: "Git" }] }),
  );
  const save = vi.spyOn(storage, "saveData").mockResolvedValue();
  vi.spyOn(transfer, "readCollectionFile").mockResolvedValue(
    JSON.stringify({
      format: "command-pad-collection",
      version: 2,
      collection: { name: "Git" },
      folders: [
        { id: "old-utils", parent_id: null, name: "Utils" },
        { id: "old-devops", parent_id: "old-utils", name: "Devops" },
      ],
      commands: [
        {
          name: "Deploy",
          body: "./deploy.sh",
          favorite: true,
          folder_id: "old-devops",
        },
      ],
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
  expect(saved.collections[1].name).toBe("Git (copy)");
  expect(saved.folders).toHaveLength(2);
  const oldUtils = saved.folders.find(
    (folder: { name: string }) => folder.name === "Utils",
  );
  const oldDevops = saved.folders.find(
    (folder: { name: string }) => folder.name === "Devops",
  );
  expect(oldDevops?.parent_id).toBe(oldUtils?.id);
  expect(saved.commands[0].folder_id).toBe(oldDevops?.id);
  expect(saved.commands[0].favorite).toBe(true);
  expect(
    await screen.findByRole("heading", { name: "Git (copy)" }),
  ).toBeTruthy();
});

test("does not update favorites if saving fails", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue(
    library({
      commands: [
        {
          id: "1",
          name: "Status",
          body: "git status",
          collection_id: null,
          folder_id: null,
          favorite: false,
        },
      ],
    }),
  );
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

test("export is available only for a named collection and includes folders", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue(nestedLibrary());
  const exportFile = vi
    .spyOn(transfer, "writeCollectionFile")
    .mockResolvedValue();
  render(<App />);
  const git = await screen.findByRole("button", { name: "Git, 3 commands" });
  expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  fireEvent.click(git);
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  await waitFor(() => expect(exportFile).toHaveBeenCalledTimes(1));
  expect(exportFile.mock.calls[0][0]).toBe("Git");
  const exported = JSON.parse(exportFile.mock.calls[0][1]);
  expect(exported.version).toBe(2);
  expect(exported.folders).toHaveLength(2);
  expect(exported.commands).toHaveLength(3);
});

test("a new command created from Favorites is starred", async () => {
  vi.spyOn(storage, "loadData").mockResolvedValue(library());
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
  vi.spyOn(storage, "loadData").mockResolvedValue(library());
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
