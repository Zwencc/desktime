//! DTSvc.exe: the minimal Windows service and its install/uninstall entry point.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    desktime_lib::logging::install("service");

    #[cfg(windows)]
    match std::env::args().nth(1).as_deref() {
        Some("--install") => desktime_lib::service::install(),
        Some("--uninstall") => desktime_lib::service::uninstall(),
        _ => desktime_lib::service::run(),
    }
}
