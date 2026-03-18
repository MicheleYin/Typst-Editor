#!/usr/bin/env node
/**
 * Tauri CLI wrapper: Cursor/CI often set CI=1, which breaks the Tauri CLI
 * (`--ci` only accepts true/false). Unset CI so `tauri build`, `tauri ios build`, etc. work.
 */
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const cli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const env = { ...process.env };
delete env.CI;

const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: root,
  env,
});

process.exit(r.status === null ? 1 : r.status);
