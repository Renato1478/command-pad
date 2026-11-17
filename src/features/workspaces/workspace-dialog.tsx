import * as Dialog from "@radix-ui/react-dialog";
import { FolderOpen, FolderPlus, X } from "lucide-react";
import type { FormEvent } from "react";

export function WorkspaceDialog({
  open,
  setOpen,
  name,
  setName,
  onCreate,
  onCreateInFolder,
  onOpenExisting,
  saving,
  error,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  name: string;
  setName: (name: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onCreateInFolder: () => void;
  onOpenExisting: () => void;
  saving: boolean;
  error: string;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!saving) {
          setOpen(next);
          if (!next) setName("");
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog small-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title className="dialog-title">
                New workspace
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                Give it a name, or open an existing one.
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
          <form onSubmit={onCreate}>
            <label className="field" htmlFor="workspace-name">
              Workspace name
              <input
                id="workspace-name"
                className="ui-input"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Team commands"
              />
            </label>
            {error && (
              <p className="dialog-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary-button workspace-create-button"
              type="submit"
              disabled={saving || !name.trim()}
            >
              <FolderPlus size={16} />
              {saving ? "Working…" : "Create workspace"}
            </button>
          </form>
          <hr className="workspace-divider" />
          <span className="workspace-or">OR</span>
          <div className="workspace-more-actions">
            <button
              type="button"
              className="workspace-link-action"
              disabled={saving}
              onClick={onCreateInFolder}
            >
              <FolderPlus size={16} /> Create in a specific folder
            </button>
            <button
              type="button"
              className="workspace-link-action"
              disabled={saving}
              onClick={onOpenExisting}
            >
              <FolderOpen size={16} /> Open existing workspace
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function RenameWorkspaceDialog({
  open,
  setOpen,
  name,
  setName,
  onSubmit,
  saving,
  error,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  name: string;
  setName: (name: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  error: string;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!saving) setOpen(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog small-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title className="dialog-title">
                Rename workspace
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Change the display name of this workspace.
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
          <form onSubmit={onSubmit}>
            <label className="field" htmlFor="workspace-rename">
              Workspace name
              <input
                id="workspace-rename"
                className="ui-input"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {error && (
              <p className="dialog-error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={saving || !name.trim()}
              >
                {saving ? "Saving…" : "Save name"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
