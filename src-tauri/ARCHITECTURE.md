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
