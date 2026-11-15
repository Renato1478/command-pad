import { Download, FolderPlus, Plus, Star, Terminal } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  exportCollection,
  importCollection,
  readCollectionFile,
  writeCollectionFile,
} from "./collection-transfer";
import { CollectionDialog } from "./components/CollectionDialog";
import { CommandCard } from "./components/CommandCard";
import type { Editor } from "./components/CommandDialog";
import { CommandDialog } from "./components/CommandDialog";
import { ConfirmDialog } from "./components/ConfirmDialog";
import type { FolderEditor } from "./components/FolderDialog";
import { FolderDialog } from "./components/FolderDialog";
import { FolderTree } from "./components/FolderTree";
import type { Selection } from "./components/Sidebar";
import { Sidebar } from "./components/Sidebar";
import {
  commandLocation,
  folderDeletionSummary,
  folderPath,
  sortByName,
} from "./folders";
import { addFolder, deleteFolderCascade, updateFolder } from "./library";
import { loadData, saveData } from "./storage";
import { useTheme } from "./theme";
import type { Command, Data, Folder } from "./types";

export function App() {
  const { preference, setPreference } = useTheme();
  const [data, setData] = useState<Data | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "favorites" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [folderEditor, setFolderEditor] = useState<FolderEditor | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
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

  function toggleFolder(folderId: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function expandFolder(folderId: string | null) {
    if (!folderId) return;
    const current = dataRef.current;
    if (!current) return;
    const ids = folderPath(current.folders, folderId).map(
      (folder) => folder.id,
    );
    setExpanded((previous) => {
      const next = new Set(previous);
      for (const id of ids) next.add(id);
      return next;
    });
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

  function openNewCommand(folderId: string | null = null) {
    const folder = folderId
      ? data?.folders.find((item) => item.id === folderId)
      : undefined;
    const collectionId = folder
      ? folder.collection_id
      : selection.kind === "collection"
        ? selection.id
        : null;
    setEditor({
      mode: "new",
      command: {
        id: crypto.randomUUID(),
        name: "",
        body: "",
        collection_id: collectionId,
        folder_id: folderId,
        favorite: selection.kind === "favorites",
      },
    });
  }

  function openNewFolder(parentId: string | null) {
    const parent = parentId
      ? data?.folders.find((item) => item.id === parentId)
      : undefined;
    const collectionId = parent
      ? parent.collection_id
      : selection.kind === "collection"
        ? selection.id
        : null;
    if (!collectionId) return;
    setFolderEditor({
      mode: "create",
      collectionId,
      name: "",
      parentId,
    });
  }

  function editFolder(folder: Folder) {
    setFolderEditor({
      mode: "edit",
      collectionId: folder.collection_id,
      folderId: folder.id,
      name: folder.name,
      parentId: folder.parent_id,
    });
  }

  async function submitFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderEditor || !data) return;
    const name = folderEditor.name.trim();
    if (!name) return;
    const folderId = folderEditor.folderId ?? crypto.randomUUID();
    let next: Data;
    try {
      next =
        folderEditor.mode === "create"
          ? addFolder(data, {
              id: folderId,
              collection_id: folderEditor.collectionId,
              parent_id: folderEditor.parentId,
              name,
            })
          : updateFolder(
              data,
              folderEditor.folderId as string,
              name,
              folderEditor.parentId,
            );
    } catch (reason) {
      setError(`Could not save folder: ${String(reason)}`);
      return;
    }
    if (await persist(next)) {
      setFolderEditor(null);
      expandFolder(folderEditor.parentId);
      if (folderEditor.mode === "create") expandFolder(folderId);
    }
  }

  async function deleteFolder() {
    if (!folderToDelete || !data) return;
    const result = deleteFolderCascade(data, folderToDelete.id);
    if (await persist(result.data)) {
      setFolderToDelete(null);
      setExpanded((previous) => {
        const next = new Set(previous);
        for (const id of result.removedFolderIds) next.delete(id);
        return next;
      });
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
    if (await persist({ ...data, commands })) {
      expandFolder(command.folder_id);
      setEditor(null);
    }
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
        exportCollection(collection, data.folders, data.commands),
      );
    } catch (reason) {
      setError(`Could not export collection: ${String(reason)}`);
    }
  }

  const collections = data?.collections ?? [];
  const activeCollectionId =
    selection.kind === "collection" ? selection.id : null;
  const selectedCollection = collections.find(
    (item) => item.id === activeCollectionId,
  );
  const canManageFolders = activeCollectionId !== null;
  const collectionFolders = activeCollectionId
    ? (data?.folders.filter(
        (folder) => folder.collection_id === activeCollectionId,
      ) ?? [])
    : [];
  const collectionCommands = activeCollectionId
    ? (data?.commands.filter(
        (command) => command.collection_id === activeCollectionId,
      ) ?? [])
    : [];
  const favorites = selection.kind === "favorites";
  const flatCommands = favorites
    ? sortByName(data?.commands.filter((command) => command.favorite) ?? [])
    : sortByName(
        data?.commands.filter((command) => command.collection_id === null) ??
          [],
      );
  const commandCount = favorites
    ? flatCommands.length
    : activeCollectionId
      ? collectionCommands.length
      : flatCommands.length;
  const title = favorites
    ? "Favorites"
    : (selectedCollection?.name ?? "No collection");
  const isEmpty = favorites
    ? commandCount === 0
    : activeCollectionId
      ? commandCount === 0 && collectionFolders.length === 0
      : commandCount === 0;
  const deletionSummary =
    data && folderToDelete
      ? folderDeletionSummary(data, folderToDelete.id)
      : { commands: 0, folders: 0 };
  const deletionParts = [
    deletionSummary.commands > 0
      ? `${deletionSummary.commands} ${
          deletionSummary.commands === 1 ? "command" : "commands"
        }`
      : null,
    deletionSummary.folders > 0
      ? `${deletionSummary.folders} ${
          deletionSummary.folders === 1 ? "subfolder" : "subfolders"
        }`
      : null,
  ].filter(Boolean);

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
              {commandCount} {commandCount === 1 ? "command" : "commands"}
              {canManageFolders && (
                <>
                  {" · "}
                  {collectionFolders.length}{" "}
                  {collectionFolders.length === 1 ? "folder" : "folders"}
                </>
              )}
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
            {canManageFolders && (
              <button
                type="button"
                className="secondary-button"
                disabled={!data || saving}
                onClick={() => openNewFolder(null)}
              >
                <FolderPlus size={16} /> New folder
              </button>
            )}
            <button
              type="button"
              className="primary-button"
              disabled={!data || saving}
              onClick={() => openNewCommand()}
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
        {data && isEmpty && (
          <div className="empty-state">
            <div className="empty-icon">
              {favorites ? <Star size={23} /> : <Terminal size={23} />}
            </div>
            <h2>{favorites ? "No favorites yet" : "No commands yet"}</h2>
            <p>
              {favorites
                ? "Star a command to find it here."
                : canManageFolders
                  ? "Add a command or create a folder to get started."
                  : "Add a command to get started."}
            </p>
            {!favorites && (
              <button
                type="button"
                className="text-action"
                disabled={saving}
                onClick={() => openNewCommand()}
              >
                <Plus size={16} /> Add a command
              </button>
            )}
          </div>
        )}
        {data && !isEmpty && (
          <div className="command-list">
            {favorites || !activeCollectionId ? (
              flatCommands.map((command) => (
                <CommandCard
                  key={command.id}
                  command={command}
                  location={
                    favorites ? commandLocation(data, command) : undefined
                  }
                  onEdit={() => setEditor({ mode: "edit", command })}
                  onToggleFavorite={() => toggleFavorite(command)}
                  busy={saving}
                />
              ))
            ) : (
              <FolderTree
                data={data}
                collectionId={activeCollectionId}
                parentId={null}
                expanded={expanded}
                onToggle={toggleFolder}
                onEditCommand={(command) =>
                  setEditor({ mode: "edit", command })
                }
                onToggleFavorite={toggleFavorite}
                onAddCommand={(folderId) => openNewCommand(folderId)}
                onAddFolder={(folderId) => openNewFolder(folderId)}
                onEditFolder={editFolder}
                onDeleteFolder={setFolderToDelete}
                busy={saving}
              />
            )}
          </div>
        )}
      </main>
      <CommandDialog
        editor={editor}
        setEditor={setEditor}
        collections={collections}
        folders={data?.folders ?? []}
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
      <FolderDialog
        editor={folderEditor}
        setEditor={setFolderEditor}
        collections={collections}
        folders={data?.folders ?? []}
        saving={saving}
        error={error}
        onSubmit={submitFolder}
      />
      <ConfirmDialog
        open={!!folderToDelete}
        title={`Delete “${folderToDelete?.name ?? "folder"}”?`}
        description={
          deletionParts.length === 0
            ? "This folder is empty."
            : `This permanently deletes ${deletionParts.join(" and ")}. This cannot be undone.`
        }
        confirmLabel="Delete folder"
        onConfirm={deleteFolder}
        onClose={() => setFolderToDelete(null)}
        busy={saving}
        error={error}
      />
    </div>
  );
}
