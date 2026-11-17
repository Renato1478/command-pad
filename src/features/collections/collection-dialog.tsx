import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { FormEvent } from "react";
import { Input } from "../../components/ui/input";

export function CollectionDialog({
  open,
  setOpen,
  name,
  setName,
  saving,
  error,
  onSubmit,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  name: string;
  setName: (name: string) => void;
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
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
                New collection
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                Organize your commands into collections.
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
            <label className="field" htmlFor="collection-name">
              Collection name
              <Input
                id="collection-name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Git"
              />
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
                disabled={saving || !name.trim()}
              >
                {saving ? "Saving…" : "Create collection"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
