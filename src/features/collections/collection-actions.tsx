import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Download, FolderPlus, MoreHorizontal, Trash2 } from "lucide-react";

export function CollectionActions({
  onNewFolder,
  onExport,
  onDelete,
  disabled,
}: {
  onNewFolder: () => void;
  onExport: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="secondary-button collection-actions-trigger"
          aria-label="Collection actions"
          disabled={disabled}
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="folder-menu"
          align="end"
          sideOffset={4}
        >
          <DropdownMenu.Item
            className="folder-menu-item"
            onSelect={onNewFolder}
          >
            <FolderPlus size={16} aria-hidden="true" /> New folder
          </DropdownMenu.Item>
          <DropdownMenu.Item className="folder-menu-item" onSelect={onExport}>
            <Download size={16} aria-hidden="true" /> Export
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="folder-menu-separator" />
          <DropdownMenu.Item
            className="folder-menu-item danger"
            onSelect={onDelete}
          >
            <Trash2 size={16} aria-hidden="true" /> Delete collection
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
