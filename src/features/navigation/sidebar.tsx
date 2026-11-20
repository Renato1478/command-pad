import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Monitor,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { SelectField } from "../../components/ui/select";
import type { ThemePreference } from "../../style/theme";
import type { Data } from "../../types";

export type Selection =
  | { kind: "favorites" }
  | { kind: "collection"; id: string | null };

export function Sidebar({
  data,
  selection,
  onSelect,
  onCreate,
  onImport,
  theme,
  onThemeChange,
  busy,
  workspaces,
  activeWorkspaceId,
  onWorkspaceChange,
  onNewWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
}: {
  data: Data | null;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onCreate: () => void;
  onImport: () => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  busy: boolean;
  workspaces: { id: string; name: string }[];
  activeWorkspaceId: string;
  onWorkspaceChange: (id: string) => void;
  onNewWorkspace: () => void;
  onRenameWorkspace: () => void;
  onDeleteWorkspace: () => void;
}) {
  const countFor = (id: string | null) =>
    data?.commands.filter((command) => command.collection_id === id).length ??
    0;
  const favorites =
    data?.commands.filter((command) => command.favorite).length ?? 0;
  return (
    <aside className="sidebar">
      <div className="workspace-picker">
        <span className="workspace-picker-label">Workspace</span>
        <div className="workspace-picker-control">
          <SelectField
            label="Workspace"
            value={activeWorkspaceId}
            onValueChange={onWorkspaceChange}
            options={workspaces.map((workspace) => ({
              value: workspace.id,
              label: workspace.name,
            }))}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="icon-button"
                aria-label="Workspace actions"
                title="Workspace actions"
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
                  onSelect={onNewWorkspace}
                >
                  <Plus size={16} /> New workspace
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="folder-menu-item"
                  disabled={activeWorkspaceId === "default"}
                  onSelect={onRenameWorkspace}
                >
                  <Pencil size={16} /> Edit name
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="folder-menu-separator" />
                <DropdownMenu.Item
                  className="folder-menu-item danger"
                  disabled={activeWorkspaceId === "default"}
                  onSelect={onDeleteWorkspace}
                >
                  <Trash2 size={16} /> Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
      <nav aria-label="Library">
        <button
          type="button"
          className={`category favorites-link ${selection.kind === "favorites" ? "selected" : ""}`}
          aria-current={selection.kind === "favorites" ? "page" : undefined}
          aria-label={`Favorites, ${favorites} ${favorites === 1 ? "command" : "commands"}`}
          onClick={() => onSelect({ kind: "favorites" })}
        >
          <span className="sidebar-label">
            <Star size={16} />
            Favorites
          </span>
          <span className="count">{favorites}</span>
        </button>
      </nav>
      <div className="sidebar-heading">
        <span>Collections</span>
        <div className="sidebar-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Import collection"
            title="Import collection"
            disabled={!data || busy}
            onClick={onImport}
          >
            <Upload size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="New collection"
            title="New collection"
            disabled={!data || busy}
            onClick={onCreate}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
      <nav aria-label="Collections" className="flex flex-col gap-[3px]">
        {[
          { id: null, name: "No collection" },
          ...(data?.collections ?? []),
        ].map((collection) => {
          const selected =
            selection.kind === "collection" && selection.id === collection.id;
          const count = countFor(collection.id);
          return (
            <button
              type="button"
              key={collection.id ?? "uncategorized"}
              className={`category ${selected ? "selected" : ""}`}
              aria-current={selected ? "page" : undefined}
              aria-label={`${collection.name}, ${count} ${count === 1 ? "command" : "commands"}`}
              onClick={() =>
                onSelect({ kind: "collection", id: collection.id })
              }
            >
              <span>{collection.name}</span>
              <span className="count">{count}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="theme-control">
          <span>
            <Monitor size={15} aria-hidden="true" /> Appearance
          </span>
          <SelectField
            label="Appearance"
            className="theme-select"
            value={theme}
            onValueChange={(value) => onThemeChange(value as ThemePreference)}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
      </div>
    </aside>
  );
}
