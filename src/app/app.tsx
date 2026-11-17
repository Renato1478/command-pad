import { Plus, Star, Terminal } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../components/confirm-dialog";
import { CollectionActions } from "../features/collections/collection-actions";
import { CollectionDialog } from "../features/collections/collection-dialog";
import {
  exportCollection,
  importCollection,
  readCollectionFile,
  writeCollectionFile,
} from "../features/collections/collection-transfer";
import { deleteCollectionCascade } from "../features/collections/mutations";
import { CommandCard } from "../features/commands/command-card";
import type { Editor } from "../features/commands/command-dialog";
import { CommandDialog } from "../features/commands/command-dialog";
import type { FolderEditor } from "../features/folders/folder-dialog";
import { FolderDialog } from "../features/folders/folder-dialog";
import { FolderTree } from "../features/folders/folder-tree";
import {
  addFolder,
  deleteFolderCascade,
  updateFolder,
} from "../features/folders/mutations";
import {
  commandLocation,
  folderDeletionSummary,
  folderPath,
  sortByName,
} from "../features/folders/queries";
import type { Selection } from "../features/navigation/sidebar";
import { Sidebar } from "../features/navigation/sidebar";
import {
  RenameWorkspaceDialog,
  WorkspaceDialog,
} from "../features/workspaces/workspace-dialog";
import { loadData, saveData } from "../storage";
import { useTheme } from "../style/theme";
import type { Collection, Command, Data, Folder } from "../types";
import type { CommandRevisions, WorkspaceRecord } from "../workspace-storage";
import {
  chooseWorkspaceDirectory,
  createLocalWorkspace,
  createWorkspace,
  DEFAULT_WORKSPACE_ID,
  loadWorkspaceRecords,
  openWorkspace,
  readWorkspace,
  rememberWorkspace,
  removeWorkspaceRecord,
  renameWorkspace,
  saveWorkspace,
  updateWorkspaceRecord,
  workspaceRevisions,
} from "../workspace-storage";

export function App() {
  const { preference, setPreference } = useTheme();
  const [data, setData] = useState<Data | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "favorites" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [collectionToDelete, setCollectionToDelete] =
    useState<Collection | null>(null);
  const [folderEditor, setFolderEditor] = useState<FolderEditor | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [workspaceRecords, setWorkspaceRecords] = useState<WorkspaceRecord[]>(
    () => loadWorkspaceRecords(),
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(
    () =>
      localStorage.getItem("command-pad-active-workspace") ??
      DEFAULT_WORKSPACE_ID,
  );
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState("");
  const [workspaceToDelete, setWorkspaceToDelete] =
    useState<WorkspaceRecord | null>(null);
  const saveInProgress = useRef(false);
  const dataRef = useRef<Data | null>(null);
  const revisionsRef = useRef<CommandRevisions>({});
  const activeWorkspace =
    activeWorkspaceId === DEFAULT_WORKSPACE_ID
      ? null
      : workspaceRecords.find((item) => item.id === activeWorkspaceId);

  useEffect(() => {
    let active = true;
    const record =
      activeWorkspaceId === DEFAULT_WORKSPACE_ID
        ? null
        : loadWorkspaceRecords().find((item) => item.id === activeWorkspaceId);
    if (activeWorkspaceId !== DEFAULT_WORKSPACE_ID && !record) {
      // The remembered workspace was removed from this device.
      localStorage.setItem(
        "command-pad-active-workspace",
        DEFAULT_WORKSPACE_ID,
      );
      setActiveWorkspaceId(DEFAULT_WORKSPACE_ID);
      return;
    }
    const load = record
      ? Promise.all([
          readWorkspace(record.path),
          workspaceRevisions(record.path),
        ])
      : loadData().then((loaded) => [loaded, {}] as const);
    load.then(
      ([loaded, revisions]) => {
        if (active) {
          dataRef.current = loaded;
          revisionsRef.current = revisions;
          setData(loaded);
        }
      },
      (reason: unknown) => {
        if (active) {
          setError(`Could not load your data: ${String(reason)}`);
          setData(null);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [activeWorkspaceId]);

  const workspacePath = activeWorkspace?.path;

  // Network directories do not reliably emit filesystem events on every
  // platform, so reconcile periodically as well as when the window is focused.
  useEffect(() => {
    if (!workspacePath) return;
    const path: string = workspacePath;
    let cancelled = false;
    async function refresh() {
      if (saveInProgress.current) return;
      try {
        const [loaded, revisions] = await Promise.all([
          readWorkspace(path),
          workspaceRevisions(path),
        ]);
        if (cancelled) return;
        revisionsRef.current = revisions;
        if (JSON.stringify(loaded) !== JSON.stringify(dataRef.current)) {
          dataRef.current = loaded;
          setData(loaded);
        }
      } catch (reason) {
        if (!cancelled) {
          setError(`Could not refresh the workspace: ${String(reason)}`);
        }
      }
    }
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [workspacePath]);

  async function persist(next: Data): Promise<boolean> {
    if (saveInProgress.current) return false;
    saveInProgress.current = true;
    setSaving(true);
    setError("");
    try {
      const previous = dataRef.current;
      if (activeWorkspace) {
        if (!previous) return false;
        await saveWorkspace(
          activeWorkspace.path,
          previous,
          next,
          revisionsRef.current,
        );
        revisionsRef.current = await workspaceRevisions(activeWorkspace.path);
      } else {
        await saveData(next);
      }
      dataRef.current = next;
      setData(next);
      return true;
    } catch (reason) {
      setError(`Could not save your changes: ${String(reason)}`);
      // Pick up the current fingerprints so the user can resolve a conflict
      // without waiting for the next workspace poll.
      if (activeWorkspace) {
        try {
          revisionsRef.current = await workspaceRevisions(activeWorkspace.path);
        } catch {
          // Keep the original save error as the actionable message.
        }
      }
      return false;
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  async function switchWorkspace(id: string) {
    if (id === activeWorkspaceId) return;
    const record = workspaceRecords.find((item) => item.id === id);
    if (id !== DEFAULT_WORKSPACE_ID && !record) return;
    setError("");
    setData(null);
    revisionsRef.current = {};
    setActiveWorkspaceId(id);
    localStorage.setItem("command-pad-active-workspace", id);
    setSelection({ kind: "favorites" });
    setExpanded(new Set());
  }

  async function createWorkspaceFromName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = workspaceName.trim();
    if (!name) return;
    setWorkspaceError("");
    setSaving(true);
    try {
      const record = await createLocalWorkspace(name);
      setWorkspaceRecords(rememberWorkspace(record));
      setWorkspaceDialogOpen(false);
      setWorkspaceName("");
      await switchWorkspace(record.id);
    } catch (reason) {
      setWorkspaceError(String(reason));
    } finally {
      setSaving(false);
    }
  }

  async function createWorkspaceInFolder() {
    const name = workspaceName.trim();
    if (!name) {
      setWorkspaceError("Enter a workspace name first.");
      return;
    }
    setWorkspaceError("");
    setSaving(true);
    try {
      const path = await chooseWorkspaceDirectory();
      if (!path) return;
      const record = await createWorkspace(path, name);
      setWorkspaceRecords(rememberWorkspace(record));
      setWorkspaceDialogOpen(false);
      setWorkspaceName("");
      await switchWorkspace(record.id);
    } catch (reason) {
      setWorkspaceError(String(reason));
    } finally {
      setSaving(false);
    }
  }

  async function openExistingWorkspace() {
    setWorkspaceError("");
    setSaving(true);
    try {
      const path = await chooseWorkspaceDirectory();
      if (!path) return;
      const opened = await openWorkspace(path);
      setWorkspaceRecords(rememberWorkspace(opened.record));
      setWorkspaceDialogOpen(false);
      await switchWorkspace(opened.record.id);
    } catch (reason) {
      setWorkspaceError(String(reason));
    } finally {
      setSaving(false);
    }
  }

  async function submitWorkspaceRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = renameName.trim();
    if (!name || !activeWorkspace) return;
    setRenameError("");
    setSaving(true);
    try {
      await renameWorkspace(activeWorkspace.path, name);
      const updated = { ...activeWorkspace, name };
      setWorkspaceRecords(updateWorkspaceRecord(updated));
      setRenameDialogOpen(false);
    } catch (reason) {
      setRenameError(String(reason));
    } finally {
      setSaving(false);
    }
  }

  function deleteWorkspace() {
    if (!workspaceToDelete) return;
    setWorkspaceRecords(removeWorkspaceRecord(workspaceToDelete.id));
    if (activeWorkspaceId === workspaceToDelete.id) {
      void switchWorkspace(DEFAULT_WORKSPACE_ID);
    }
    setWorkspaceToDelete(null);
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

  async function deleteCollection() {
    if (!collectionToDelete || !data) return;
    const folderIds = new Set(
      data.folders
        .filter((folder) => folder.collection_id === collectionToDelete.id)
        .map((folder) => folder.id),
    );
    if (await persist(deleteCollectionCascade(data, collectionToDelete.id))) {
      setCollectionToDelete(null);
      setSelection({ kind: "favorites" });
      setExpanded(
        (previous) => new Set([...previous].filter((id) => !folderIds.has(id))),
      );
    }
  }

  async function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !editor ||
      editor.mode === "view" ||
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
      setEditor(editor.mode === "edit" ? { mode: "view", command } : null);
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
  const collectionDeletionFolders =
    data?.folders.filter(
      (folder) => folder.collection_id === collectionToDelete?.id,
    ).length ?? 0;
  const collectionDeletionCommands =
    data?.commands.filter(
      (command) => command.collection_id === collectionToDelete?.id,
    ).length ?? 0;

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
        workspaces={[
          { id: DEFAULT_WORKSPACE_ID, name: "Default" },
          ...workspaceRecords,
        ]}
        activeWorkspaceId={activeWorkspaceId}
        onWorkspaceChange={(id) => void switchWorkspace(id)}
        onNewWorkspace={() => {
          setWorkspaceError("");
          setWorkspaceDialogOpen(true);
        }}
        onRenameWorkspace={() => {
          if (!activeWorkspace) return;
          setRenameName(activeWorkspace.name);
          setRenameError("");
          setRenameDialogOpen(true);
        }}
        onDeleteWorkspace={() => {
          if (!activeWorkspace) return;
          setWorkspaceToDelete(activeWorkspace);
        }}
      />
      <main className="main">
        <header className="main-header">
          <div>
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
              <CollectionActions
                onNewFolder={() => openNewFolder(null)}
                onExport={handleExport}
                onDelete={() => {
                  setError("");
                  setCollectionToDelete(selectedCollection);
                }}
                disabled={!data || saving}
              />
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
                  onEdit={() => setEditor({ mode: "view", command })}
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
                  setEditor({ mode: "view", command })
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
        location={
          data && editor
            ? commandLocation(data, editor.command)
            : "No collection"
        }
      />
      <WorkspaceDialog
        open={workspaceDialogOpen}
        setOpen={setWorkspaceDialogOpen}
        name={workspaceName}
        setName={setWorkspaceName}
        onCreate={createWorkspaceFromName}
        onCreateInFolder={createWorkspaceInFolder}
        onOpenExisting={openExistingWorkspace}
        saving={saving}
        error={workspaceError}
      />
      <RenameWorkspaceDialog
        open={renameDialogOpen}
        setOpen={setRenameDialogOpen}
        name={renameName}
        setName={setRenameName}
        onSubmit={submitWorkspaceRename}
        saving={saving}
        error={renameError}
      />
      <ConfirmDialog
        open={!!workspaceToDelete}
        title={`Delete “${workspaceToDelete?.name ?? "workspace"}”?`}
        description="This removes the workspace from this device. Files in the workspace folder are not deleted."
        confirmLabel="Delete workspace"
        onConfirm={deleteWorkspace}
        onClose={() => setWorkspaceToDelete(null)}
        busy={false}
        error={workspaceError}
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
        open={!!collectionToDelete}
        title={`Delete “${collectionToDelete?.name ?? "collection"}”?`}
        description={`This permanently deletes the collection, ${collectionDeletionFolders} ${collectionDeletionFolders === 1 ? "folder" : "folders"}, and ${collectionDeletionCommands} ${collectionDeletionCommands === 1 ? "command" : "commands"}. This cannot be undone.`}
        confirmLabel="Delete collection"
        onConfirm={deleteCollection}
        onClose={() => setCollectionToDelete(null)}
        busy={saving}
        error={error}
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
