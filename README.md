<div align="center">

# 🛡️ CyberVault

### A private, encrypted, cyberpunk-styled file vault for your most personal files.

*Lock your files behind a password. Keep them on your machine. Look cool doing it.*

</div>

---

> # ✨ Only made possible by **feris** ✨
> ### 💜 CyberVault is built on **feris's idea and imagination**, brought to life with **Claude's work**. 💜
> ### Want to say hi or support her? Here are her socials:
> # 👉 **[https://mez.ink/ferisooo](https://mez.ink/ferisooo)** 👈
>
> **None of this exists without feris. Please show her some love.** 💜

---

## 🤯 Why you'll want this

These are the "okay, I need this" features:

- 🔐 **Real, serious encryption** — your files are locked with **AES-256-GCM**
  (the same class of encryption banks and governments use) and your password is
  protected with **Argon2**, a modern, brute-force-resistant algorithm.
- 💻 **100% on your computer** — there is **no cloud, no account, no sign-up**.
  Your files never get uploaded anywhere. Ever.
- 🙈 **No backdoor, no master key** — *nobody* can open your vault but you. Not
  feris, not hackers, not anyone. (That also means: **don't forget your
  password** — there's no "reset password" because there's nothing to reset.)
- 🎨 **Gorgeous cyberpunk UI** — neon themes, animated backgrounds, and effects
  that make a "file folder" actually fun to open.
- 🗂️ **Stay organized** — sort everything into categories and find files fast.
- 🖼️ **Built-in viewer** — preview your images and files *inside* the vault, so
  they never sit unprotected on your desktop.
- 📱 **Phone access** — securely reach your vault from your phone over your
  **own home network** (optional — off until you turn it on).
- 🧪 **Integrity checks** — verify with one click that none of your files have
  been tampered with or corrupted.
- 🧹 **Trash & recovery** — deleted something by accident? Get it back.

---

## 🆚 How CyberVault is different

Most "secure folder" or "photo vault" apps ask you to trust *them*. CyberVault
is built so you don't have to:

| Other apps often... | CyberVault... |
|---------------------|---------------|
| Upload your files to "the cloud" | Keeps **everything on your device** |
| Make you create an account | **No account, no email, no login to us** |
| Track you with analytics/ads | **Collects nothing** — zero tracking |
| Hide their code | Is **fully open-source** — read every line |
| Can reset/recover your vault (so others can too) | Has **no backdoor** — only *you* hold the key |
| Look like boring office software | Looks like it belongs in a cyberpunk movie 😎 |

In short: **it's private because of how it's built, not because we promise to be
nice.** See the [Privacy Policy](./PRIVACY_POLICY.md) and
[Terms of Service](./TERMS_OF_SERVICE.md) for the full story.

---

## 🚀 Setup guide (for people who have *never* touched code)

Don't worry — you don't need to "know how to program." Just follow the steps in
order. ☕ Grab a drink; the first run takes a little while.

### Step 1 — Install the free tools CyberVault needs

CyberVault is built from source, so you need a few free building blocks first.
Install each one (just click the link, download, and run the installer with the
default options):

1. **Node.js** → <https://nodejs.org> — pick the button that says **"LTS"**.
2. **Rust** → <https://rustup.rs> — run the installer and accept the defaults.
3. **Git** → <https://git-scm.com/downloads> — accept the defaults.

> 💡 **Windows users:** you may also need the free
> [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
> **Mac users:** open the "Terminal" app and run `xcode-select --install`.
> **Linux users:** see the official list of system packages here →
> <https://tauri.app/start/prerequisites/>.

After installing, **restart your computer once** so everything is recognized.

### Step 2 — Download CyberVault

1. Open a terminal:
   - **Windows:** press the Start key, type **PowerShell**, press Enter.
   - **Mac:** open the **Terminal** app.
   - **Linux:** open your **Terminal**.
2. Copy and paste these lines **one at a time**, pressing Enter after each:

```bash
git clone https://github.com/ferisooo/CyberVault.git
cd CyberVault
```

### Step 3 — Install the app's parts

Paste this and press Enter (this downloads the pieces the app is made of):

```bash
npm install
```

### Step 4 — Launch CyberVault! 🎉

```bash
npm run tauri dev
```

> ⏱️ **The very first launch can take 5–15 minutes** while your computer builds
> the app. That's totally normal — it's only slow the *first* time. A window
> will pop open by itself when it's ready. Keep the terminal open while you use
> the app.

### Step 5 (optional) — Make a permanent app you can double-click

Once you're happy, you can build a real installable app:

```bash
npm run tauri build
```

The finished installer lands in `src-tauri/target/release/`.

> 🪟 **Windows shortcut:** there's a helper file called
> [`fresh-clone.bat`](./fresh-clone.bat) that downloads, installs, and launches
> everything for you. Copy it **out** of the project folder first, then
> double-click it.

---

## 🦠 "How do I know this isn't a virus?"

Great question — and you're right to be careful. The honest answer:
**CyberVault is open-source, so you don't have to trust anyone's word — you can
check for yourself (or have a tech-savvy friend check).** Here's exactly where
to look:

- 📜 **[`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md)** — plain-language promise that
  **nothing is collected** from you.
- 📜 **[`TERMS_OF_SERVICE.md`](./TERMS_OF_SERVICE.md)** — your rights and the
  legal terms.
- 🔐 **[`src-tauri/src/vault.rs`](./src-tauri/src/vault.rs)** — the **actual
  encryption code**. This is where your files get locked. You'll see it uses
  `aes-gcm` (AES-256) and `argon2` — real, well-known security libraries.
- 📱 **[`src-tauri/src/phone_server.rs`](./src-tauri/src/phone_server.rs)** —
  the **only** part that ever touches a network, and only for the optional phone
  feature on **your own** Wi-Fi.
- 🧩 **[`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs)** — the full list of
  everything the app is allowed to do.
- 📦 **[`package.json`](./package.json)** & **[`src-tauri/Cargo.toml`](./src-tauri/Cargo.toml)**
  — every single outside library the app uses, listed openly.

**Extra peace of mind:**

- Because you **build it yourself** from this readable source code (instead of
  running a mystery `.exe` from the internet), there's no hidden, pre-packaged
  program to sneak something in.
- The app has **no advertising and no analytics**.
- The **one** time it talks to the internet on its own is an *optional* check
  for new versions — it never sends your files or info.
- Want to be 100% sure it can't reach the internet at all? You can run it with
  your Wi-Fi turned off; your vault works fully offline.

> 🛡️ If you're still unsure, paste any of the files above into an AI assistant or
> show them to a developer friend and ask "does this do anything sketchy?" The
> code is short and readable on purpose.

---

## 🧰 Available commands (for the curious)

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start just the visual frontend in a browser |
| `npm run build` | Check and build the frontend |
| `npm run tauri dev` | Run the full desktop app (what you'll normally use) |
| `npm run tauri build` | Build the finished, installable desktop app |

---

## 📚 More reading

- [`ABOUT.md`](./ABOUT.md) — the story behind CyberVault.
- [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md) — what we collect (spoiler: nothing).
- [`TERMS_OF_SERVICE.md`](./TERMS_OF_SERVICE.md) — terms, and how to fork it.
- [`LICENSE`](./LICENSE) — the open-source license.

> 🔁 **Want to fork or remix CyberVault?** You're welcome to — just credit
> **feris's idea** and **Claude's work**. Details in the
> [Terms of Service](./TERMS_OF_SERVICE.md).

---

<div align="center">

### 💜 CyberVault — **feris's idea & imagination**, built with **Claude**. 💜
### 👉 [https://mez.ink/ferisooo](https://mez.ink/ferisooo) 👈

**Every part of this exists thanks to feris. If you love it, go support her.**

</div>
