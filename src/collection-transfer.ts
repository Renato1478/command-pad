import { isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Collection, Command, Data, Folder } from "./types";

type FolderEntry = { id: string; parent_id: string | null; name: string };
type CommandEntry = {
  name: string;
  body: string;
  favorite: boolean;
  folder_id: string | null;
};
type CollectionFile = {
  format: "command-pad-collection";
  version: 1 | 2;
  collection: { name: string };
  folders?: FolderEntry[];
  commands: CommandEntry[];
};

export function exportCollection(
  collection: Collection,
  folders: Folder[],
  commands: Command[],
): string {
  const file: CollectionFile = {
    format: "command-pad-collection",
    version: 2,
    collection: { name: collection.name },
    folders: folders
      .filter((folder) => folder.collection_id === collection.id)
      .map(({ id, parent_id, name }) => ({ id, parent_id, name })),
    commands: commands
      .filter((command) => command.collection_id === collection.id)
      .map(({ name, body, favorite, folder_id }) => ({
        name,
        body,
        favorite,
        folder_id,
      })),
  };
  return JSON.stringify(file, null, 2);
}

function parseFolders(value: unknown): FolderEntry[] {
  if (!Array.isArray(value)) throw new Error("Invalid folders in collection");
  const folders: FolderEntry[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object")
      throw new Error("Invalid folder in collection");
    const folder = item as Record<string, unknown>;
    if (
      typeof folder.id !== "string" ||
      typeof folder.name !== "string" ||
      !folder.name.trim() ||
      (folder.parent_id !== null &&
        folder.parent_id !== undefined &&
        typeof folder.parent_id !== "string")
    ) {
      throw new Error("Invalid folder in collection");
    }
    if (ids.has(folder.id)) throw new Error("Duplicate folder in collection");
    ids.add(folder.id);
    folders.push({
      id: folder.id,
      name: folder.name,
      parent_id: (folder.parent_id as string | null | undefined) ?? null,
    });
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  for (const folder of folders) {
    if (folder.parent_id && !byId.has(folder.parent_id)) {
      throw new Error("Invalid folder hierarchy");
    }
  }
  for (const folder of folders) {
    const visited = new Set<string>();
    let current: FolderEntry | undefined = folder;
    while (current) {
      if (visited.has(current.id)) throw new Error("Invalid folder hierarchy");
      visited.add(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
  }
  return folders;
}

function parseCommands(
  value: unknown,
  folderIds: Set<string>,
  allowFolders: boolean,
): CommandEntry[] {
  if (!Array.isArray(value)) throw new Error("Invalid commands in collection");
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object")
      throw new Error("Invalid command in collection");
    const command = item as Record<string, unknown>;
    if (
      typeof command.name !== "string" ||
      !command.name.trim() ||
      typeof command.body !== "string" ||
      !command.body.trim() ||
      (command.favorite !== undefined &&
        typeof command.favorite !== "boolean") ||
      (command.folder_id !== null &&
        command.folder_id !== undefined &&
        typeof command.folder_id !== "string")
    ) {
      throw new Error("Invalid command in collection");
    }
    const folderId = allowFolders
      ? ((command.folder_id as string | null | undefined) ?? null)
      : null;
    if (folderId !== null && !folderIds.has(folderId)) {
      throw new Error("Command references an unknown folder");
    }
    return {
      name: command.name,
      body: command.body,
      favorite: command.favorite === true,
      folder_id: folderId,
    };
  });
}

export function importCollection(
  json: string,
  data: Data,
): { data: Data; id: string } {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== "object")
    throw new Error("Invalid collection file");
  const file = value as Record<string, unknown>;
  if (
    file.format !== "command-pad-collection" ||
    (file.version !== 1 && file.version !== 2) ||
    !file.collection ||
    typeof file.collection !== "object"
  ) {
    throw new Error("Unsupported or invalid collection file");
  }
  const name = (file.collection as Record<string, unknown>).name;
  if (typeof name !== "string" || !name.trim())
    throw new Error("Invalid collection name");

  const version = file.version;
  const folderEntries = version === 2 ? parseFolders(file.folders ?? []) : [];
  const folderIds = new Set(folderEntries.map((folder) => folder.id));
  const commandEntries = parseCommands(file.commands, folderIds, version === 2);

  const existing = new Set(
    data.collections.map((collection) => collection.name.toLocaleLowerCase()),
  );
  const baseName = name.trim();
  let importedName = baseName;
  let copyNumber = 1;
  while (existing.has(importedName.toLocaleLowerCase())) {
    importedName = `${baseName} (copy${copyNumber === 1 ? "" : ` ${copyNumber}`})`;
    copyNumber += 1;
  }

  const id = crypto.randomUUID();
  const folderIdMap = new Map(
    folderEntries.map((folder) => [folder.id, crypto.randomUUID()]),
  );
  const folders: Folder[] = folderEntries.map((folder) => ({
    id: folderIdMap.get(folder.id) as string,
    collection_id: id,
    parent_id: folder.parent_id
      ? (folderIdMap.get(folder.parent_id) as string)
      : null,
    name: folder.name,
  }));
  const commands: Command[] = commandEntries.map((command) => ({
    id: crypto.randomUUID(),
    name: command.name,
    body: command.body,
    collection_id: id,
    folder_id: command.folder_id
      ? (folderIdMap.get(command.folder_id) as string)
      : null,
    favorite: command.favorite,
  }));

  return {
    id,
    data: {
      collections: [...data.collections, { id, name: importedName }],
      folders: [...data.folders, ...folders],
      commands: [...data.commands, ...commands],
    },
  };
}

export async function readCollectionFile(): Promise<string | null> {
  if (!isTauri()) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    return new Promise((resolve, reject) => {
      input.onchange = async () => {
        try {
          resolve(input.files?.[0] ? await input.files[0].text() : null);
        } catch (error) {
          reject(error);
        }
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }
  const path = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  return path ? readTextFile(path) : null;
}

export async function writeCollectionFile(
  name: string,
  json: string,
): Promise<void> {
  const filename = `${name.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "collection"}.json`;
  if (isTauri()) {
    const path = await save({
      defaultPath: filename,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (path) await writeTextFile(path, json);
    return;
  }
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
