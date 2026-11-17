import { expect, test } from "vitest";
import { migrateData } from "../../storage";
import type { Data } from "../../types";
import { exportCollection, importCollection } from "./collection-transfer";

function library(overrides: Partial<Data> = {}): Data {
  return { collections: [], folders: [], commands: [], ...overrides };
}

test("migrates old categories and commands without losing data", () => {
  expect(
    migrateData({
      categories: [{ id: "1", name: "Git" }],
      commands: [
        { id: "2", name: "Status", body: "git status", category_id: "1" },
      ],
    }),
  ).toEqual({
    collections: [{ id: "1", name: "Git" }],
    folders: [],
    commands: [
      {
        id: "2",
        name: "Status",
        body: "git status",
        collection_id: "1",
        folder_id: null,
        favorite: false,
      },
    ],
  });
});

test("normalizes invalid folder references and breaks cycles", () => {
  const data = migrateData({
    collections: [{ id: "git", name: "Git" }],
    folders: [
      { id: "a", collection_id: "git", parent_id: "b", name: "A" },
      { id: "b", collection_id: "git", parent_id: "a", name: "B" },
      { id: "c", collection_id: "git", parent_id: "missing", name: "C" },
      { id: "orphan", collection_id: "other", parent_id: null, name: "Orphan" },
    ],
    commands: [
      {
        id: "1",
        name: "Status",
        body: "git status",
        collection_id: "git",
        folder_id: "missing",
        favorite: false,
      },
    ],
  });
  expect(data.folders).toHaveLength(3);
  expect(
    data.folders.find((folder) => folder.name === "C")?.parent_id,
  ).toBeNull();
  expect(data.commands[0].folder_id).toBeNull();
  expect(
    data.folders.find((folder) => folder.name === "A")?.parent_id,
  ).toBeNull();
});

function nestedData(): Data {
  return library({
    collections: [
      { id: "1", name: "Git" },
      { id: "2", name: "Other" },
    ],
    folders: [
      { id: "u", collection_id: "1", parent_id: null, name: "Utils" },
      { id: "d", collection_id: "1", parent_id: "u", name: "Devops" },
    ],
    commands: [
      {
        id: "a",
        name: "Status",
        body: "git status",
        collection_id: "1",
        folder_id: null,
        favorite: true,
      },
      {
        id: "b",
        name: "Deploy",
        body: "./deploy.sh",
        collection_id: "1",
        folder_id: "d",
        favorite: true,
      },
      {
        id: "c",
        name: "Other",
        body: "echo hi",
        collection_id: "2",
        folder_id: null,
        favorite: false,
      },
    ],
  });
}

test("exports a nested collection and imports a separate copy", () => {
  const data = nestedData();
  const json = exportCollection(
    data.collections[0],
    data.folders,
    data.commands,
  );
  const exported = JSON.parse(json);
  expect(exported.version).toBe(2);
  expect(exported.folders).toHaveLength(2);
  expect(exported.commands).toHaveLength(2);

  const result = importCollection(json, data);
  expect(result.data.collections).toHaveLength(3);
  expect(result.data.folders).toHaveLength(4);
  expect(result.data.commands).toHaveLength(5);
  expect(result.data.collections[2].name).toBe("Git (copy)");

  const utils = result.data.folders.find(
    (folder) => folder.name === "Utils" && folder.collection_id === result.id,
  );
  const devops = result.data.folders.find(
    (folder) => folder.name === "Devops" && folder.collection_id === result.id,
  );
  expect(utils?.id).not.toBe("u");
  expect(devops?.id).not.toBe("d");
  expect(devops?.parent_id).toBe(utils?.id);

  const deploy = result.data.commands.find(
    (command) =>
      command.name === "Deploy" && command.collection_id === result.id,
  );
  expect(deploy?.folder_id).toBe(devops?.id);
  expect(deploy?.favorite).toBe(true);
  expect(deploy?.id).not.toBe("b");
  expect(data.collections).toHaveLength(2);
});

test("imports version 1 files without folders", () => {
  const json = JSON.stringify({
    format: "command-pad-collection",
    version: 1,
    collection: { name: "Git" },
    commands: [{ name: "Status", body: "git status", favorite: true }],
  });
  const result = importCollection(json, library());
  expect(result.data.folders).toHaveLength(0);
  expect(result.data.commands[0]).toMatchObject({
    name: "Status",
    folder_id: null,
    favorite: true,
  });
});

test("rejects unsupported or invalid files", () => {
  const data = library();
  const base = {
    format: "command-pad-collection",
    version: 2,
    collection: { name: "Git" },
    folders: [],
    commands: [],
  };
  expect(() =>
    importCollection(JSON.stringify({ ...base, version: 3 }), data),
  ).toThrow();
  expect(() =>
    importCollection(
      JSON.stringify({
        ...base,
        folders: [{ id: "a", parent_id: null, name: "" }],
      }),
      data,
    ),
  ).toThrow();
  expect(() =>
    importCollection(
      JSON.stringify({
        ...base,
        folders: [
          { id: "a", parent_id: null, name: "A" },
          { id: "a", parent_id: null, name: "B" },
        ],
      }),
      data,
    ),
  ).toThrow();
  expect(() =>
    importCollection(
      JSON.stringify({
        ...base,
        folders: [{ id: "a", parent_id: "missing", name: "A" }],
      }),
      data,
    ),
  ).toThrow();
  expect(() =>
    importCollection(
      JSON.stringify({
        ...base,
        folders: [
          { id: "a", parent_id: "b", name: "A" },
          { id: "b", parent_id: "a", name: "B" },
        ],
      }),
      data,
    ),
  ).toThrow();
  expect(() =>
    importCollection(
      JSON.stringify({
        ...base,
        commands: [
          {
            name: "Status",
            body: "git status",
            favorite: false,
            folder_id: "missing",
          },
        ],
      }),
      data,
    ),
  ).toThrow();
  expect(data.collections).toHaveLength(0);
});
