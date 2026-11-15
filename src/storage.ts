import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Data } from "./types";

const key = "command-pad-data";

export async function loadData(): Promise<Data> {
  if (isTauri()) return invoke<Data>("load_data");
  const saved = localStorage.getItem(key);
  return saved ? (JSON.parse(saved) as Data) : { categories: [], commands: [] };
}

export async function saveData(data: Data): Promise<void> {
  if (isTauri()) return invoke("save_data", { data });
  localStorage.setItem(key, JSON.stringify(data));
}
