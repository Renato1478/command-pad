import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, FolderPlus, Plus, Terminal, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { loadData, saveData } from "./storage";
import type { Category, Command, Data } from "./types";

type Editor = { mode: "new" | "edit"; command: Command };

export function App() {
  const [data, setData] = useState<Data | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadData().then(
      (loaded) => {
        if (active) setData(loaded);
      },
      (reason: unknown) => {
        if (active) setError(`Could not load your data: ${String(reason)}`);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function persist(next: Data): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    setError("");
    try {
      await saveData(next);
      setData(next);
      return true;
    } catch (reason) {
      setError(`Could not save your changes: ${String(reason)}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name || !data) return;
    const category: Category = { id: crypto.randomUUID(), name };
    if (
      await persist({ ...data, categories: [...data.categories, category] })
    ) {
      setSelected(category.id);
      setCategoryName("");
      setCategoryOpen(false);
    }
  }

  async function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !editor ||
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
    if (await persist({ ...data, commands })) setEditor(null);
  }

  const categories = data?.categories ?? [];
  const commands =
    data?.commands.filter((command) => command.category_id === selected) ?? [];
  const title =
    categories.find((category) => category.id === selected)?.name ??
    "Uncategorized";
  const countFor = (id: string | null) =>
    data?.commands.filter((command) => command.category_id === id).length ?? 0;

  return (
    <div className="flex min-h-screen">
      <aside className="sidebar">
        <div className="sidebar-heading">
          <span>Categories</span>
          <button
            type="button"
            className="icon-button"
            aria-label="New category"
            onClick={() => setCategoryOpen(true)}
            disabled={!data}
          >
            <FolderPlus size={18} />
          </button>
        </div>
        <nav aria-label="Categories" className="flex flex-col gap-[3px]">
          {[{ id: null, name: "Uncategorized" }, ...categories].map(
            (category) => (
              <button
                type="button"
                key={category.id ?? "uncategorized"}
                className={`category ${selected === category.id ? "selected" : ""}`}
                aria-current={selected === category.id ? "page" : undefined}
                aria-label={`${category.name}, ${countFor(category.id)} ${countFor(category.id) === 1 ? "command" : "commands"}`}
                onClick={() => setSelected(category.id)}
              >
                <span>{category.name}</span>
                <span className="count">{countFor(category.id)}</span>
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-footer">
          <Terminal size={15} />
          <span>YOUR COMMAND LIBRARY</span>
        </div>
      </aside>
      <main className="main">
        <header className="main-header">
          <div>
            <div className="eyebrow">COMMAND LIBRARY</div>
            <h1>{title}</h1>
            <p className="subtitle">
              {commands.length} {commands.length === 1 ? "command" : "commands"}
            </p>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={!data}
            onClick={() =>
              setEditor({
                mode: "new",
                command: {
                  id: crypto.randomUUID(),
                  name: "",
                  body: "",
                  category_id: selected,
                },
              })
            }
          >
            <Plus size={19} /> New command
          </button>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {!data && !error && (
          <p className="state-message">Loading your commands…</p>
        )}
        {data && commands.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <Terminal size={23} />
            </div>
            <h2>No commands yet</h2>
            <p>
              Keep your frequently used commands handy.
              <br />
              Add your first command to get started.
            </p>
            <button
              type="button"
              className="text-action"
              onClick={() =>
                setEditor({
                  mode: "new",
                  command: {
                    id: crypto.randomUUID(),
                    name: "",
                    body: "",
                    category_id: selected,
                  },
                })
              }
            >
              <Plus size={16} /> Add a command
            </button>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {commands.map((command) => (
            <button
              type="button"
              className="command-card"
              key={command.id}
              onClick={() => setEditor({ mode: "edit", command })}
            >
              <span className="command-content">
                <strong>{command.name}</strong>
                <code>{command.body}</code>
              </span>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          ))}
        </div>
      </main>

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
              <form onSubmit={submitCommand}>
                <label className="field">
                  Title
                  <input
                    required
                    value={editor.command.name}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        command: {
                          ...editor.command,
                          name: event.target.value,
                        },
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
                        command: {
                          ...editor.command,
                          body: event.target.value,
                        },
                      })
                    }
                    placeholder="e.g. git status --short --branch"
                  />
                </label>
                <label className="field">
                  Category
                  <select
                    value={editor.command.category_id ?? ""}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        command: {
                          ...editor.command,
                          category_id: event.target.value || null,
                        },
                      })
                    }
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((category) => (
                      <option value={category.id} key={category.id}>
                        {category.name}
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

      <Dialog.Root
        open={categoryOpen}
        onOpenChange={(open) => {
          if (!saving) {
            setCategoryOpen(open);
            if (!open) setCategoryName("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog small-dialog">
            <div className="dialog-heading">
              <div>
                <Dialog.Title className="dialog-title">
                  New category
                </Dialog.Title>
                <Dialog.Description className="dialog-description">
                  Organize your commands by category.
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
            <form onSubmit={submitCategory}>
              <label className="field">
                Category name
                <input
                  required
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
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
                  disabled={saving || !categoryName.trim()}
                >
                  {saving ? "Saving…" : "Create category"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
