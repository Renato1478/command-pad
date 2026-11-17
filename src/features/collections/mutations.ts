import type { Data } from "../../types";

export function deleteCollectionCascade(
  data: Data,
  collectionId: string,
): Data {
  return {
    ...data,
    collections: data.collections.filter(
      (collection) => collection.id !== collectionId,
    ),
    folders: data.folders.filter(
      (folder) => folder.collection_id !== collectionId,
    ),
    commands: data.commands.filter(
      (command) => command.collection_id !== collectionId,
    ),
  };
}
