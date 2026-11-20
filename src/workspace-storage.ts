import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { loadData, saveData } from "./storage";
import type { Command, Data, Folder } from "./types";

const WORKSPACES_KEY = "command-pad-workspaces";
export const DEFAULT_WORKSPACE_ID = "default";

export type WorkspaceRecord = { id: string; name: string; path: string };
export type WorkspaceManifest = { id: string; name: string; version: number };
export type CommandRevision = { path: string; fingerprint: string };
export type CommandRevisions = Record<string, CommandRevision>;

type WorkspaceSnapshot = {
  manifest: WorkspaceManifest;
  data: Data;
  path: string;
};

export function loadWorkspaceRecords(): WorkspaceRecord[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(WORKSPACES_KEY) ?? "[]",
    );
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is WorkspaceRecord =>
        !!item &&
        typeof item === "object" &&
        typeof (item as WorkspaceRecord).id === "string" &&
        typeof (item as WorkspaceRecord).name === "string" &&
        typeof (item as WorkspaceRecord).path === "string",
    );
  } catch {
    return [];
  }
}

function saveWorkspaceRecords(records: WorkspaceRecord[]) {
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(records));
}

export function rememberWorkspace(record: WorkspaceRecord): WorkspaceRecord[] {
  const records = loadWorkspaceRecords().filter(
    (item) => item.id !== record.id && item.path !== record.path,
  );
  const next = [...records, record];
  saveWorkspaceRecords(next);
  return next;
}

export function updateWorkspaceRecord(
  record: WorkspaceRecord,
): WorkspaceRecord[] {
  const next = loadWorkspaceRecords().map((item) =>
    item.id === record.id ? record : item,
  );
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(next));
  return next;
}

export function removeWorkspaceRecord(id: string): WorkspaceRecord[] {
  const next = loadWorkspaceRecords().filter((item) => item.id !== id);
  saveWorkspaceRecords(next);
  return next;
}

export async function chooseWorkspaceDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  const path = await open({
    directory: true,
    multiple: false,
    title: "Choose workspace directory",
  });
  return typeof path === "string" ? path : null;
}

export async function ensureDefaultWorkspace(): Promise<WorkspaceRecord> {
  if (!isTauri()) {
    return { id: DEFAULT_WORKSPACE_ID, name: "Default", path: "browser" };
  }
  return invoke<WorkspaceRecord>("ensure_default_workspace");
}

export async function createLocalWorkspace(
  name: string,
): Promise<WorkspaceRecord> {
  const id = crypto.randomUUID();
  const snapshot = await invoke<WorkspaceSnapshot>("create_local_workspace", {
    id,
    name,
  });
  return {
    id: snapshot.manifest.id,
    name: snapshot.manifest.name,
    path: snapshot.path,
  };
}

export async function createWorkspace(
  path: string,
  name: string,
): Promise<WorkspaceRecord> {
  const id = crypto.randomUUID();
  const snapshot = await invoke<WorkspaceSnapshot>("create_workspace_files", {
    path,
    id,
    name,
  });
  return {
    id: snapshot.manifest.id,
    name: snapshot.manifest.name,
    path: snapshot.path,
  };
}

export async function openWorkspace(
  path: string,
): Promise<{ record: WorkspaceRecord; data: Data }> {
  const snapshot = await invoke<WorkspaceSnapshot>("open_workspace_files", {
    path,
  });
  return {
    record: {
      id: snapshot.manifest.id,
      name: snapshot.manifest.name,
      path: snapshot.path,
    },
    data: snapshot.data,
  };
}

export async function renameWorkspace(
  path: string,
  name: string,
): Promise<void> {
  await invoke("rename_workspace_files", { path, name });
}

export async function readWorkspace(path: string): Promise<Data> {
  if (!isTauri()) return loadData();
  return invoke<Data>("load_workspace", { path });
}

export async function workspaceRevisions(
  path: string,
): Promise<CommandRevisions> {
  if (!isTauri()) return {};
  return invoke<CommandRevisions>("workspace_revisions", { path });
}

export async function saveWorkspace(
  path: string,
  previous: Data,
  next: Data,
  revisions: CommandRevisions,
): Promise<void> {
  if (!isTauri()) return saveData(next);
  const previousCollections = new Map(
    previous.collections.map((item) => [item.id, item]),
  );
  const nextCollections = new Map(
    next.collections.map((item) => [item.id, item]),
  );
  const previousFolders = new Map(
    previous.folders.map((item) => [item.id, item]),
  );
  const nextFolders = new Map(next.folders.map((item) => [item.id, item]));
  const previousCommands = new Map(
    previous.commands.map((item) => [item.id, item]),
  );
  const nextCommands = new Map(next.commands.map((item) => [item.id, item]));

  // New destinations must exist before commands can be moved into them.
  for (const collection of next.collections) {
    if (!previousCollections.has(collection.id)) {
      await invoke("add_workspace_collection", {
        path,
        id: collection.id,
        name: collection.name,
      });
    }
  }
  const foldersByDepth = [...next.folders].sort(
    (a, b) => folderDepth(a, nextFolders) - folderDepth(b, nextFolders),
  );
  for (const folder of foldersByDepth) {
    if (previousFolders.has(folder.id)) continue;
    if (!nextCollections.has(folder.collection_id)) continue;
    await invoke("add_workspace_folder", {
      path,
      id: folder.id,
      collectionId: folder.collection_id,
      parentId: folder.parent_id,
      name: folder.name,
    });
  }
  for (const command of next.commands) {
    const before = previousCommands.get(command.id);
    if (!before) {
      await invoke("add_workspace_command", {
        path,
        draft: commandDraft(command),
      });
    } else if (
      before.name !== command.name ||
      before.body !== command.body ||
      before.favorite !== command.favorite ||
      before.collection_id !== command.collection_id ||
      before.folder_id !== command.folder_id
    ) {
      const revision = revisions[command.id];
      if (!revision)
        throw new Error(`No file revision found for “${command.name}”`);
      await invoke("update_workspace_command", {
        path,
        draft: commandDraft(command),
        oldPath: revision.path,
        expectedRevision: revision.fingerprint,
      });
    }
  }
  for (const command of previous.commands) {
    if (nextCommands.has(command.id)) continue;
    const revision = revisions[command.id];
    if (!revision)
      throw new Error(`No file revision found for “${command.name}”`);
    await invoke("delete_workspace_command", {
      path,
      oldPath: revision.path,
      expectedRevision: revision.fingerprint,
    });
  }
  // Rename/move folders only after command paths have been resolved.
  for (const folder of next.folders) {
    const before = previousFolders.get(folder.id);
    if (
      !before ||
      (before.name === folder.name &&
        before.parent_id === folder.parent_id &&
        before.collection_id === folder.collection_id)
    )
      continue;
    await invoke("update_workspace_folder", {
      path,
      id: folder.id,
      collectionId: folder.collection_id,
      parentId: folder.parent_id,
      name: folder.name,
      moveParentId: folder.parent_id,
    });
  }
  // Deleting a top-most removed folder removes its descendants too.
  const removedFolders = previous.folders.filter(
    (folder) => !nextFolders.has(folder.id),
  );
  const removedFolderIds = new Set(removedFolders.map((folder) => folder.id));
  for (const folder of removedFolders) {
    if (folder.parent_id && removedFolderIds.has(folder.parent_id)) continue;
    await invoke("delete_workspace_folder", {
      path,
      collectionId: folder.collection_id,
      id: folder.id,
    });
  }
  for (const collection of previous.collections) {
    if (nextCollections.has(collection.id)) continue;
    await invoke("delete_workspace_collection", { path, id: collection.id });
  }
  // Collection renames happen last so earlier operations used stable paths.
  for (const collection of next.collections) {
    const before = previousCollections.get(collection.id);
    if (before && before.name !== collection.name) {
      await invoke("rename_workspace_collection", {
        path,
        id: collection.id,
        name: collection.name,
      });
    }
  }
}

function folderDepth(
  folder: Folder,
  folders: Map<string, Folder>,
  seen = new Set<string>(),
): number {
  if (seen.has(folder.id)) return 0;
  seen.add(folder.id);
  const parent = folder.parent_id ? folders.get(folder.parent_id) : undefined;
  return parent ? 1 + folderDepth(parent, folders, seen) : 0;
}

function commandDraft(command: Command) {
  return {
    id: command.id,
    name: command.name,
    body: command.body,
    favorite: command.favorite,
    collectionId: command.collection_id,
    folderId: command.folder_id,
  };
}
