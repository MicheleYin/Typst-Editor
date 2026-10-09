#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const archiveArg = process.argv[2];

function fail(message) {
  console.error(`export-ios-appstore: ${message}`);
  process.exit(1);
}

if (!archiveArg || process.argv.length !== 3) {
  fail("Usage: bun run export:ios:appstore -- <Typst Editor.xcarchive>");
}

const archivePath = path.resolve(archiveArg);
if (!archivePath.endsWith(".xcarchive")) {
  fail("archive folder must end in .xcarchive; rename the extracted artifact folder first");
}
if (!fs.existsSync(path.join(archivePath, "Info.plist"))) {
  fail(`archive Info.plist not found: ${archivePath}`);
}

const config = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8")
);
const appPath = path.join(
  archivePath,
  "Products",
  "Applications",
  `${config.productName}.app`
);
if (!fs.existsSync(appPath)) fail(`archived app not found: ${appPath}`);

const bundleIdResult = spawnSync(
  "/usr/libexec/PlistBuddy",
  ["-c", "Print :CFBundleIdentifier", path.join(appPath, "Info.plist")],
  { encoding: "utf8" }
);
if (bundleIdResult.status !== 0) fail(`could not read bundle ID from ${appPath}`);
if (bundleIdResult.stdout.trim() !== config.identifier) {
  fail(
    `bundle ID mismatch: expected ${config.identifier}, got ${bundleIdResult.stdout.trim() || "(empty)"}`
  );
}

const teamId = (
  process.env.APPLE_TEAM_ID || process.env.APPLE_DEVELOPMENT_TEAM || ""
).trim();
if (!/^[A-Z0-9]{10}$/i.test(teamId)) {
  fail("set APPLE_TEAM_ID to your 10-character Apple Developer Team ID");
}

const outputSetting = (process.env.IOS_APPSTORE_EXPORT_DIR || "").trim();
const outputPath = path.resolve(
  outputSetting || path.join(path.dirname(archivePath), "Typst Editor App Store Export")
);
if (fs.existsSync(outputPath) && fs.readdirSync(outputPath).length > 0) {
  fail(`export folder is not empty: ${outputPath}; set IOS_APPSTORE_EXPORT_DIR to a new folder`);
}
fs.mkdirSync(outputPath, { recursive: true });

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "typst-editor-ios-export-"));
const exportOptionsPath = path.join(tempDir, "ExportOptions.plist");
process.on("exit", () => fs.rmSync(tempDir, { recursive: true, force: true }));
fs.writeFileSync(
  exportOptionsPath,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>destination</key><string>export</string>
  <key>method</key><string>app-store-connect</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>${teamId.toUpperCase()}</string>
</dict></plist>
`
);

const result = spawnSync(
  "/usr/bin/xcodebuild",
  [
    "-exportArchive",
    "-archivePath",
    archivePath,
    "-exportPath",
    outputPath,
    "-exportOptionsPlist",
    exportOptionsPath,
    "-allowProvisioningUpdates",
  ],
  { stdio: "inherit", cwd: root }
);
if (result.error) fail(`xcodebuild failed: ${result.error.message}`);
if (result.status !== 0) process.exit(result.status ?? 1);

function findIpa(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".ipa")) return candidate;
    if (entry.isDirectory()) {
      const found = findIpa(candidate);
      if (found) return found;
    }
  }
  return null;
}

const ipaPath = findIpa(outputPath);
if (!ipaPath) fail(`xcodebuild completed but no .ipa was found in ${outputPath}`);
console.log("export-ios-appstore: wrote", ipaPath);