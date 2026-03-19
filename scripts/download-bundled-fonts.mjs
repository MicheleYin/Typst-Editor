#!/usr/bin/env node
/**
 * Download open-licensed font files into src-tauri/resources/fonts/bundled
 * to mirror typst.app-style coverage (see scripts/bundled-fonts-manifest.json).
 *
 * Usage:
 *   npm run fonts:download
 *   node scripts/download-bundled-fonts.mjs --dry-run
 *   node scripts/download-bundled-fonts.mjs --skip-emoji   # skips Noto Color Emoji (large)
 *   node scripts/download-bundled-fonts.mjs --only-archives=liberation,letesansmath
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readdir, copyFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MANIFEST = join(__dirname, "bundled-fonts-manifest.json");
const OUT = resolve(ROOT, "src-tauri/resources/fonts/bundled");
const GWFH_API = "https://gwfh.mranftl.com/api/fonts";

const FONT_EXT = /\.(ttf|otf|ttc|otc)$/i;

function parseArgs(argv) {
  const onlyArchivesArg = argv.find((a) => a.startsWith("--only-archives="));
  const onlyArchives = onlyArchivesArg
    ? onlyArchivesArg
        .slice("--only-archives=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  return {
    dryRun: argv.includes("--dry-run"),
    skipEmoji: argv.includes("--skip-emoji"),
    onlyArchives,
  };
}

async function fetchBuffer(url, label) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "typst-editor-fonts-download/1.0",
      accept: "*/*",
    },
  });
  if (!res.ok) {
    throw new Error(`${label}: HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function extractZipFiltered(buf, destDir, filterOpts) {
  const { pathFilter, pathSuffixes } = filterOpts ?? {};
  const directory = await unzipper.Open.buffer(buf);
  await mkdir(destDir, { recursive: true });
  for (const entry of directory.files) {
    if (entry.type !== "File") continue;
    const p = entry.path.replace(/\\/g, "/");
    const base = p.split("/").pop() ?? "";
    if (!FONT_EXT.test(base)) continue;
    if (pathSuffixes?.length) {
      const ok = pathSuffixes.some((s) => base.toLowerCase().endsWith(s.toLowerCase()));
      if (!ok) continue;
    }
    if (pathFilter) {
      const hit =
        p.includes(pathFilter) ||
        base.includes(pathFilter) ||
        base.startsWith(pathFilter);
      if (!hit) continue;
    }
    const target = join(destDir, base);
    const stream = entry.stream();
    await pipeline(stream, createWriteStream(target));
  }
}

async function extractZipAllFonts(buf, destDir) {
  return extractZipFiltered(buf, destDir, {});
}

function extractTarToTemp(archivePath, format, tmpDir) {
  mkdirSync(tmpDir, { recursive: true });
  const args =
    format === "tar.gz"
      ? ["-xzf", archivePath, "-C", tmpDir]
      : ["-xzf", archivePath, "-C", tmpDir];
  const r = spawnSync("tar", args, { stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error(`tar extract failed (${format})`);
  }
}

async function collectFontFiles(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await collectFontFiles(p, out);
    } else if (FONT_EXT.test(e.name)) {
      out.push(p);
    }
  }
}

async function copyFontsIntoBundle(subdir, fontPaths) {
  const destRoot = join(OUT, subdir);
  await mkdir(destRoot, { recursive: true });
  for (const fp of fontPaths) {
    const base = fp.split(/[/\\]/).pop();
    await copyFile(fp, join(destRoot, base));
  }
}

async function processArchive(arch, dryRun) {
  const { id, url, format, pathFilter, pathSuffixes } = arch;
  console.log(`\n[archive] ${id} <= ${url}`);
  if (dryRun) return;

  const buf = await fetchBuffer(url, id);
  const tmpRoot = join(OUT, `_tmp_${id}`);
  await rm(tmpRoot, { recursive: true, force: true });
  mkdirSync(tmpRoot, { recursive: true });

  if (format === "zip") {
    const extractDir = join(tmpRoot, "z");
    if (pathFilter || pathSuffixes?.length) {
      await extractZipFiltered(buf, extractDir, { pathFilter, pathSuffixes });
    } else {
      await extractZipAllFonts(buf, extractDir);
    }
    const found = [];
    await collectFontFiles(extractDir, found);
    await copyFontsIntoBundle(id, found);
  } else if (format === "tgz" || format === "tar.gz") {
    const arcPath = join(tmpRoot, format === "tgz" ? "a.tgz" : "a.tar.gz");
    writeFileSync(arcPath, buf);
    const extracted = join(tmpRoot, "t");
    mkdirSync(extracted, { recursive: true });
    extractTarToTemp(arcPath, "tar.gz", extracted);
    const found = [];
    await collectFontFiles(extracted, found);
    await copyFontsIntoBundle(id, found);
  } else {
    throw new Error(`Unknown archive format: ${format}`);
  }

  await rm(tmpRoot, { recursive: true, force: true });
  console.log(`  done -> ${join("fonts/bundled", id)}/`);
}

async function downloadGwfhFont(id, dryRun) {
  const metaUrl = `${GWFH_API}/${encodeURIComponent(id)}`;
  console.log(`\n[gwfh] ${id}`);
  if (dryRun) return;

  const res = await fetch(metaUrl, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`gwfh ${id}: HTTP ${res.status}`);
  }
  const meta = await res.json();
  const destDir = join(OUT, "gwfh", id);
  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });

  let n = 0;
  for (const v of meta.variants ?? []) {
    const ttf = v.ttf;
    if (!ttf) continue;
    const tail = ttf.split("/").pop()?.split("?")[0] ?? `face-${n}.ttf`;
    const safe = tail.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const outPath = join(destDir, `${v.id ?? n}-${safe}`);
    const data = await fetchBuffer(ttf, `${id}/${v.id}`);
    writeFileSync(outPath, data);
    n++;
  }
  if (n === 0) {
    console.warn(`  warning: no TTF variants for ${id}`);
  } else {
    console.log(`  ${n} file(s) -> fonts/bundled/gwfh/${id}/`);
  }
}

async function main() {
  const { dryRun, skipEmoji, onlyArchives } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

  let gwfhIds = [...manifest.googleWebfontsHelperIds];
  if (skipEmoji) {
    gwfhIds = gwfhIds.filter((x) => x !== "noto-color-emoji");
    console.log("--skip-emoji: omitting noto-color-emoji");
  }

  console.log(
    dryRun
      ? "Dry run: no files written."
      : `Writing font files under:\n  ${OUT}\n(existing subfolders are left in place; archives use stable subfolder names)`,
  );

  if (onlyArchives) {
    console.log(`--only-archives: ${onlyArchives.join(", ")}`);
  }

  const archivesToRun = onlyArchives?.length
    ? (manifest.archives ?? []).filter((a) => onlyArchives.includes(a.id))
    : manifest.archives ?? [];

  if (onlyArchives?.length && archivesToRun.length === 0) {
    console.error("No archives matched --only-archives (check manifest ids).");
    process.exit(1);
  }

  for (const arch of archivesToRun) {
    try {
      await processArchive(arch, dryRun);
    } catch (e) {
      console.error(`FAILED archive ${arch.id}:`, e?.message ?? e);
      process.exitCode = 1;
    }
  }

  if (onlyArchives) {
    console.log("\nSkipped google-webfonts-helper (--only-archives).");
  } else {
    for (const id of gwfhIds) {
      try {
        await downloadGwfhFont(id, dryRun);
        await new Promise((r) => setTimeout(r, 80));
      } catch (e) {
        console.error(`FAILED gwfh ${id}:`, e?.message ?? e);
        process.exitCode = 1;
      }
    }
  }

  console.log("\nManual / legal (not downloaded by this script):");
  for (const m of manifest.manual ?? []) {
    console.log(`  • ${m.families.join(", ")} — ${m.hint}`);
  }
  for (const n of manifest.notes ?? []) {
    console.log(`\nNote: ${n}`);
  }

  if (!dryRun && !process.exitCode) {
    console.log("\nNext: rebuild the app; Typst loads these via resources/fonts/bundled (recursive).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
