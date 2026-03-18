#!/usr/bin/env node
/**
 * Xcode build phase: forwards to @tauri-apps/cli. Named .cjs so Node treats this as
 * CommonJS even when the repo root has "type": "module" (Node 20+ would otherwise error on require).
 */
const path = require("path");
const { spawnSync } = require("child_process");

// __dirname = .../src-tauri/gen/apple → two levels up = src-tauri (Tauri cwd)
const srcTauriDir = path.resolve(__dirname, "..", "..");
// One more up = repo root (typst-editor/), where node_modules lives
const cli = path.resolve(
  srcTauriDir,
  "..",
  "node_modules",
  "@tauri-apps",
  "cli",
  "tauri.js"
);

// Tauri's ios xcode-script does `cd "$(pwd)"/../..` expecting cwd = gen/apple.
// If cwd is already src-tauri, that lands on the wrong folder (e.g. Documents) and
// the CLI loads another app's config + wrong/missing *-server-addr file.
const args = process.argv.slice(2);
const isIosXcodeScript =
  args[0] === "ios" && args[1] === "xcode-script";
const cwd = isIosXcodeScript ? __dirname : srcTauriDir;

const r = spawnSync(process.execPath, [cli, ...args], {
  stdio: "inherit",
  cwd,
  env: process.env,
});

process.exit(r.status === null ? 1 : r.status);
