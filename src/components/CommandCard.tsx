import { ChevronRight, Star } from "lucide-react";
import type { Command } from "../types";

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
        className={`favorite-button ${command.favorite ? "is-favorite" : ""}`}
        aria-label={`${command.favorite ? "Remove" : "Add"} ${command.name} ${command.favorite ? "from" : "to"} favorites`}
        aria-pressed={command.favorite}
        disabled={busy}
        onClick={onToggleFavorite}
      >
        <Star size={19} fill={command.favorite ? "currentColor" : "none"} />
      </button>
      <button type="button" className="command-edit" onClick={onEdit}>
        <span className="command-content">
          <strong>{command.name}</strong>
          <code>{command.body}</code>
          {location && <span className="command-location">{location}</span>}
        </span>
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
