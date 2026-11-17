import { ChevronRight, Star, TerminalIcon } from "lucide-react";
import type { Command } from "../../types";

export function CommandCard({
  command,
  location,
  onEdit,
  onToggleFavorite,
  busy,
}: {
  command: Command;
  location?: string;
  onEdit: () => void;
  onToggleFavorite: () => void;
  busy: boolean;
}) {
  return (
    <div className="command-card">
      <button
        type="button"
        className="overflow-hidden px-2 py-3  flex-1 flex flex-col"
        onClick={onEdit}
      >
        <div className="flex gap-3 flex-1 justify-between">
          <div className="flex gap-3 items-center">
            <TerminalIcon size={18} aria-hidden="true" />
            <span className="command-content">
              <strong>{command.name}</strong>
            </span>
          </div>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              className={`favorite-button ${command.favorite ? "is-favorite" : ""}`}
              aria-label={`${command.favorite ? "Remove" : "Add"} ${command.name} ${command.favorite ? "from" : "to"} favorites`}
              aria-pressed={command.favorite}
              disabled={busy}
              onClick={onToggleFavorite}
            >
              <Star
                size={19}
                fill={command.favorite ? "currentColor" : "none"}
              />
            </button>
          </div>
        </div>
        <code className="text-left mt-2 truncate text-ellipsis overflow-hidden text-gray-400">
          {command.body}
        </code>
      </button>
    </div>
  );
}
