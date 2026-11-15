import { isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Collection, Command, Data } from "./types";

type CollectionFile = {
  format: "command-pad-collection";
  version: 1;
  collection: { name: string };
  commands: { name: string; body: string; favorite: boolean }[];
};

export function exportCollection(
  collection: Collection,
  commands: Command[],
): string {
  const file: CollectionFile = {
    format: "command-pad-collection",
    version: 1,
    collection: { name: collection.name },
    commands: commands
      .filter((command) => command.collection_id === collection.id)
      .map(({ name, body, favorite }) => ({ name, body, favorite })),
  };
  return JSON.stringify(file, null, 2);
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
    file.version !== 1 ||
    !file.collection ||
    typeof file.collection !== "object" ||
    !Array.isArray(file.commands)
  )
    throw new Error("Unsupported or invalid collection file");
  const name = (file.collection as Record<string, unknown>).name;
  if (typeof name !== "string" || !name.trim())
    throw new Error("Invalid collection name");
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
  const commands = file.commands.map((item: unknown) => {
    if (!item || typeof item !== "object")
      throw new Error("Invalid command in collection");
    const command = item as Record<string, unknown>;
    if (
      typeof command.name !== "string" ||
      !command.name.trim() ||
      typeof command.body !== "string" ||
      !command.body.trim() ||
      (command.favorite !== undefined && typeof command.favorite !== "boolean")
    )
      throw new Error("Invalid command in collection");
    return {
      id: crypto.randomUUID(),
      name: command.name,
      body: command.body,
      favorite: command.favorite === true,
      collection_id: id,
    };
  });
  return {
    id,
    data: {
      collections: [...data.collections, { id, name: importedName }],
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
