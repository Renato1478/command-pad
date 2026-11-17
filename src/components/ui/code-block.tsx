import { Check, Copy, Terminal, WrapText } from "lucide-react";
import { useState } from "react";

export function CodeBlock({ value }: { value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const [wrap, setWrap] = useState(true);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-title">
          <Terminal size={15} aria-hidden="true" /> Command
        </span>
        <div className="code-block-actions">
          <button
            type="button"
            className="code-block-copy"
            aria-label="Wrap lines"
            aria-pressed={wrap}
            title="Wrap lines"
            onClick={() => setWrap(!wrap)}
          >
            <WrapText size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="code-block-copy"
            onClick={copy}
            aria-label="Copy command"
            title="Copy command"
          >
            {status === "copied" ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: The pre is the named scrollable code region. */}
      <pre
        className={`code-block-content ${wrap ? "is-wrapped" : ""}`}
        role="region"
        aria-label="Command text"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll long commands.
        tabIndex={0}
        dir="ltr"
      >
        <code>{value}</code>
      </pre>
      <span className="sr-only" role="status">
        {status === "copied"
          ? "Copied"
          : status === "error"
            ? "Could not copy command"
            : ""}
      </span>
    </div>
  );
}
