<div align="center">

# Typst Editor

**Write [Typst](https://typst.app/) with a fast native editor, live preview, and project-first workflow.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri&logoColor=white)](https://tauri.app/)
[![Typst](https://img.shields.io/badge/Typst-powered-239DAD)](https://typst.app/)

*Desktop &amp; iOS — your `.typ` files stay on disk where you expect them.*

</div>

---

## Why Typst Editor?

Typst is a modern typesetting system made for the web era. **Typst Editor** wraps the official Typst engine in a small, native shell so you can focus on documents—not toolchain wrestling.

- **Live preview** — See your layout update as you type (SVG-based preview).
- **Real projects** — Open a folder; edits save straight to your filesystem (desktop). On iPhone and iPad, projects live in an app-managed space with import/export.
- **Exports** — Ship **PDF**, **SVG**, **PNG**, and **HTML** from your sources.
- **Comfortable editing** — [Monaco Editor](https://microsoft.github.io/monaco-editor/) with syntax highlighting, themes, and customizable shortcuts.
- **Rich previews** — Open Markdown, HTML, PDF, images, and more alongside your Typst files.
- **Fonts & packages** — Manage fonts, browse package cache, and tune the app in **Settings**.

Whether you’re drafting papers, slides, or templates, Typst Editor is built to stay out of your way.

---

## Features at a glance

| | |
| :--- | :--- |
| **Editor** | Monaco, multi-tab, quick actions, zoom & pan on preview |
| **Typst** | Native `typst` / `typst-pdf` / `typst-svg` / `typst-html` integration |
| **Workflow** | Sidebar file tree, new file / import / export project (ZIP) |
| **Platforms** | macOS, Windows, Linux (desktop); iOS builds via Tauri |
| **UX** | Light / dark appearance, window state, native menus on desktop |

---

## Tech stack

| Layer | Choice |
| ------ | ------ |
| **UI** | [Svelte 5](https://svelte.dev/), [Vite](https://vitejs.dev/), [Tailwind CSS v4](https://tailwindcss.com/) |
| **Shell** | [Tauri 2](https://tauri.app/) (Rust) |
| **Typesetting** | [Typst](https://github.com/typst/typst) crates (`typst`, `typst-pdf`, `typst-svg`, …) |

---

## Prerequisites

- **[Rust](https://www.rust-lang.org/tools/install)** (stable) and platform build tools for Tauri ([prerequisites](https://v2.tauri.app/start/prerequisites/))
- **[Bun](https://bun.sh/)** or **Node.js** (the dev/build commands in `tauri.conf.json` use Bun by default—you can adapt to `npm` / `pnpm` if you prefer)

Optional: run `bun run fonts:download` if you use bundled fonts (see `src-tauri/resources/fonts/bundled/README.md`).

---

## Getting started

```bash
# Install JS dependencies
bun install

# Run the app in development (starts Vite + Tauri)
bun run tauri dev
```

Frontend only (no native shell):

```bash
bun run dev
```

---

## Building

```bash
# Production bundle for your current OS (installer / app as configured in Tauri)
bun run tauri build
```

macOS convenience script: `bun run build:macos` (see `package.json` for variants).

For **macOS App Store** or **iOS** packaging, see `src-tauri/signing/LOCAL_APPSTORE_BUILD.md` and the `build:macos:appstore` / `build:ios:appstore` scripts in `package.json`.

---

## Project layout

```
├── src/                 # Svelte + TypeScript frontend
├── src-tauri/           # Rust backend, Tauri config, icons, resources
└── package.json         # Scripts and frontend dependencies
```

---

## Contributing

Contributions are welcome—issues, docs, and pull requests all help.

1. Fork the repo and create a branch for your change.
2. Run `bun run tauri dev` and verify desktop behavior.
3. Keep commits focused; match existing style where possible.
4. Open a PR with a short description of **what** and **why**.

If you’re unsure about scope, open an issue first and we can align on the approach.

---

## License

This project is released under the [MIT License](LICENSE).

---

## Acknowledgements

- [Typst](https://typst.app/) — typesetting engine and language  
- [Tauri](https://tauri.app/) — secure, lightweight native apps  
- [Monaco Editor](https://github.com/microsoft/monaco-editor) — the editor component  

<div align="center">

**Happy typesetting.**

</div>
