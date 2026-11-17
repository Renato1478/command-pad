import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, X } from "lucide-react";
import type { FormEvent } from "react";
import { CodeBlock } from "../../components/ui/code-block";
import { Input } from "../../components/ui/input";
import { SelectField } from "../../components/ui/select";
import type { Collection, Command, Folder } from "../../types";
import { folderOptions } from "../folders/queries";

export type Editor =
  | { mode: "new" | "view"; command: Command }
  | { mode: "edit"; command: Command; original: Command };

export function CommandDialog({
  editor,
  setEditor,
  collections,
  folders,
  saving,
  error,
  onSubmit,
  location,
}: {
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
  collections: Collection[];
  folders: Folder[];
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  location: string;
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
        <Dialog.Content className="dialog command-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title className="dialog-title">
                {editor?.mode === "view"
                  ? editor.command.name
                  : editor?.mode === "edit"
                    ? "Edit command"
                    : "New command"}
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                {editor?.mode === "view"
                  ? location
                  : "Save a command for quick reference."}
              </Dialog.Description>
            </div>
            <div className="command-dialog-header-actions">
              {editor?.mode === "view" && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Edit command"
                  title="Edit command"
                  onClick={() =>
                    setEditor({
                      mode: "edit",
                      command: editor.command,
                      original: editor.command,
                    })
                  }
                >
                  <Pencil size={17} aria-hidden="true" />
                </button>
              )}
              <Dialog.Close
                className="icon-button"
                aria-label="Close"
                disabled={saving}
              >
                <X size={19} />
              </Dialog.Close>
            </div>
          </div>
          {editor?.mode === "view" && (
            <CodeBlock key={editor.command.id} value={editor.command.body} />
          )}
          {editor && editor.mode !== "view" && (
            <form onSubmit={onSubmit}>
              <label className="field" htmlFor="command-title">
                Title
                <Input
                  id="command-title"
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
              <label className="field" htmlFor="command-body">
                Command
                <textarea
                  id="command-body"
                  className="command-textarea"
                  rows={5}
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
              <div className="command-location-fields">
                <div className="field">
                  <span>Collection</span>
                  <SelectField
                    label="Collection"
                    value={editor.command.collection_id ?? ""}
                    onValueChange={(value) =>
                      setEditor({
                        ...editor,
                        command: {
                          ...editor.command,
                          collection_id: value || null,
                          folder_id: null,
                        },
                      })
                    }
                    options={[
                      { value: "", label: "No collection" },
                      ...collections.map((collection) => ({
                        value: collection.id,
                        label: collection.name,
                      })),
                    ]}
                  />
                </div>
                <div className="field">
                  <span>Folder</span>
                  <SelectField
                    label="Folder"
                    value={editor.command.folder_id ?? ""}
                    disabled={!editor.command.collection_id}
                    onValueChange={(value) =>
                      setEditor({
                        ...editor,
                        command: {
                          ...editor.command,
                          folder_id: value || null,
                        },
                      })
                    }
                    options={
                      editor.command.collection_id
                        ? folderOptions(
                            folders,
                            editor.command.collection_id,
                          ).map((option) => ({
                            value: option.id ?? "",
                            label: option.label,
                          }))
                        : [{ value: "", label: "No folder" }]
                    }
                  />
                </div>
              </div>
              {error && (
                <p className="dialog-error" role="alert">
                  {error}
                </p>
              )}
              <div className="dialog-actions">
                {editor.mode === "edit" ? (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={saving}
                    onClick={() =>
                      setEditor({ mode: "view", command: editor.original })
                    }
                  >
                    Cancel
                  </button>
                ) : (
                  <Dialog.Close className="secondary-button" disabled={saving}>
                    Cancel
                  </Dialog.Close>
                )}
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
