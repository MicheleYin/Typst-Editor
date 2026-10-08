# Platform build and signing guides

The GitHub Actions workflows produce unsigned artifacts for local signing:

| Platform | Workflow | Artifact |
| --- | --- | --- |
| Android | `.github/workflows/build-android.yml` | APK or AAB |
| iOS | `.github/workflows/build-ios.yml` | Unsigned Xcode archive |
| macOS | `.github/workflows/build-macos.yml` | arm64 app and DMG |
| Windows | `.github/workflows/build-windows.yml` | Unsigned MSIX and layout ZIP |

Start a build from the repository's **Actions** tab. Download the artifact from
the completed run; the per-platform guides below describe signing and local
testing.

- [iOS](IOS.md)
- [macOS](MACOS.md)
- [Windows and MSIX](WINDOWS.md)

Never commit signing certificates, private keys, or provisioning profiles.