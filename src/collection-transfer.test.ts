import { expect, test } from "vitest";
import { exportCollection, importCollection } from "./collection-transfer";
import { migrateData } from "./storage";
import type { Data } from "./types";

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
    commands: [
      {
        id: "2",
        name: "Status",
        body: "git status",
        collection_id: "1",
        favorite: false,
      },
    ],
  });
});

test("exports one collection and imports a separate copy with favorites", () => {
  const data: Data = {
    collections: [
      { id: "1", name: "Git" },
      { id: "2", name: "Other" },
    ],
    commands: [
      {
        id: "a",
        name: "Status",
        body: "git status",
        collection_id: "1",
        favorite: true,
      },
      {
        id: "b",
        name: "Other",
        body: "echo hi",
        collection_id: "2",
        favorite: false,
      },
    ],
  };
  const json = exportCollection(data.collections[0], data.commands);
  const result = importCollection(json, data);
  expect(result.data.collections).toHaveLength(3);
  expect(result.data.commands).toHaveLength(3);
  expect(result.id).not.toBe("1");
  expect(result.data.collections[2].name).toBe("Git (copy)");
  expect(result.data.commands[2]).toMatchObject({
    name: "Status",
    favorite: true,
    collection_id: result.id,
  });
  expect(result.data.commands[2].id).not.toBe("a");
  expect(data.collections).toHaveLength(2);
});

test("rejects unsupported or invalid files", () => {
  const data: Data = { collections: [], commands: [] };
  expect(() =>
    importCollection('{"format":"command-pad-collection","version":2}', data),
  ).toThrow();
  expect(() =>
    importCollection(
      '{"format":"command-pad-collection","version":1,"collection":{"name":"Git"},"commands":[{"name":"","body":"echo"}]}',
      data,
    ),
  ).toThrow();
  expect(data.collections).toHaveLength(0);
});
