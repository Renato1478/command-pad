import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { FormEvent } from "react";
import { folderOptions } from "../folders";
import type { Collection, Command, Folder } from "../types";

export type Editor = { mode: "new" | "edit"; command: Command };

export function CommandDialog({
  editor,
  setEditor,
  collections,
  folders,
  saving,
  error,
  onSubmit,
}: {
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
  collections: Collection[];
  folders: Folder[];
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog.Root
      open={!!editor}
      onOpenChange={(open) => {
        if (!open && !saving) setEditor(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title className="dialog-title">
                {editor?.mode === "edit" ? "Edit command" : "New command"}
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                Save a command for quick reference.
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
                Title
                <input
                  required
                  value={editor.command.name}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      command: { ...editor.command, name: event.target.value },
                    })
                  }
                  placeholder="e.g. Git status"
                />
              </label>
              <label className="field">
                Command
                <input
                  required
                  value={editor.command.body}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      command: { ...editor.command, body: event.target.value },
                    })
                  }
                  placeholder="e.g. git status --short --branch"
                />
              </label>
              <label className="field">
                Collection
                <select
                  value={editor.command.collection_id ?? ""}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      command: {
                        ...editor.command,
                        collection_id: event.target.value || null,
                        folder_id: null,
                      },
                    })
                  }
                >
                  <option value="">No collection</option>
                  {collections.map((collection) => (
                    <option value={collection.id} key={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Folder
                <select
                  value={editor.command.folder_id ?? ""}
                  disabled={!editor.command.collection_id}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      command: {
                        ...editor.command,
                        folder_id: event.target.value || null,
                      },
                    })
                  }
                >
                  {editor.command.collection_id ? (
                    folderOptions(folders, editor.command.collection_id).map(
                      (option) => (
                        <option
                          value={option.id ?? ""}
                          key={option.id ?? "root"}
                        >
                          {option.label}
                        </option>
                      ),
                    )
                  ) : (
                    <option value="">No folder</option>
                  )}
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
                  disabled={
                    saving ||
                    !editor.command.name.trim() ||
                    !editor.command.body.trim()
                  }
                >
                  {saving
                    ? "Saving…"
                    : editor.mode === "edit"
                      ? "Save changes"
                      : "Add command"}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
