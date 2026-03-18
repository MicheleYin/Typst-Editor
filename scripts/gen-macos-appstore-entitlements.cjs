/**
 * Generates src-tauri/Entitlements.macos-appstore.plist from the template
 * using environment variables (for safe git — no team IDs in the repo).
 *
 * Required (either):
 *   APPLE_TEAM_ID          — 10-character Team ID (Membership page)
 *   APPLE_DEVELOPMENT_TEAM — same value (Xcode-style name)
 *
 * Optional:
 *   APPLE_BUNDLE_ID — defaults to identifier from src-tauri/tauri.conf.json
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const tauriDir = path.join(root, "src-tauri");
const templatePath = path.join(tauriDir, "Entitlements.macos-appstore.plist.template");
const outPath = path.join(tauriDir, "Entitlements.macos-appstore.plist");
const confPath = path.join(tauriDir, "tauri.conf.json");

const team = (process.env.APPLE_TEAM_ID || process.env.APPLE_DEVELOPMENT_TEAM || "").trim();
if (!team) {
  console.error(
    "gen-macos-appstore-entitlements: set APPLE_TEAM_ID or APPLE_DEVELOPMENT_TEAM (10-character Apple Team ID)."
  );
  process.exit(1);
}
if (!/^[A-Z0-9]{10}$/i.test(team)) {
  console.error(
    "gen-macos-appstore-entitlements: team id must be 10 letters/digits (check Apple Developer → Membership)."
  );
  process.exit(1);
}

let bundleId = (process.env.APPLE_BUNDLE_ID || "").trim();
if (!bundleId) {
  const raw = fs.readFileSync(confPath, "utf8");
  const conf = JSON.parse(raw);
  bundleId = conf.identifier;
}
if (!bundleId) {
  console.error("gen-macos-appstore-entitlements: no bundle id (tauri.conf.json identifier or APPLE_BUNDLE_ID).");
  process.exit(1);
}

let tpl = fs.readFileSync(templatePath, "utf8");
tpl = tpl.replace(/__APPLE_TEAM_ID__/g, team.toUpperCase());
tpl = tpl.replace(/__APPLE_BUNDLE_ID__/g, bundleId);

fs.writeFileSync(outPath, tpl);
console.log("gen-macos-appstore-entitlements: wrote", path.relative(root, outPath));
