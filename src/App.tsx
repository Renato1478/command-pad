import { ChevronRight, Download, Plus, Star, Terminal } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  exportCollection,
  importCollection,
  readCollectionFile,
  writeCollectionFile,
} from "./collection-transfer";
import { CollectionDialog } from "./components/CollectionDialog";
import type { Editor } from "./components/CommandDialog";
import { CommandDialog } from "./components/CommandDialog";
import type { Selection } from "./components/Sidebar";
import { Sidebar } from "./components/Sidebar";
import { loadData, saveData } from "./storage";
import { useTheme } from "./theme";
import type { Command, Data } from "./types";

export function App() {
  const { preference, setPreference } = useTheme();
  const [data, setData] = useState<Data | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "favorites" });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const saveInProgress = useRef(false);
  const dataRef = useRef<Data | null>(null);

  useEffect(() => {
    let active = true;
    loadData().then(
      (loaded) => {
        if (active) {
          dataRef.current = loaded;
          setData(loaded);
        }
      },
      (reason: unknown) => {
        if (active) setError(`Could not load your data: ${String(reason)}`);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function persist(next: Data): Promise<boolean> {
    if (saveInProgress.current) return false;
    saveInProgress.current = true;
    setSaving(true);
    setError("");
    try {
      await saveData(next);
      dataRef.current = next;
      setData(next);
      return true;
    } catch (reason) {
      setError(`Could not save your changes: ${String(reason)}`);
      return false;
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  async function submitCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = collectionName.trim();
    if (!name || !data) return;
    const collection = { id: crypto.randomUUID(), name };
    if (
      await persist({ ...data, collections: [...data.collections, collection] })
    ) {
      setSelection({ kind: "collection", id: collection.id });
      setCollectionName("");
      setCollectionOpen(false);
    }
  }

  async function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !editor ||
      !data ||
      !editor.command.name.trim() ||
      !editor.command.body.trim()
    )
      return;
    const command = { ...editor.command, name: editor.command.name.trim() };
    const commands =
      editor.mode === "new"
        ? [...data.commands, command]
        : data.commands.map((item) =>
            item.id === command.id ? command : item,
          );
    if (await persist({ ...data, commands })) setEditor(null);
  }

  async function toggleFavorite(command: Command) {
    if (!data) return;
    await persist({
      ...data,
      commands: data.commands.map((item) =>
        item.id === command.id ? { ...item, favorite: !item.favorite } : item,
      ),
    });
  }

  async function handleImport() {
    if (!data) return;
    try {
      setError("");
      const json = await readCollectionFile();
      if (json === null) return;
      const current = dataRef.current;
      if (!current) return;
      const result = importCollection(json, current);
      if (await persist(result.data))
        setSelection({ kind: "collection", id: result.id });
    } catch (reason) {
      setError(`Could not import collection: ${String(reason)}`);
    }
  }

  async function handleExport() {
    if (!data || selection.kind !== "collection") return;
    const collection = data.collections.find(
      (item) => item.id === selection.id,
    );
    if (!collection) return;
    try {
      setError("");
      await writeCollectionFile(
        collection.name,
        exportCollection(collection, data.commands),
      );
    } catch (reason) {
      setError(`Could not export collection: ${String(reason)}`);
    }
  }

  function openNewCommand() {
    setEditor({
      mode: "new",
      command: {
        id: crypto.randomUUID(),
        name: "",
        body: "",
        collection_id: selection.kind === "collection" ? selection.id : null,
        favorite: selection.kind === "favorites",
      },
    });
  }

  const collections = data?.collections ?? [];
  const selectedCollection =
    selection.kind === "collection"
      ? collections.find((item) => item.id === selection.id)
      : undefined;
  const commands =
    data?.commands.filter((command) =>
      selection.kind === "favorites"
        ? command.favorite
        : command.collection_id === selection.id,
    ) ?? [];
  const title =
    selection.kind === "favorites"
      ? "Favorites"
      : (selectedCollection?.name ?? "No collection");

  return (
    <div className="flex min-h-screen">
      <Sidebar
        data={data}
        selection={selection}
        onSelect={setSelection}
        onCreate={() => setCollectionOpen(true)}
        onImport={handleImport}
        theme={preference}
        onThemeChange={setPreference}
        busy={saving}
      />
      <main className="main">
        <header className="main-header">
          <div>
            <div className="eyebrow">COMMAND LIBRARY</div>
            <h1>{title}</h1>
            <p className="subtitle">
              {commands.length} {commands.length === 1 ? "command" : "commands"}
            </p>
          </div>
          <div className="header-actions">
            {selectedCollection && (
              <button
                type="button"
                className="secondary-button"
                onClick={handleExport}
                disabled={!data || saving}
              >
                <Download size={16} /> Export
              </button>
            )}
            <button
              type="button"
              className="primary-button"
              disabled={!data || saving}
              onClick={openNewCommand}
            >
              <Plus size={19} /> New command
            </button>
          </div>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {!data && !error && (
          <p className="state-message">Loading your commands…</p>
        )}
        {data && commands.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              {selection.kind === "favorites" ? (
                <Star size={23} />
              ) : (
                <Terminal size={23} />
              )}
            </div>
            <h2>
              {selection.kind === "favorites"
                ? "No favorites yet"
                : "No commands yet"}
            </h2>
            <p>
              {selection.kind === "favorites"
                ? "Star a command to find it here."
                : "Add a command to get started."}
            </p>
            {selection.kind !== "favorites" && (
              <button
                type="button"
                className="text-action"
                disabled={saving}
                onClick={openNewCommand}
              >
                <Plus size={16} /> Add a command
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {commands.map((command) => (
            <div className="command-card" key={command.id}>
              <button
                type="button"
                className={`favorite-button ${command.favorite ? "is-favorite" : ""}`}
                aria-label={`${command.favorite ? "Remove" : "Add"} ${command.name} ${command.favorite ? "from" : "to"} favorites`}
                aria-pressed={command.favorite}
                disabled={saving}
                onClick={() => toggleFavorite(command)}
              >
                <Star
                  size={19}
                  fill={command.favorite ? "currentColor" : "none"}
                />
              </button>
              <button
                type="button"
                className="command-edit"
                onClick={() => setEditor({ mode: "edit", command })}
              >
                <span className="command-content">
                  <strong>{command.name}</strong>
                  <code>{command.body}</code>
                </span>
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </main>
      <CommandDialog
        editor={editor}
        setEditor={setEditor}
        collections={collections}
        saving={saving}
        error={error}
        onSubmit={submitCommand}
      />
      <CollectionDialog
        open={collectionOpen}
        setOpen={setCollectionOpen}
        name={collectionName}
        setName={setCollectionName}
        saving={saving}
        error={error}
        onSubmit={submitCollection}
      />
    </div>
  );
}
