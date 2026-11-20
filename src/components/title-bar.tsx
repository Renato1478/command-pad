import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Maximize2, Minus, X } from "lucide-react";
import { useEffect, useState } from "react";
import logo from "../assets/termemo.svg";

const inTauri = "__TAURI_INTERNALS__" in globalThis;
const onMac = /Macintosh|Mac OS X/.test(navigator.userAgent);
const appWindow = inTauri ? getCurrentWindow() : null;

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!appWindow) return;
    let disposed = false;
    const sync = () => {
      appWindow.isMaximized().then(
        (value) => {
          if (!disposed) setMaximized(value);
        },
        () => {
          // Ignore windows that disappear while resizing.
        },
      );
    };
    sync();
    const unlisten = appWindow.onResized(sync);
    return () => {
      disposed = true;
      unlisten.then((stop) => stop());
    };
  }, []);

  return (
    <header
      className={onMac ? "title-bar title-bar-mac" : "title-bar"}
      data-tauri-drag-region
    >
      <div className="title-bar-brand" data-tauri-drag-region>
        <img className="title-bar-logo" src={logo} alt="" />
        <span className="title-bar-name">Termemo</span>
      </div>
      <div className="title-bar-drag" data-tauri-drag-region />
      {appWindow && !onMac && (
        <div className="window-controls">
          <button
            type="button"
            className="window-control"
            aria-label="Minimize"
            title="Minimize"
            onClick={() => void appWindow.minimize()}
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            className="window-control"
            aria-label={maximized ? "Restore" : "Maximize"}
            title={maximized ? "Restore" : "Maximize"}
            onClick={() => void appWindow.toggleMaximize()}
          >
            {maximized ? <Copy size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            className="window-control window-close"
            aria-label="Close"
            title="Close"
            onClick={() => void appWindow.close()}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </header>
  );
}
