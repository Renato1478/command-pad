import { descendantFolderIds } from "./folders";
import type { Data, Folder } from "./types";

export function addFolder(data: Data, folder: Folder): Data {
  return { ...data, folders: [...data.folders, folder] };
}

export function updateFolder(
  data: Data,
  folderId: string,
  name: string,
  parentId: string | null,
): Data {
  const folder = data.folders.find((item) => item.id === folderId);
  if (!folder) throw new Error("Folder not found");

  if (parentId !== null) {
    const parent = data.folders.find((item) => item.id === parentId);
    if (!parent || parent.collection_id !== folder.collection_id) {
      throw new Error("Invalid parent folder");
    }
    if (parentId === folderId) {
      throw new Error("A folder cannot be moved inside itself");
    }
    if (descendantFolderIds(data.folders, folderId).has(parentId)) {
      throw new Error("A folder cannot be moved inside one of its subfolders");
    }
  }

  return {
    ...data,
    folders: data.folders.map((item) =>
      item.id === folderId
        ? { ...item, name: name.trim(), parent_id: parentId }
        : item,
    ),
  };
}

export function deleteFolderCascade(
  data: Data,
  folderId: string,
): { data: Data; removedFolderIds: string[] } {
  const removed = [folderId, ...descendantFolderIds(data.folders, folderId)];
  const removedIds = new Set(removed);
  return {
    removedFolderIds: removed,
    data: {
      ...data,
      folders: data.folders.filter((folder) => !removedIds.has(folder.id)),
      commands: data.commands.filter(
        (command) =>
          command.folder_id === null || !removedIds.has(command.folder_id),
      ),
    },
  };
}
