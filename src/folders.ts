import type { Command, Data, Folder } from "./types";

export type FolderOption = { id: string | null; label: string };

export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function foldersIn(
  folders: Folder[],
  collectionId: string,
  parentId: string | null,
): Folder[] {
  return sortByName(
    folders.filter(
      (folder) =>
        folder.collection_id === collectionId && folder.parent_id === parentId,
    ),
  );
}

export function commandsIn(
  commands: Command[],
  collectionId: string,
  folderId: string | null,
): Command[] {
  return sortByName(
    commands.filter(
      (command) =>
        command.collection_id === collectionId &&
        command.folder_id === folderId,
    ),
  );
}

export function descendantFolderIds(
  folders: Folder[],
  folderId: string,
): Set<string> {
  const descendants = new Set<string>();
  const visited = new Set([folderId]);
  const pending = [folderId];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    for (const folder of folders) {
      if (folder.parent_id === current && !visited.has(folder.id)) {
        visited.add(folder.id);
        descendants.add(folder.id);
        pending.push(folder.id);
      }
    }
  }
  return descendants;
}

export function folderPath(folders: Folder[], folderId: string): Folder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: Folder[] = [];
  const visited = new Set<string>();
  let current = byId.get(folderId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return path;
}

export function folderOptions(
  folders: Folder[],
  collectionId: string,
  excludeFolderId?: string,
): FolderOption[] {
  const excluded = excludeFolderId
    ? new Set([
        excludeFolderId,
        ...descendantFolderIds(folders, excludeFolderId),
      ])
    : new Set<string>();
  const options: FolderOption[] = [{ id: null, label: "Collection root" }];
  const visited = new Set<string>();

  function walk(parentId: string | null, prefix: string[]) {
    for (const folder of foldersIn(folders, collectionId, parentId)) {
      if (visited.has(folder.id) || excluded.has(folder.id)) continue;
      visited.add(folder.id);
      const path = [...prefix, folder.name];
      options.push({ id: folder.id, label: path.join(" / ") });
      walk(folder.id, path);
    }
  }

  walk(null, []);
  return options;
}

export function recursiveCommandCount(
  commands: Command[],
  folders: Folder[],
  folderId: string,
): number {
  const ids = descendantFolderIds(folders, folderId);
  return commands.filter(
    (command) =>
      command.folder_id === folderId ||
      (command.folder_id !== null && ids.has(command.folder_id)),
  ).length;
}

export function folderDeletionSummary(
  data: Data,
  folderId: string,
): { commands: number; folders: number } {
  const ids = descendantFolderIds(data.folders, folderId);
  return {
    folders: ids.size,
    commands: data.commands.filter(
      (command) =>
        command.folder_id === folderId ||
        (command.folder_id !== null && ids.has(command.folder_id)),
    ).length,
  };
}

export function commandLocation(data: Data, command: Command): string {
  const collection = data.collections.find(
    (item) => item.id === command.collection_id,
  );
  if (!collection) return "No collection";
  const path = command.folder_id
    ? folderPath(data.folders, command.folder_id).map((folder) => folder.name)
    : [];
  return [collection.name, ...path].join(" / ");
}
