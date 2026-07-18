//! Plugin backends: one child process each, JSON-RPC 2.0 over stdio.
//!
//! # Why this protocol
//!
//! Not because it is the simplest thing that could work — newline-delimited
//! JSON would be simpler. Because it is the one a plugin author already has a
//! library for: this is exactly how LSP frames its messages, so Python has
//! `pygls`, Node has `vscode-jsonrpc`, Rust has `lsp-server`, and C++ has
//! several. A plugin author should be reading their language's docs, not ours.
//!
//! # Why stdio
//!
//! A named pipe needs a security descriptor and a local socket needs a port and
//! an answer to "who else can connect". stdio needs neither: the channel is
//! created by the act of spawning, nobody else can reach it, and when the
//! process dies the pipe closes and every pending call fails at once. Ten lines
//! in any language.
//!
//! # What it cannot do
//!
//! It cannot sandbox. The child runs as the user, with the user's rights, and
//! nothing here changes that — the `permissions` in a manifest are enforced for
//! the plugin's *webview* and are advisory for its backend. Installing a plugin
//! with a backend is, in trust terms, running a program. That is written down
//! here and shown in the plugin list rather than papered over, because a
//! sandbox that does not hold is worse than none: it invites the trust it
//! cannot deserve.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use super::manifest::Manifest;

/// A call that gets no answer in this long fails, rather than holding the UI
/// thread that is waiting on the IPC reply.
const CALL_TIMEOUT: Duration = Duration::from_secs(5);

/// Stop restarting after this many crashes in a row. A backend that cannot stay
/// up will not be fixed by a fourth try, and the log fills with the same error.
pub const MAX_RESTARTS: u32 = 3;

/// A notification pushed by a backend, on its way to that plugin's windows.
pub struct Event {
    pub plugin: String,
    pub name: String,
    pub payload: Value,
}

type Pending = Arc<(Mutex<HashMap<i64, Option<Result<Value, String>>>>, Condvar)>;

pub struct BackendProcess {
    child: Child,
    stdin: ChildStdin,
    next_id: AtomicI64,
    pending: Pending,
}

impl BackendProcess {
    /// Spawns the child and starts the reader thread.
    ///
    /// `on_event` is called from the reader thread for every notification the
    /// backend sends; it is how a plugin pushes data without being asked.
    pub fn spawn(
        manifest: &Manifest,
        dir: &std::path::Path,
        log: std::path::PathBuf,
        on_event: impl Fn(Event) + Send + 'static,
    ) -> Result<Self, String> {
        let backend = manifest
            .backend
            .as_ref()
            .ok_or_else(|| "plugin declares no backend".to_owned())?;

        // A path is resolved inside the plugin; a bare name is left for the OS
        // to find on PATH, which is what makes `"command": "python"` work.
        let program = if backend.command.contains(['/', '\\']) {
            super::manifest::resolve_inside(dir, &backend.command)
                .ok_or_else(|| "backend command points outside the plugin folder".to_owned())?
        } else {
            std::path::PathBuf::from(&backend.command)
        };

        let mut command = Command::new(program);
        command
            .args(&backend.args)
            .current_dir(dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // A console program started from a GUI process gets a console window of
        // its own, and `python main.py` is a console program — so a black box
        // appears beside the widget and stays there for the life of the backend.
        //
        // The host does this rather than asking plugin authors to: it is the
        // same flag for every backend, in every language, and a plugin that
        // forgets it produces a bug the user blames on DeskTime. `pythonw.exe`
        // would fix this one plugin and nothing else.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;

            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command
            .spawn()
            .map_err(|error| format!("backend would not start: {error}"))?;

        let mut stdin = child.stdin.take().ok_or("backend has no stdin")?;
        let stdout = child.stdout.take().ok_or("backend has no stdout")?;
        let stderr = child.stderr.take().ok_or("backend has no stderr")?;

        let pending: Pending = Arc::new((Mutex::new(HashMap::new()), Condvar::new()));
        let plugin_id = manifest.id.clone();

        // Reader: replies wake whoever is waiting, notifications go to the host.
        {
            let pending = Arc::clone(&pending);
            std::thread::spawn(move || {
                let mut reader = BufReader::new(stdout);
                while let Some(message) = read_message(&mut reader) {
                    match message.get("id").and_then(Value::as_i64) {
                        Some(id) => {
                            let result = match message.get("error") {
                                Some(error) => Err(error.to_string()),
                                None => Ok(message.get("result").cloned().unwrap_or(Value::Null)),
                            };
                            let (lock, condvar) = &*pending;
                            if let Ok(mut waiting) = lock.lock() {
                                if let Some(slot) = waiting.get_mut(&id) {
                                    *slot = Some(result);
                                    condvar.notify_all();
                                }
                            }
                        }
                        None => {
                            if let Some(name) = message.get("method").and_then(Value::as_str) {
                                on_event(Event {
                                    plugin: plugin_id.clone(),
                                    name: name.to_owned(),
                                    payload: message.get("params").cloned().unwrap_or(Value::Null),
                                });
                            }
                        }
                    }
                }

                // The pipe closed: the backend is gone. Everything still waiting
                // would otherwise wait out its full timeout for an answer that
                // can never come.
                let (lock, condvar) = &*pending;
                if let Ok(mut waiting) = lock.lock() {
                    for slot in waiting.values_mut() {
                        if slot.is_none() {
                            *slot = Some(Err("backend exited".to_owned()));
                        }
                    }
                    condvar.notify_all();
                }
            });
        }

        // stderr is a plugin's only way to say anything about itself when it is
        // too broken to speak the protocol, so it is kept.
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                if let Some(parent) = log.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if let Ok(mut file) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log)
                {
                    let _ = writeln!(file, "{line}");
                }
            }
        });

        // The protocol's first message, and the one a backend does its own setup
        // in: both sample backends start their push thread here, and prime the
        // CPU counters that mean nothing until they have been read twice. Without
        // it a plugin answers calls and never pushes anything, which looks
        // exactly like a widget somebody forgot to finish.
        //
        // Sent without waiting for the answer. `ensure_backend` runs on the main
        // thread — a plain Tauri command does — and a backend that spends a
        // second importing its libraries would be a second of frozen desktop.
        // Nothing is registered as pending for this id, so the reader thread
        // finds no slot for the reply and drops it. Ordering still holds: stdin
        // is a stream, so the backend reads this before any call that follows.
        let _ = write_message(
            &mut stdin,
            &json!({ "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {} }),
        );

        Ok(Self {
            child,
            stdin,
            next_id: AtomicI64::new(1),
            pending,
        })
    }

    /// One request, one answer, or an error — never an indefinite wait.
    pub fn call(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);

        {
            let (lock, _) = &*self.pending;
            lock.lock()
                .map_err(|_| "plugin call state poisoned".to_owned())?
                .insert(id, None);
        }

        let request = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        if let Err(error) = write_message(&mut self.stdin, &request) {
            let (lock, _) = &*self.pending;
            if let Ok(mut waiting) = lock.lock() {
                waiting.remove(&id);
            }
            return Err(format!("backend is not accepting input: {error}"));
        }

        let (lock, condvar) = &*self.pending;
        let deadline = Instant::now() + CALL_TIMEOUT;
        let mut waiting = lock.lock().map_err(|_| "plugin call state poisoned".to_owned())?;

        loop {
            match waiting.get(&id) {
                Some(Some(_)) => {
                    let answer = waiting.remove(&id).flatten();
                    return answer.unwrap_or_else(|| Err("backend gave no answer".to_owned()));
                }
                _ => {
                    let remaining = deadline.saturating_duration_since(Instant::now());
                    if remaining.is_zero() {
                        waiting.remove(&id);
                        return Err("backend did not answer in time".to_owned());
                    }
                    let (guard, _) = condvar
                        .wait_timeout(waiting, remaining)
                        .map_err(|_| "plugin call state poisoned".to_owned())?;
                    waiting = guard;
                }
            }
        }
    }

    /// Asks the backend to stop, then makes sure of it.
    ///
    /// The kill is not optional politeness: a plugin that spawns its own helpers
    /// — `python main.py` starting a worker — leaves them orphaned otherwise, and
    /// the user closes DeskTime to find processes still in the task manager.
    pub fn shutdown(&mut self) {
        let _ = write_message(
            &mut self.stdin,
            &json!({ "jsonrpc": "2.0", "id": 0, "method": "shutdown", "params": {} }),
        );

        for _ in 0..20 {
            if matches!(self.child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }

        let _ = self.child.kill();
        let _ = self.child.wait();
    }

    /// Whether the child has exited on its own.
    pub fn has_exited(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(Some(_)))
    }
}

/// LSP framing: `Content-Length: n\r\n\r\n` then n bytes of JSON.
fn write_message(stdin: &mut ChildStdin, message: &Value) -> std::io::Result<()> {
    let body = serde_json::to_vec(message)?;
    write!(stdin, "Content-Length: {}\r\n\r\n", body.len())?;
    stdin.write_all(&body)?;
    stdin.flush()
}

fn read_message(reader: &mut impl BufRead) -> Option<Value> {
    let mut length = 0usize;

    // Headers, terminated by a blank line. Unknown headers are skipped rather
    // than rejected — that is what makes the framing extensible.
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).ok()? == 0 {
            return None;
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some(value) = trimmed.strip_prefix("Content-Length:") {
            length = value.trim().parse().ok()?;
        }
    }

    if length == 0 {
        return None;
    }

    let mut body = vec![0u8; length];
    std::io::Read::read_exact(reader, &mut body).ok()?;
    serde_json::from_slice(&body).ok()
}

#[cfg(test)]
mod tests {
    use super::read_message;
    use serde_json::json;

    #[test]
    fn reads_a_framed_message() {
        let body = json!({ "jsonrpc": "2.0", "id": 1, "result": 42 }).to_string();
        let framed = format!("Content-Length: {}\r\n\r\n{body}", body.len());
        let mut input = std::io::Cursor::new(framed.into_bytes());

        let message = read_message(&mut input).expect("a message");
        assert_eq!(message["result"], 42);
    }

    #[test]
    fn skips_headers_it_does_not_know() {
        let body = json!({ "method": "event/emit" }).to_string();
        let framed = format!(
            "Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        );
        let mut input = std::io::Cursor::new(framed.into_bytes());

        let message = read_message(&mut input).expect("a message");
        assert_eq!(message["method"], "event/emit");
    }

    #[test]
    fn a_closed_pipe_ends_the_stream() {
        let mut input = std::io::Cursor::new(Vec::new());
        assert!(read_message(&mut input).is_none());
    }
}
