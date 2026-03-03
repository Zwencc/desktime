# DeskTime

DeskTime is a Windows desktop companion prototype built with React, Vite, and Tauri. On Windows, Tauri uses Microsoft Edge WebView2, so the UI can stay close to normal web development while running as a small desktop app.

## Features

- Beijing time display using the `Asia/Shanghai` time zone instead of the current system time zone.
- Temporary desktop notepad with automatic local persistence.
- Local schedule list with date, time, completion state, and deletion.
- Tauri desktop shell configured for a transparent, borderless WebView2 window.

## Development

Install dependencies:

```powershell
npm install
```

Run the web prototype:

```powershell
npm run dev
```

Run the Tauri desktop app:

```powershell
npm run tauri:dev
```

Tauri requires Rust and the Windows build prerequisites. If `cargo` is not available, install Rust first:

https://www.rust-lang.org/tools/install

## GitHub Setup

This folder can be pushed to GitHub after a remote repository exists:

```powershell
git init
git add .
git commit -m "Initial DeskTime prototype"
git branch -M main
git remote add origin https://github.com/<your-user>/desktime.git
git push -u origin main
```

If GitHub CLI is installed and authenticated, the remote can be created from this folder:

```powershell
gh repo create desktime --public --source . --remote origin --push
```
