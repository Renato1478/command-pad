import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Command, Data, Folder as FolderType } from "../../types";
import { CommandCard } from "../commands/command-card";
import { commandsIn, foldersIn, recursiveCommandCount } from "./queries";

type FolderActions = {
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onEditCommand: (command: Command) => void;
  onToggleFavorite: (command: Command) => void;
  onAddCommand: (folderId: string) => void;
  onAddFolder: (folderId: string) => void;
  onEditFolder: (folder: FolderType) => void;
  onDeleteFolder: (folder: FolderType) => void;
  busy: boolean;
};

export function FolderTree({
  data,
  collectionId,
  parentId,
  ...actions
}: {
  data: Data;
  collectionId: string;
  parentId: string | null;
} & FolderActions) {
  const folders = foldersIn(data.folders, collectionId, parentId);
  const commands = commandsIn(data.commands, collectionId, parentId);
  return (
    <div className="folder-tree">
      {folders.map((folder) => (
        <FolderRow key={folder.id} data={data} folder={folder} {...actions} />
      ))}
      {commands.map((command) => (
        <CommandCard
          key={command.id}
          command={command}
          onEdit={() => actions.onEditCommand(command)}
          onToggleFavorite={() => actions.onToggleFavorite(command)}
          busy={actions.busy}
        />
      ))}
    </div>
  );
}

function FolderRow({
  data,
  folder,
  expanded,
  onToggle,
  onEditCommand,
  onToggleFavorite,
  onAddCommand,
  onAddFolder,
  onEditFolder,
  onDeleteFolder,
  busy,
}: { data: Data; folder: FolderType } & FolderActions) {
  const isExpanded = expanded.has(folder.id);
  const count = recursiveCommandCount(data.commands, data.folders, folder.id);
  const childFolders = foldersIn(data.folders, folder.collection_id, folder.id);
  const childCommands = commandsIn(
    data.commands,
    folder.collection_id,
    folder.id,
  );
  const isEmpty = childFolders.length === 0 && childCommands.length === 0;

  return (
    <div className={`folder ${isExpanded ? "expanded" : ""}`}>
      <div className="folder-row hover:bg-white">
        <button
          type="button"
          className="folder-toggle"
          aria-expanded={isExpanded}
          aria-label={`${folder.name}, ${count} ${count === 1 ? "command" : "commands"}`}
          onClick={() => onToggle(folder.id)}
        >
          {/* <ChevronRight
            className={`folder-chevron ${isExpanded ? "open" : ""}`}
            size={16}
            aria-hidden="true"
          /> */}
          {isExpanded ? (
            <FolderOpen size={18} aria-hidden="true" />
          ) : (
            <Folder size={18} aria-hidden="true" />
          )}
          <span className="folder-name">{folder.name}</span>
          <span className="folder-count">
            {count} {count === 1 ? "command" : "commands"}
          </span>
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="icon-button folder-menu-trigger"
              aria-label={`Actions for ${folder.name}`}
              disabled={busy}
            >
              <MoreHorizontal size={18} />
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
                onSelect={() => onAddCommand(folder.id)}
              >
                <Plus size={16} /> Add command
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="folder-menu-item"
                onSelect={() => onAddFolder(folder.id)}
              >
                <FolderPlus size={16} /> Add subfolder
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="folder-menu-item"
                onSelect={() => onEditFolder(folder)}
              >
                <Pencil size={16} /> Rename or move
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="folder-menu-separator" />
              <DropdownMenu.Item
                className="folder-menu-item danger"
                onSelect={() => onDeleteFolder(folder)}
              >
                <Trash2 size={16} /> Delete folder
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {isExpanded && (
        <div className="folder-children">
          {isEmpty ? (
            <div className="mt-1.5 folder-empty">
              <span>Empty folder</span>
              <div>
                <button
                  type="button"
                  className="text-action"
                  disabled={busy}
                  onClick={() => onAddCommand(folder.id)}
                >
                  <Plus size={15} /> Add command
                </button>
                <button
                  type="button"
                  className="text-action"
                  disabled={busy}
                  onClick={() => onAddFolder(folder.id)}
                >
                  <FolderPlus size={15} /> Add subfolder
                </button>
              </div>
            </div>
          ) : (
            <FolderTree
              data={data}
              collectionId={folder.collection_id}
              parentId={folder.id}
              expanded={expanded}
              onToggle={onToggle}
              onEditCommand={onEditCommand}
              onToggleFavorite={onToggleFavorite}
              onAddCommand={onAddCommand}
              onAddFolder={onAddFolder}
              onEditFolder={onEditFolder}
              onDeleteFolder={onDeleteFolder}
              busy={busy}
            />
          )}
        </div>
      )}
    </div>
  );
}
