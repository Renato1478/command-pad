import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { FormEvent } from "react";
import type { Collection, Folder as FolderType } from "../../types";
import { folderOptions } from "./queries";

export type FolderEditor = {
  mode: "create" | "edit";
  collectionId: string;
  folderId?: string;
  name: string;
  parentId: string | null;
};

export function FolderDialog({
  editor,
  setEditor,
  collections,
  folders,
  saving,
  error,
  onSubmit,
}: {
  editor: FolderEditor | null;
  setEditor: (editor: FolderEditor | null) => void;
  collections: Collection[];
  folders: FolderType[];
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const collection = editor
    ? collections.find((item) => item.id === editor.collectionId)
    : undefined;
  const options = editor
    ? folderOptions(folders, editor.collectionId, editor.folderId)
    : [];
  const editing = editor?.mode === "edit";

  return (
    <Dialog.Root
      open={!!editor}
      onOpenChange={(open) => {
        if (!open && !saving) setEditor(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog small-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title className="dialog-title">
                {editing ? "Edit folder" : "New folder"}
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                {editing
                  ? "Rename this folder or move it somewhere else."
                  : `Create a folder inside ${collection?.name ?? "this collection"}.`}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="icon-button"
              aria-label="Close"
              disabled={saving}
            >
              <X size={19} />
            </Dialog.Close>
          </div>
          {editor && (
            <form onSubmit={onSubmit}>
              <label className="field">
                Folder name
                <input
                  required
                  value={editor.name}
                  onChange={(event) =>
                    setEditor({ ...editor, name: event.target.value })
                  }
                  placeholder="e.g. Utils"
                />
              </label>
              <label className="field">
                Location
                <select
                  value={editor.parentId ?? ""}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      parentId: event.target.value || null,
                    })
                  }
                >
                  {options.map((option) => (
                    <option value={option.id ?? ""} key={option.id ?? "root"}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {error && (
                <p className="dialog-error" role="alert">
                  {error}
                </p>
              )}
              <div className="dialog-actions">
                <Dialog.Close className="secondary-button" disabled={saving}>
                  Cancel
                </Dialog.Close>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={saving || !editor.name.trim()}
                >
                  {saving
                    ? "Saving…"
                    : editing
                      ? "Save changes"
                      : "Create folder"}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
