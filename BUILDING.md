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

## Notes

- First build takes longer (~5–10 min) — Cargo downloads and compiles all Rust dependencies.
- Subsequent builds are fast thanks to incremental compilation.
- The `docker/postgres/` directory (local test server data) is intentionally excluded from the repository.
