import { Monitor, Plus, Star, Terminal, Upload } from "lucide-react";
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
}: {
  data: Data | null;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onCreate: () => void;
  onImport: () => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  busy: boolean;
}) {
  const countFor = (id: string | null) =>
    data?.commands.filter((command) => command.collection_id === id).length ??
    0;
  const favorites =
    data?.commands.filter((command) => command.favorite).length ?? 0;
  return (
    <aside className="sidebar">
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
        <div className="sidebar-footer">
          <Terminal size={15} />
          <span>YOUR COMMAND LIBRARY</span>
        </div>
      </div>
    </aside>
  );
}
