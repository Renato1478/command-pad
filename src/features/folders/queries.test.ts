import { expect, test } from "vitest";
import type { Data, Folder } from "../../types";
import {
  commandLocation,
  commandsIn,
  descendantFolderIds,
  folderDeletionSummary,
  folderOptions,
  folderPath,
  foldersIn,
  recursiveCommandCount,
} from "./queries";

const folders: Folder[] = [
  { id: "utils", collection_id: "git", parent_id: null, name: "Utils" },
  { id: "devops", collection_id: "git", parent_id: "utils", name: "Devops" },
  { id: "docs", collection_id: "git", parent_id: null, name: "Docs" },
  { id: "other", collection_id: "other", parent_id: null, name: "Other" },
];

const data: Data = {
  collections: [
    { id: "git", name: "Git" },
    { id: "other", name: "Other" },
  ],
  folders,
  commands: [
    {
      id: "1",
      name: "Status",
      body: "git status",
      collection_id: "git",
      folder_id: null,
      favorite: false,
    },
    {
      id: "2",
      name: "Clean",
      body: "git clean",
      collection_id: "git",
      folder_id: "utils",
      favorite: false,
    },
    {
      id: "3",
      name: "Deploy",
      body: "./deploy.sh",
      collection_id: "git",
      folder_id: "devops",
      favorite: true,
    },
  ],
};

test("lists folders and commands alphabetically", () => {
  expect(foldersIn(folders, "git", null).map((folder) => folder.name)).toEqual([
    "Docs",
    "Utils",
  ]);
  expect(
    commandsIn(data.commands, "git", "utils").map((command) => command.name),
  ).toEqual(["Clean"]);
});

test("builds folder paths and descendant sets", () => {
  expect(folderPath(folders, "devops").map((folder) => folder.name)).toEqual([
    "Utils",
    "Devops",
  ]);
  expect([...descendantFolderIds(folders, "utils")]).toEqual(["devops"]);
});

test("excludes a folder and its descendants from move options", () => {
  expect(folderOptions(folders, "git").map((option) => option.label)).toEqual([
    "Collection root",
    "Docs",
    "Utils",
    "Utils / Devops",
  ]);
  expect(
    folderOptions(folders, "git", "utils").map((option) => option.label),
  ).toEqual(["Collection root", "Docs"]);
});

test("counts commands recursively and summarizes deletion", () => {
  expect(recursiveCommandCount(data.commands, data.folders, "utils")).toBe(2);
  expect(folderDeletionSummary(data, "utils")).toEqual({
    commands: 2,
    folders: 1,
  });
  expect(commandLocation(data, data.commands[2])).toBe("Git / Utils / Devops");
});

test("is safe when corrupt data contains cycles", () => {
  const cyclic: Folder[] = [
    { id: "a", collection_id: "git", parent_id: "b", name: "A" },
    { id: "b", collection_id: "git", parent_id: "a", name: "B" },
  ];
  expect(() => descendantFolderIds(cyclic, "a")).not.toThrow();
  expect(folderPath(cyclic, "a").length).toBeLessThanOrEqual(2);
  expect(() => folderOptions(cyclic, "git")).not.toThrow();
});
