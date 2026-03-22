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

/** Content for newly created .typ files (empty document). */
export function defaultNewFileContent(): string {
  return "";
}
