# App-bundled fonts

Place `.ttf`, `.otf`, `.ttc`, or `.otc` files here (any subfolder). They are shipped with the app (Tauri `bundle.resources`) and loaded by the Typst compiler **in addition to** embedded fonts from `typst-assets` (e.g. Libertinus Serif subset, New Computer Modern, DejaVu Sans Mono).

## typst.app–style bundle (automated)

To download a large open-licensed set aligned with the typst.app web font list (see `scripts/bundled-fonts-manifest.json`):

```bash
npm install
npm run fonts:download
```

Options:

- `node scripts/download-bundled-fonts.mjs --dry-run` — print plan only
- `node scripts/download-bundled-fonts.mjs --skip-emoji` — skip **Noto Color Emoji** (very large)
- `node scripts/download-bundled-fonts.mjs --only-archives=liberation,letesansmath` — re-fetch selected archive ids from `bundled-fonts-manifest.json` only

Fonts that cannot be fetched automatically (license/login/geo) are listed at the end of the script and in the `manual` section of the manifest — add those `.ttf`/`.otf` files yourself under subfolders here.

**Licensing:** Only ship fonts you are allowed to redistribute. The script uses SIL/OFL and similar open fonts from CTAN, GitHub, SourceForge, and [google-webfonts-helper](https://gwfh.mranftl.com/).

**Git / repo size:** Font binaries are large. You may add `*.ttf` / `*.otf` under this tree to `.gitignore` and run `npm run fonts:download` in CI or before `tauri build`.

## User-imported fonts

The app can also copy fonts into app storage (see Settings); those are merged at compile time with this folder and `typst-assets`.
