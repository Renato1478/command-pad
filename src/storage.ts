import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Data } from "./types";

const key = "command-pad-data";

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
  const commands = raw.commands.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid command");
    const command = item as Record<string, unknown>;
    const collectionId =
      command.collection_id !== undefined
        ? command.collection_id
        : command.category_id;
    if (
      typeof command.id !== "string" ||
      typeof command.name !== "string" ||
      typeof command.body !== "string" ||
      (collectionId !== null && typeof collectionId !== "string") ||
      (command.favorite !== undefined && typeof command.favorite !== "boolean")
    )
      throw new Error("Invalid command");
    return {
      id: command.id,
      name: command.name,
      body: command.body,
      collection_id: collectionId as string | null,
      favorite: command.favorite === true,
    };
  });
  return { collections, commands } as Data;
}

export async function loadData(): Promise<Data> {
  if (isTauri()) return migrateData(await invoke("load_data"));
  const saved = localStorage.getItem(key);
  return saved
    ? migrateData(JSON.parse(saved))
    : { collections: [], commands: [] };
}

export async function saveData(data: Data): Promise<void> {
  if (isTauri()) return invoke("save_data", { data });
  localStorage.setItem(key, JSON.stringify(data));
}
