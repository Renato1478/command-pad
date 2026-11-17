import { expect, test } from "vitest";
import type { Data } from "../../types";
import { addFolder, deleteFolderCascade, updateFolder } from "./mutations";

function data(): Data {
  return {
    collections: [
      { id: "git", name: "Git" },
      { id: "other", name: "Other" },
    ],
    folders: [
      { id: "utils", collection_id: "git", parent_id: null, name: "Utils" },
      {
        id: "devops",
        collection_id: "git",
        parent_id: "utils",
        name: "Devops",
      },
      { id: "other", collection_id: "other", parent_id: null, name: "Other" },
    ],
    commands: [
      {
        id: "root",
        name: "Root",
        body: "echo root",
        collection_id: "git",
        folder_id: null,
        favorite: false,
      },
      {
        id: "clean",
        name: "Clean",
        body: "git clean",
        collection_id: "git",
        folder_id: "utils",
        favorite: false,
      },
      {
        id: "deploy",
        name: "Deploy",
        body: "./deploy.sh",
        collection_id: "git",
        folder_id: "devops",
        favorite: false,
      },
    ],
  };
}

test("adds a folder", () => {
  const result = addFolder(data(), {
    id: "new",
    collection_id: "git",
    parent_id: null,
    name: "Docs",
  });
  expect(result.folders).toHaveLength(4);
});

test("renames and moves a folder", () => {
  const result = updateFolder(data(), "devops", "Deployments", null);
  const folder = result.folders.find((item) => item.id === "devops");
  expect(folder?.name).toBe("Deployments");
  expect(folder?.parent_id).toBeNull();
});

test("rejects invalid folder moves", () => {
  expect(() => updateFolder(data(), "utils", "Utils", "utils")).toThrow(
    "inside itself",
  );
  expect(() => updateFolder(data(), "utils", "Utils", "devops")).toThrow(
    "subfolders",
  );
  expect(() => updateFolder(data(), "utils", "Utils", "other")).toThrow(
    "Invalid parent",
  );
});

test("deletes a folder subtree and its commands only", () => {
  const result = deleteFolderCascade(data(), "utils");
  expect(result.removedFolderIds).toEqual(["utils", "devops"]);
  expect(result.data.folders.map((folder) => folder.id)).toEqual(["other"]);
  expect(result.data.commands.map((command) => command.id)).toEqual(["root"]);
});
