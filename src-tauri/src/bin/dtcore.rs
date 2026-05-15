//! DTCore.exe: DeskTime's current-user background process.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    desktime_lib::logging::install("core");
    desktime_lib::core::run();
}
