//! DTCore runtime boundary.
//!
//! DTCore owns background collection, scheduling, persistence and the IPC
//! server. It must not create windows or depend on frontend state. Business
//! modules are added behind [`host::CoreHost`]; the process entry point only
//! wires those modules together.

mod handler;
mod host;
pub mod tasks;

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::config::Config;

const POLL: Duration = Duration::from_secs(20);
const LEAD_MS: i64 = 90_000;

#[cfg(windows)]
const UI_MUTEX: windows::core::PCWSTR = windows::core::w!(r"Local\DeskTime.Ui");

/// Kept alive by the process that owns a named runtime role.
pub struct ProcessClaim {
    #[cfg(windows)]
    handle: windows::Win32::Foundation::HANDLE,
}

unsafe impl Send for ProcessClaim {}
unsafe impl Sync for ProcessClaim {}

#[cfg(windows)]
impl Drop for ProcessClaim {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(self.handle);
        }
    }
}

/// UI-managed state. Holding it tells DTCore that a renderer already exists.
pub struct UiPresence(pub Option<ProcessClaim>);

#[cfg(windows)]
fn claim_core() -> Option<ProcessClaim> {
    use windows::core::w;
    use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
    use windows::Win32::System::Threading::CreateMutexW;

    let handle = unsafe { CreateMutexW(None, true, w!("Local\\DeskTime.Core")) }.ok()?;
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        unsafe {
            let _ = CloseHandle(handle);
        }
        return None;
    }

    Some(ProcessClaim { handle })
}

#[cfg(not(windows))]
fn claim_core() -> Option<ProcessClaim> {
    Some(ProcessClaim {})
}

#[cfg(windows)]
pub fn mark_ui_running() -> UiPresence {
    use windows::Win32::System::Threading::CreateMutexW;

    let claim = unsafe { CreateMutexW(None, false, UI_MUTEX) }
        .ok()
        .map(|handle| ProcessClaim { handle });
    UiPresence(claim)
}

#[cfg(not(windows))]
pub fn mark_ui_running() -> UiPresence {
    UiPresence(Some(ProcessClaim {}))
}

/// Starts the sibling DTCore process. The named mutex makes this idempotent.
pub fn ensure_running() -> std::io::Result<()> {
    let executable = sibling_executable("DTCore.exe")?;
    std::process::Command::new(executable).spawn()?;
    Ok(())
}

/// DTCore process entry point.
///
/// A failed start is fatal and says so. There is no degraded mode worth having
/// here: without the database there is nothing to collect into, and without the
/// endpoint there is nobody to collect for.
pub fn run() {
    let Some(_claim) = claim_core() else {
        return;
    };

    let config = Config::load();
    let host = match host::CoreHost::start(config) {
        Ok(host) => host,
        Err(error) => panic!("DTCore failed to initialize: {}", error.message),
    };

    while !host.stopping() {
        std::thread::sleep(POLL);
        wake_ui_for_reminders();
    }

    host.shutdown();
}

fn wake_ui_for_reminders() {
    let Some(at) = read_next_wake() else {
        return;
    };

    let remaining = at - crate::reminder::now_ms();
    if !(0..=LEAD_MS).contains(&remaining) || ui_is_running() {
        return;
    }

    let _ = launch_ui();
}

fn read_next_wake() -> Option<i64> {
    std::fs::read_to_string(crate::reminder::next_wake_path())
        .ok()?
        .trim()
        .parse()
        .ok()
}

#[cfg(windows)]
fn ui_is_running() -> bool {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenMutexW, SYNCHRONIZATION_ACCESS_RIGHTS};

    const SYNCHRONIZE: u32 = 0x0010_0000;
    unsafe {
        match OpenMutexW(SYNCHRONIZATION_ACCESS_RIGHTS(SYNCHRONIZE), false, UI_MUTEX) {
            Ok(handle) => {
                let _ = CloseHandle(handle);
                true
            }
            Err(_) => false,
        }
    }
}

#[cfg(not(windows))]
fn ui_is_running() -> bool {
    true
}

fn launch_ui() -> std::io::Result<()> {
    for name in ["DeskTime.exe", "desktime.exe"] {
        if let Ok(executable) = sibling_executable(name) {
            std::process::Command::new(executable).spawn()?;
            return Ok(());
        }
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "DeskTime UI executable is not beside DTCore.exe",
    ))
}

fn sibling_executable(name: &str) -> std::io::Result<PathBuf> {
    let current = std::env::current_exe()?;
    sibling_of(&current, name).filter(|path| path.is_file()).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("{name} is not beside {}", current.display()),
        )
    })
}

fn sibling_of(current: &Path, name: &str) -> Option<PathBuf> {
    current.parent().map(|parent| parent.join(name))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    #[test]
    fn resolves_sibling_executables_without_assuming_a_drive() {
        assert_eq!(
            super::sibling_of(Path::new(r"F:\apps\DeskTime\DeskTime.exe"), "DTCore.exe"),
            Some(Path::new(r"F:\apps\DeskTime\DTCore.exe").to_path_buf())
        );
    }
}
