// @vitest-environment jsdom

import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import type { Data } from "./types";
import {
  loadWorkspaceRecords,
  rememberWorkspace,
  removeWorkspaceRecord,
  saveWorkspace,
} from "./workspace-storage";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: () => true,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const invokeMock = vi.mocked(invoke);

function library(overrides: Partial<Data> = {}): Data {
  return { collections: [], folders: [], commands: [], ...overrides };
}

beforeEach(() => {
  invokeMock.mockClear();
  localStorage.clear();
});

test("remembers, lists, and removes workspace records locally", () => {
  expect(loadWorkspaceRecords()).toEqual([]);
  rememberWorkspace({ id: "team", name: "Team", path: "/mnt/team" });
  rememberWorkspace({ id: "local", name: "Local", path: "/tmp/local" });
  expect(loadWorkspaceRecords().map((record) => record.id)).toEqual([
    "team",
    "local",
  ]);
  expect(removeWorkspaceRecord("team").map((record) => record.id)).toEqual([
    "local",
  ]);
});

test("writes only changed files and passes the expected revision", async () => {
  const previous = library({
    collections: [{ id: "git", name: "Git" }],
    commands: [
      {
        id: "status",
        name: "Status",
        body: "git status",
        collection_id: "git",
        folder_id: null,
        favorite: false,
      },
    ],
  });
  const next = library({
    collections: [{ id: "git", name: "Git" }],
    commands: [
      {
        id: "status",
        name: "Status",
        body: "git status --short",
        collection_id: "git",
        folder_id: null,
        favorite: true,
      },
      {
        id: "new",
        name: "Branch",
        body: "git branch",
        collection_id: "git",
        folder_id: null,
        favorite: false,
      },
    ],
  });

  await saveWorkspace("/mnt/team", previous, next, {
    status: {
      path: "collections/Git/Status.cmd.md",
      fingerprint: "abc",
    },
  });

  expect(invokeMock.mock.calls).toEqual([
    [
      "update_workspace_command",
      {
        path: "/mnt/team",
        draft: {
          id: "status",
          name: "Status",
          body: "git status --short",
          favorite: true,
          collectionId: "git",
          folderId: null,
        },
        oldPath: "collections/Git/Status.cmd.md",
        expectedRevision: "abc",
      },
    ],
    [
      "add_workspace_command",
      {
        path: "/mnt/team",
        draft: {
          id: "new",
          name: "Branch",
          body: "git branch",
          favorite: false,
          collectionId: "git",
          folderId: null,
        },
      },
    ],
  ]);
});

test("does not write unchanged data and refuses missing revisions", async () => {
  const data = library({
    collections: [{ id: "git", name: "Git" }],
  });
  await saveWorkspace("/mnt/team", data, data, {});
  expect(invokeMock).not.toHaveBeenCalled();

  const withCommand = library({
    collections: [{ id: "git", name: "Git" }],
    commands: [
      {
        id: "status",
        name: "Status",
        body: "git status",
        collection_id: "git",
        folder_id: null,
        favorite: false,
      },
    ],
  });
  await expect(
    saveWorkspace("/mnt/team", withCommand, data, {}),
  ).rejects.toThrow("revision");
  expect(invokeMock).not.toHaveBeenCalled();
});
