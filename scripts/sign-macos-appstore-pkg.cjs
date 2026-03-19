#!/usr/bin/env node
/**
 * After `bun run build:macos:appstore`, builds a signed .pkg for App Store Connect upload
 * using xcrun productbuild (Mac Installer certificate).
 *
 * Requires:
 *   APPLE_MACOS_INSTALLER_SIGNING_IDENTITY — full name from Keychain, e.g.
 *     "3rd Party Mac Developer Installer: Your Name (XXXXXXXXXX)"
 *
 * Optional:
 *   SKIP_MACOS_APPSTORE_PKG=1 — skip this step (e.g. you only need the .app)
 *   MACOS_APPSTORE_PKG_OUT — output .pkg path (default: next to the .app in bundle/macos/)
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

if (String(process.env.SKIP_MACOS_APPSTORE_PKG || "").trim() === "1") {
  console.log("sign-macos-appstore-pkg: SKIP_MACOS_APPSTORE_PKG=1, skipping .pkg signing.");
  process.exit(0);
}

const root = path.join(__dirname, "..");
const tauriDir = path.join(root, "src-tauri");
const confPath = path.join(tauriDir, "tauri.conf.json");

const identity = (process.env.APPLE_MACOS_INSTALLER_SIGNING_IDENTITY || "").trim();
if (!identity) {
  console.error(
    "sign-macos-appstore-pkg: set APPLE_MACOS_INSTALLER_SIGNING_IDENTITY to your Mac Installer identity."
  );
  console.error('  Example: "3rd Party Mac Developer Installer: Your Name (TEAMID)"');
  console.error("  List identities: security find-identity -v");
  process.exit(1);
}

let productName;
try {
  const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
  productName = conf.productName;
} catch (e) {
  console.error("sign-macos-appstore-pkg: could not read productName from tauri.conf.json:", e.message);
  process.exit(1);
}
if (!productName) {
  console.error("sign-macos-appstore-pkg: tauri.conf.json missing productName.");
  process.exit(1);
}

const bundleDir = path.join(
  tauriDir,
  "target",
  "aarch64-apple-darwin",
  "release",
  "bundle",
  "macos"
);
const appPath = path.join(bundleDir, `${productName}.app`);

if (!fs.existsSync(appPath)) {
  console.error("sign-macos-appstore-pkg: app bundle not found:", appPath);
  console.error("  Run build:macos:appstore first (without SKIP_MACOS_APPSTORE_PKG during build).");
  process.exit(1);
}

const outPkg =
  (process.env.MACOS_APPSTORE_PKG_OUT || "").trim() ||
  path.join(bundleDir, `${productName.replace(/[/\\]/g, "-")}.pkg`);

const r = spawnSync(
  "xcrun",
  ["productbuild", "--sign", identity, "--component", appPath, "/Applications", outPkg],
  { stdio: "inherit", cwd: root }
);

if (r.status !== 0) {
  process.exit(r.status === null ? 1 : r.status);
}

console.log("sign-macos-appstore-pkg: wrote", path.relative(root, outPkg));
