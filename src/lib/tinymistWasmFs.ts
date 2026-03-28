import * as monaco from "monaco-editor";
import { gunzipSync } from "fflate";

/** Virtual roots returned from TinyMist WASM `resolveFn` (must be stable POSIX paths). */
export const TINYMIST_VIRTUAL_PKG_ROOT = "/typst-editor-packages";

const DEFAULT_REGISTRY = "https://packages.typst.org";

function isTauriRuntime(): boolean {
  return typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis;
}

/** In Vite dev without Tauri, use same-origin proxy (see `vite.config.ts`) to avoid browser CORS on package downloads. */
function packageRegistryBaseUrl(): string {
  try {
    const dev = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;
    if (dev && !isTauriRuntime() && typeof globalThis !== "undefined" && "location" in globalThis) {
      const origin = (globalThis as unknown as { location?: { origin?: string } }).location?.origin;
      if (origin && /^https?:\/\//.test(origin)) {
        return `${origin}/typst-registry`;
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_REGISTRY;
}

const virtualBytes = new Map<string, Uint8Array>();
const loadedPreviewKeys = new Set<string>();
const loadInflight = new Map<string, Promise<void>>();

export type TinymistFileResult =
  | { type: "ok"; content: string }
  | { type: "err"; error: string };

export function bytesBase64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function previewPackageKey(namespace: string, name: string, version: string): string {
  return `${namespace}/${name}/${version}`;
}

function previewTarballUrl(namespace: string, name: string, version: string): string {
  const base = packageRegistryBaseUrl();
  return `${base}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}-${encodeURIComponent(version)}.tar.gz`;
}

/** USTAR tar parse (sufficient for Typst registry tarballs). */
function parseTarArchive(data: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  let p = 0;
  while (p + 512 <= data.length) {
    const block = data.subarray(p, p + 512);
    if (block[0] === 0) break;

    let name = asciiString(block, 0, 100);
    const sizeOct = asciiString(block, 124, 12).replace(/\0/g, "").trim();
    const size = parseInt(sizeOct, 8) || 0;
    const typeflag = block[156]!;

    const prefix = asciiString(block, 345, 155).replace(/\0/g, "");
    if (prefix) name = `${prefix}/${name}`;
    name = name.replace(/\\/g, "/").replace(/\0/g, "").trim();

    p += 512;
    if (size > 0 && p + size > data.length) break;

    const payload = new Uint8Array(data.buffer, data.byteOffset + p, size);
    if (typeflag !== 0 && typeflag !== 48) {
      // '0' or nul = regular file
    } else if (name && !name.endsWith("/")) {
      out.set(name, new Uint8Array(payload));
    }
    p += size;
    const pad = (512 - (size % 512)) % 512;
    p += pad;
  }
  return out;
}

function asciiString(u8: Uint8Array, start: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = u8[start + i]!;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function stripFirstPathSegment(entry: string): string | null {
  const parts = entry.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  parts.shift();
  return parts.join("/");
}

async function ensurePreviewPackageExtracted(namespace: string, name: string, version: string): Promise<void> {
  const key = previewPackageKey(namespace, name, version);
  if (loadedPreviewKeys.has(key)) return;
  const inflight = loadInflight.get(key);
  if (inflight) return inflight;

  const work = (async () => {
    const url = previewTarballUrl(namespace, name, version);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Package fetch ${res.status}: ${url}`);
    }
    const gz = new Uint8Array(await res.arrayBuffer());
    const raw = gunzipSync(gz);
    const entries = parseTarArchive(raw);
    const destRoot = `${TINYMIST_VIRTUAL_PKG_ROOT}/${namespace}/${name}/${version}`;

    for (const [tarPath, bytes] of entries) {
      const rel = stripFirstPathSegment(tarPath);
      if (!rel) continue;
      const full = `${destRoot}/${rel}`;
      virtualBytes.set(full, bytes);
    }
    loadedPreviewKeys.add(key);
  })().finally(() => {
    loadInflight.delete(key);
  });

  loadInflight.set(key, work);
  return work;
}

/**
 * Path TinyMist WASM should treat as the on-disk package root (virtual; bytes live in `virtualBytes`).
 */
export function wasmResolvePackage(spec: {
  namespace: string;
  name: string;
  version: string;
}): string | undefined {
  if (spec.namespace === "preview") {
    return `${TINYMIST_VIRTUAL_PKG_ROOT}/${spec.namespace}/${spec.name}/${spec.version}`;
  }
  return undefined;
}

function uriPathKey(uriStr: string): string {
  try {
    const u = new URL(uriStr);
    if (u.protocol === "file:") {
      return decodeURIComponent(u.pathname.replace(/^\/\/([A-Za-z]:)/, "$1"));
    }
    return uriStr;
  } catch {
    return uriStr;
  }
}

async function readVirtualOrPackageFile(uriStr: string): Promise<TinymistFileResult> {
  const key = uriPathKey(uriStr);
  if (key.startsWith(`${TINYMIST_VIRTUAL_PKG_ROOT}/`)) {
    const rest = key.slice(TINYMIST_VIRTUAL_PKG_ROOT.length + 1);
    const parts = rest.split("/").filter(Boolean);
    if (parts.length >= 3) {
      const ns = parts[0]!;
      const name = parts[1]!;
      const ver = parts[2]!;
      if (ns === "preview") {
        try {
          await ensurePreviewPackageExtracted(ns, name, ver);
        } catch (e) {
          return { type: "err", error: String(e) };
        }
      }
    }
    const bytes = virtualBytes.get(key);
    if (bytes) return { type: "ok", content: bytesBase64Encode(bytes) };
    return { type: "err", error: `Virtual file not in cache: ${key}` };
  }
  return { type: "err", error: "Not a virtual package path" };
}

async function readMonacoModel(uriStr: string): Promise<TinymistFileResult | null> {
  try {
    const uri = monaco.Uri.parse(uriStr);
    let model: monaco.editor.ITextModel | null = monaco.editor.getModel(uri);
    if (!model) {
      model =
        monaco.editor.getModels().find((m) => m.uri.toString() === uriStr) ??
        monaco.editor.getModels().find((m) => m.uri.path === uriStr) ??
        null;
    }
    if (!model) return null;
    const text = model.getValue();
    const enc = new TextEncoder().encode(text);
    return { type: "ok", content: bytesBase64Encode(enc) };
  } catch {
    return null;
  }
}

async function readTauriFs(uriStr: string): Promise<TinymistFileResult | null> {
  if (typeof globalThis === "undefined" || !("__TAURI_INTERNALS__" in globalThis)) return null;
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const path = uriPathKey(uriStr);
    if (!path || path.startsWith(`${TINYMIST_VIRTUAL_PKG_ROOT}/`)) return null;
    const bytes = await readFile(path);
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return { type: "ok", content: bytesBase64Encode(u8) };
  } catch {
    return null;
  }
}

/** Satisfies TinyMist `tinymist/fs/watch` reads (VS Code uses the same `FileResult` shape). */
export async function readUriForTinymist(uriStr: string): Promise<TinymistFileResult> {
  try {
    if (uriPathKey(uriStr).startsWith(`${TINYMIST_VIRTUAL_PKG_ROOT}/`)) {
      return readVirtualOrPackageFile(uriStr);
    }
  } catch {
    /* ignore URL parse errors */
  }

  if (uriStr.startsWith("untitled:") || uriStr.includes("untitled:")) {
    const fromMonaco = await readMonacoModel(uriStr);
    if (fromMonaco) return fromMonaco;
  }

  if (uriStr.startsWith("file:") || uriStr.startsWith("untitled:")) {
    const fromMonaco = await readMonacoModel(uriStr);
    if (fromMonaco) return fromMonaco;
  }

  const tauri = await readTauriFs(uriStr);
  if (tauri) return tauri;

  const fallbackMonaco = await readMonacoModel(uriStr);
  if (fallbackMonaco) return fallbackMonaco;

  return { type: "err", error: `Could not read ${uriStr}` };
}
