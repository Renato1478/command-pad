import type { Collection, Data, Folder } from "./types";

const key = "command-pad-data";

function migrateFolders(value: unknown, collections: Collection[]): Folder[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Invalid folders");

  const collectionIds = new Set(collections.map((collection) => collection.id));
  const seen = new Set<string>();
  const folders: Folder[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") throw new Error("Invalid folder");
    const raw = item as Record<string, unknown>;
    if (
      typeof raw.id !== "string" ||
      typeof raw.name !== "string" ||
      typeof raw.collection_id !== "string" ||
      (raw.parent_id !== null &&
        raw.parent_id !== undefined &&
        typeof raw.parent_id !== "string")
    ) {
      throw new Error("Invalid folder");
    }
    if (!collectionIds.has(raw.collection_id) || seen.has(raw.id)) continue;
    seen.add(raw.id);
    folders.push({
      id: raw.id,
      name: raw.name,
      collection_id: raw.collection_id,
      parent_id: (raw.parent_id as string | null | undefined) ?? null,
    });
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]));

  // Drop references to missing or cross-collection parents.
  for (const folder of folders) {
    if (!folder.parent_id) continue;
    const parent = byId.get(folder.parent_id);
    if (!parent || parent.collection_id !== folder.collection_id) {
      folder.parent_id = null;
    }
  }

  // Break cycles caused by corrupt files.
  for (const folder of folders) {
    const visited = new Set<string>();
    let current: Folder | undefined = folder;
    while (current) {
      if (visited.has(current.id)) {
        folder.parent_id = null;
        break;
      }
      visited.add(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
  }

  return folders;
}

export function migrateData(value: unknown): Data {
  if (!value || typeof value !== "object") throw new Error("Invalid library");
  const raw = value as Record<string, unknown>;
  const collections = raw.collections ?? raw.categories;
  if (!Array.isArray(collections) || !Array.isArray(raw.commands))
    throw new Error("Invalid library");

  const validCollection = (item: unknown) =>
    item &&
    typeof item === "object" &&
    typeof (item as Record<string, unknown>).id === "string" &&
    typeof (item as Record<string, unknown>).name === "string";
  if (!collections.every(validCollection))
    throw new Error("Invalid collections");

  const folders = migrateFolders(raw.folders, collections as Collection[]);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  const commands = raw.commands.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid command");
    const command = item as Record<string, unknown>;
    const collectionId =
      command.collection_id !== undefined
        ? command.collection_id
        : command.category_id;
    const rawFolderId = command.folder_id;
    if (
      typeof command.id !== "string" ||
      typeof command.name !== "string" ||
      typeof command.body !== "string" ||
      (collectionId !== null && typeof collectionId !== "string") ||
      (rawFolderId !== null &&
        rawFolderId !== undefined &&
        typeof rawFolderId !== "string") ||
      (command.favorite !== undefined && typeof command.favorite !== "boolean")
    )
      throw new Error("Invalid command");

    let folderId = (rawFolderId as string | null | undefined) ?? null;
    if (
      folderId !== null &&
      (!folderById.has(folderId) ||
        folderById.get(folderId)?.collection_id !== collectionId)
    ) {
      folderId = null;
    }
    if (collectionId === null) folderId = null;

    return {
      id: command.id,
      name: command.name,
      body: command.body,
      collection_id: collectionId as string | null,
      folder_id: folderId,
      favorite: command.favorite === true,
    };
  });

  return { collections, folders, commands } as Data;
}

export async function loadData(): Promise<Data> {
  const saved = localStorage.getItem(key);
  return saved
    ? migrateData(JSON.parse(saved))
    : { collections: [], folders: [], commands: [] };
}

export async function saveData(data: Data): Promise<void> {
  localStorage.setItem(key, JSON.stringify(data));
}
