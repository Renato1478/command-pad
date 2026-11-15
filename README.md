# Command Pad

A desktop command library built with Tauri 2, React, TanStack Router, Tailwind CSS, and Biome.

## Development

Install Node.js, Rust, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), then run:

```sh
npm install
npm run tauri dev
```

`npm run dev` runs a browser-only preview using localStorage. Its data is separate from the desktop application.

## Data

The desktop application stores `command_pad.json` in Tauri's application data directory. It starts empty and does not automatically import or modify data from the Iced project. Commands are saved as text; the app does not execute them.

Run `npm run build` to type-check and build the frontend, `npm run check` to run Biome, and `npm test` for the UI tests.
