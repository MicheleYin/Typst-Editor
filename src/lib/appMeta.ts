import { getName } from "@tauri-apps/api/app";
import pkg from "../../package.json";

/** Matches Tauri `productName` when running in the app; falls back for Vite dev / browser. */
export async function fetchAppDisplayName(): Promise<string> {
  try {
    return await getName();
  } catch {
    return pkg.name;
  }
}

export function defaultNewFileContent(appName: string): string {
  return `// Welcome to ${appName}!

= Introduction
In this editor, you can write *Typst* code and see the live preview on the right.

== Features
- Monaco Editor integration
- Live SVG preview
- Basic syntax highlighting

#set text(fill: blue)
#lorem(20)

$ x^2 + y^2 = r^2 $
`;
}
