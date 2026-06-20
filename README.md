<div align="center">

# 🛡️ CyberVault

### A private, encrypted, cyberpunk-styled file vault built with Tauri + React.

</div>

---

> # ✨ Only made possible by **feris** ✨
> ### 💜 This project was **only made possible by feris**. 💜
> ### If you'd like to contact her, here are her socials:
> # 👉 **[https://mez.ink/ferisooo](https://mez.ink/ferisooo)** 👈
>
> **Please show her some love — none of this exists without feris.**

---

## 📖 About

CyberVault is a desktop application for keeping your files private and secure
behind a password-protected, locally-encrypted vault. It features a polished
cyberpunk/neon interface, category organization, a built-in viewer, phone
access, integrity checks, and more. See [`ABOUT.md`](./ABOUT.md) for the full
story.

---

## ✅ Requirements

Before you can run CyberVault, make sure you have **all** of the following
installed on your machine:

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Git** | latest | Needed to clone/pull the repository |
| **Node.js** | 18 LTS or newer | Includes `npm`. Download: <https://nodejs.org> |
| **Rust + Cargo** | latest stable | Install via <https://rustup.rs> (Tauri backend) |
| **Tauri prerequisites** | OS-specific | See below |

### Operating-system specific Tauri prerequisites

Tauri needs a few native libraries depending on your OS:

- **Windows** — [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  and [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
  (WebView2 ships with Windows 10/11 by default).
- **macOS** — Xcode Command Line Tools: `xcode-select --install`
- **Linux** — `webkit2gtk`, `libgtk-3-dev`, `libayatana-appindicator3-dev`,
  `librsvg2-dev` and `build-essential` (package names vary by distro).

> 📚 Full, up-to-date prerequisite list:
> <https://tauri.app/start/prerequisites/>

---

## 🚀 Tutorial: Get CyberVault running

### 1. Clone (pull) the repository from GitHub

```bash
# Clone the project
git clone https://github.com/ferisooo/CyberVault.git

# Move into the project folder
cd CyberVault
```

If you already cloned it before and just want the **latest changes**, pull
instead of cloning:

```bash
cd CyberVault
git pull origin main
```

> 💡 To grab a specific branch:
> ```bash
> git clone --branch <branch-name> https://github.com/ferisooo/CyberVault.git
> ```

### 2. Install the dependencies

```bash
npm install
```

### 3. Run the app in development mode

```bash
npm run tauri dev
```

> ⏱️ The **first** run compiles the Rust backend and can take **5–15 minutes**.
> The app window opens automatically when it's ready. Leave the terminal open
> while using the app.

### 4. Build a production release (optional)

```bash
npm run tauri build
```

The packaged installer/binary will be placed in `src-tauri/target/release/`.

---

## 🪟 Windows one-click option

Windows users can use the included **[`fresh-clone.bat`](./fresh-clone.bat)**
helper which deletes any old copy, clones a fresh one from `main`, installs
dependencies, and launches the app automatically. Copy it **out** of the
project folder first, then double-click it.

---

## 🧰 Available scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite frontend dev server only |
| `npm run build` | Type-check and build the frontend |
| `npm run tauri dev` | Run the full desktop app in development |
| `npm run tauri build` | Build the production desktop app |
