#!/usr/bin/env node
/**
 * Tauri expects src-tauri/signing/MacAppStore.provisionprofile (see tauri.macos-appstore.json).
 * Either place the file there, or set MACOS_APPSTORE_PROVISIONPROFILE to the .provisionprofile
 * you downloaded from Apple Developer (this script copies it into place).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const tauriDir = path.join(root, "src-tauri");
const signingDir = path.join(tauriDir, "signing");
const dest = path.join(signingDir, "MacAppStore.provisionprofile");

if (fs.existsSync(dest)) {
  console.log("ensure-macos-appstore-provisionprofile:", path.relative(root, dest), "ok");
  process.exit(0);
}

const fromEnv = (process.env.MACOS_APPSTORE_PROVISIONPROFILE || "").trim();
if (fromEnv) {
  const src = path.isAbsolute(fromEnv) ? fromEnv : path.join(root, fromEnv);
  if (!fs.existsSync(src)) {
    console.error("ensure-macos-appstore-provisionprofile: MACOS_APPSTORE_PROVISIONPROFILE file not found:");
    console.error(" ", src);
    process.exit(1);
  }
  fs.mkdirSync(signingDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("ensure-macos-appstore-provisionprofile: copied to", path.relative(root, dest));
  process.exit(0);
}

console.error("ensure-macos-appstore-provisionprofile: missing Mac App Store provisioning profile.");
console.error("");
console.error("  Apple Developer → Profiles → create/download a Mac App Store Connect profile for this app’s bundle id,");
console.error("  then either:");
console.error("");
console.error('    cp /path/to/downloaded.provisionprofile src-tauri/signing/MacAppStore.provisionprofile');
console.error("");
console.error("  or:");
console.error("");
console.error("    export MACOS_APPSTORE_PROVISIONPROFILE=/path/to/downloaded.provisionprofile");
console.error("    bun run build:macos:appstore");
console.error("");
process.exit(1);
