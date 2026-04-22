# Build Instructions

## Prerequisites

### 1. Node.js

Version **18 or higher** (tested on v25).

- **macOS (Homebrew):** `brew install node`
- **Windows/Linux:** https://nodejs.org/en/download

Verify: `node --version`

---

### 2. Rust + Cargo

Minimum version: **1.77.2** (tested on 1.94).

Install via rustup (recommended):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After install, restart terminal or run:

```bash
source $HOME/.cargo/env
```

Verify: `rustc --version` and `cargo --version`

---

### 3. Platform-specific dependencies

#### macOS

Xcode Command Line Tools:

```bash
xcode-select --install
```

#### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

#### Windows

- Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (select "Desktop development with C++")
- Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 10/11)

---

## Build

### Clone the repository

```bash
git clone https://github.com/rprokhorov/Mammoth.git
cd Mammoth
```

### Install npm dependencies

```bash
npm install
```

### Production build

```bash
npm run tauri build
```

The built app and installer will be in:

- **macOS:** `src-tauri/target/release/bundle/macos/Mattermost Desktop.app`
  and `src-tauri/target/release/bundle/dmg/`
- **Linux:** `src-tauri/target/release/bundle/deb/` and `appimage/`
- **Windows:** `src-tauri/target/release/bundle/msi/` and `nsis/`

---

## Development mode

Runs the frontend dev server + Tauri window with hot reload:

```bash
npm run tauri dev
```

---

---

## Release

A release consists of: bumping the version, building the app, committing, tagging, and publishing a GitHub release with the built artifacts.

### 1. Bump the version

Choose the bump type — `patch` (bug fixes), `minor` (new features), `major` (breaking changes):

```bash
npm run version:patch   # e.g. 0.3.0 → 0.3.1
npm run version:minor   # e.g. 0.3.0 → 0.4.0
npm run version:major   # e.g. 0.3.0 → 1.0.0
```

This script:
- Updates `package.json` and `src-tauri/tauri.conf.json` with the new version
- Creates a commit: `chore: bump version to X.Y.Z`
- Creates a git tag: `vX.Y.Z`

### 2. Build the app

```bash
npm run tauri build
```

Wait for the build to complete. Artifacts will be in:

| Platform | Path |
|----------|------|
| macOS `.app` | `src-tauri/target/release/bundle/macos/Mattermost Desktop.app` |
| macOS `.dmg` | `src-tauri/target/release/bundle/dmg/*.dmg` |
| Linux `.deb` | `src-tauri/target/release/bundle/deb/*.deb` |
| Linux `.AppImage` | `src-tauri/target/release/bundle/appimage/*.AppImage` |
| Windows `.msi` | `src-tauri/target/release/bundle/msi/*.msi` |
| Windows NSIS | `src-tauri/target/release/bundle/nsis/*.exe` |

### 3. Publish the GitHub release

Push the commit and tag, then create the release with artifacts:

```bash
# Push commit and tag
git push origin main --tags

# Create GitHub release and attach artifacts (macOS example)
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes "Release notes here" \
  src-tauri/target/release/bundle/dmg/*.dmg \
  src-tauri/target/release/bundle/macos/*.app.tar.gz
```

Replace `vX.Y.Z` with the actual version (e.g. `v0.3.1`).

**Full example for v0.3.1:**

```bash
npm run version:patch
npm run tauri build
git push origin main --tags
gh release create v0.3.1 \
  --title "v0.3.1" \
  --notes "$(cat CHANGELOG.md | head -50)" \
  src-tauri/target/release/bundle/dmg/*.dmg
```

> Requires [GitHub CLI](https://cli.github.com/) (`brew install gh`) and authentication (`gh auth login`).

---

## Notes

- First build takes longer (~5–10 min) — Cargo downloads and compiles all Rust dependencies.
- Subsequent builds are fast thanks to incremental compilation.
- The `docker/postgres/` directory (local test server data) is intentionally excluded from the repository.
