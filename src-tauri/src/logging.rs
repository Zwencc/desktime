//! Crash logs.
//!
//! This exists because of what comes after it. A watchdog that restarts the app
//! turns a crash into "it flickered and came back" — the most expensive kind of
//! bug, because nothing is left to look at. Every role therefore writes its
//! panics down before anything is allowed to restart it.
//!
//! Deliberately plain: one appended file, no rotation beyond a size cap, no log
//! levels, no third-party logger. What is wanted here is the answer to "it
//! vanished last Tuesday, why" — a running commentary would bury it.

use std::io::Write;
use std::panic::PanicHookInfo;

use crate::devmode::root_dir;

/// Past this the file is truncated rather than grown. A crash loop can write
/// thousands of identical entries, and the useful one is the first.
const MAX_BYTES: u64 = 512 * 1024;

/// Records every panic in this process, tagged with the role that hit it.
///
/// Chained onto the default hook rather than replacing it: a debug build should
/// still print to the console it was started from.
pub fn install(role: &'static str) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        write_entry(role, info);
        previous(info);
    }));
}

fn write_entry(role: &str, info: &PanicHookInfo<'_>) {
    let message = info
        .payload()
        .downcast_ref::<&str>()
        .map(|text| (*text).to_owned())
        .or_else(|| info.payload().downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "(no message)".to_owned());

    let location = info
        .location()
        .map(|at| format!("{}:{}:{}", at.file(), at.line(), at.column()))
        .unwrap_or_else(|| "(unknown location)".to_owned());

    let epoch_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0);

    // Every step here is allowed to fail quietly. A process that is already
    // panicking must not panic again over a log file.
    let dir = root_dir().join("logs");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }

    let path = dir.join("crash.log");
    let truncate = std::fs::metadata(&path).is_ok_and(|meta| meta.len() > MAX_BYTES);
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(!truncate)
        .write(true)
        .truncate(truncate)
        .open(&path);

    if let Ok(mut file) = file {
        let _ = writeln!(file, "[{epoch_ms}] {role} panicked at {location}: {message}");
    }
}
