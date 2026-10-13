# Rust backend architecture

The backend keeps Tauri-facing code separate from Windows implementation details:

- `src/lib.rs` composes plugins and commands only.
- `src/commands/` is the IPC boundary. Commands resolve Tauri resources and turn
  platform errors into values that can be returned to the frontend.
- `src/platform/windows/` owns Win32 and WebView2 calls. Unsafe code must stay in
  this directory and be wrapped by a small safe function.
- `src/error.rs` contains backend errors. Convert them to strings or serialized
  command errors only at the IPC boundary.

The Windows platform plugin owns a `WindowsPlatformState`. Every webview-ready
event registers its host window in that state; duplicate registrations are ignored.
The plugin drop hook detaches remaining native resources as a final fallback.

## Three processes, one library

`desktime.exe` draws; `DTCore.exe` collects, stores and schedules; `DTSvc.exe`
starts and watches DTCore. All three link the same library and differ only in
their entry point, so a module belongs to whichever process owns its data.

- `src/ipc/` is the only channel between the UI and DTCore. `protocol.rs` holds
  the versioned frames and payloads; `pipe.rs` holds every `unsafe` call in the
  stack; `transport.rs` and `server.rs` deal in byte slices.
- Access control on that channel is the pipe's DACL, not the protocol's: it names
  SYSTEM and the owning user, so no frame carries a credential.
- `src/storage/` is DTCore's. **The UI must never open `desktime.db`**; it
  reaches every repository through a command that forwards to DTCore, and those
  commands are `async` so a wedged background process cannot freeze the windows.
- A schema change is a new entry in `migrations::MIGRATIONS`, never an edit to an
  existing one.

## Notes are containers, not paths

`src/note/` owns the `.dtnote` format and nothing else may write one.

- `container.rs` is the only reader and the only writer. Its `read` treats the
  archive as hostile input; its `write_atomic` builds a complete file beside the
  target, reads it back in full, and only then renames over the top.
- Every limit lives in `limits.rs`. Do not compare against a constant at a call
  site.
- The webview never receives a path to a picture. Bytes cross the boundary as
  base64 and become blob URLs, which is why the app carries no `protocol-asset`
  feature and no asset-protocol scope — there is nothing on disk for a rendered
  note to reach.
- `migration.rs` is the only code that reads a `.md`, it runs once, on a list the
  user approved, and it moves originals to the recycle bin rather than deleting
  them.

## The vault owns its own secrets

`src/vault/` is the only module that touches VEK or KEK material.

- No key type is `Serialize`, and no command returns one. What crosses to the
  frontend is a random session handle that means something only to this process
  and only until the vault is locked.
- Commands are `async` and run through `spawn_blocking`. A key derivation is
  deliberately slow and a rejected password waits longer each time; neither may
  happen on the thread that draws windows.
- `crypto.rs` dispatches on `format_version + cipher_id + kdf_id`. An unknown
  combination is `UNSUPPORTED_CRYPTO_VERSION` — never guessed at, never silently
  rewritten. Changing algorithm means a new version and an explicit migration.
- Iteration counts are read from the file, never from a constant. The constant
  is only what *new* envelopes are written with.
- Failure messages must not distinguish a wrong credential from corrupt data,
  and must not carry note names, file names or note text. Diagnostics that would
  are not written at all.

## A browser widget is hostile input with a window

`src/plugin/browser.rs` and `src/commands/browser.rs` are the only places that
decide what a remote page may do.

- Never add a `core:window:*` setter to `capabilities/plugin-browser.json`.
  Everything that moves the window goes through `browser_widget_control`, which
  checks the label and the token first; a permission granted directly to the
  window bypasses both.
- Never trust a URL that arrived from the page. Parse it, compare whole
  serialised origins, and act on the parsed value rather than re-parsing the
  string.
- `permits_navigation` and `authorize` must agree. The page can navigate itself
  without asking, so a destination the bridge would refuse must not become
  reachable by using `location =` instead.
- Anything injected into a remote page runs in every frame. Guard on
  `window.top !== window` before defining anything.
- The manifest's `allowedOrigins` is where a window may *go*; the capability's
  `remote.urls` is where it may *call from*. They are allowed to differ and
  currently do.

## Windows input and message rules

Use the narrowest API that matches the behavior:

1. Web content or browser shortcuts belong in WebView2. The platform plugin uses
   `on_webview_ready`, so static and dynamically-created webviews get the same
   configuration.
2. App-wide shortcuts should use Tauri's `global-shortcut` plugin. Do not use a
   low-level keyboard hook merely to implement a shortcut.
3. Window-specific native messages can use `SetWindowSubclass` / `DefSubclassProc`
   through `messages::SubclassRegistration`. Callback state is reference-counted,
   `WM_NCDESTROY` always reaches `DefSubclassProc`, and both explicit teardown and
   native window destruction release the callback state exactly once. A panicking
   message handler is caught at the FFI boundary and the message is forwarded.
4. `WH_KEYBOARD_LL` is reserved for features that genuinely need raw system-wide
   keyboard observation. If introduced, run it on a dedicated message-loop thread,
   keep the callback non-blocking, filter scope explicitly, and own `UnhookWindowsHookEx`
   in an RAII guard.

Add each native feature as a cohesive module rather than a shared catch-all message
procedure. This keeps feature state, registration, callback behavior, and teardown
reviewable together.

To consume a native message, add a small handler to the `MessageRouter`. Return
`MessageDisposition::Forward` unless the feature fully owns the message contract;
returning `Handled` prevents downstream subclass and default-window processing.

## Protected widget visibility

DeskTime windows reject unsolicited native minimize and hide requests so Windows
Show Desktop (`Win+D`) does not remove the widgets. The visibility policy covers
`SC_MINIMIZE`, `WM_SHOWWINDOW`, and `SWP_HIDEWINDOW`; closing and destruction are
always allowed through.

Application-driven visibility must go through the `set_window_visibility` command.
That command updates the window's expected visibility before Tauri asynchronously
dispatches `show` or `hide`. Native requests that contradict the expected state are
rejected. Frontend windows intentionally do not receive Tauri's direct show/hide
permissions, because those calls would bypass the expected-state policy.
