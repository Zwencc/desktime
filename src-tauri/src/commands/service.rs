//! Status and repair entry points for background protection.
//!
//! Installing a service needs administrator rights and the UI deliberately does
//! not have them, so the toggle cannot do the work itself. It re-launches this
//! sibling DTSvc.exe with `--install` through the `runas` verb, which is
//! what raises the UAC prompt, and that elevated one-shot process does the
//! install and exits. Same for removal.
//!
//! Nothing here waits for the elevated process. The user may take a while over
//! the UAC prompt, or dismiss it entirely, and a blocked IPC call would freeze
//! the settings window either way — so the frontend polls [`background_status`]
//! instead and shows what the machine actually reports.

use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundStatus {
    pub service_installed: bool,
    pub service_running: bool,
    pub degraded: bool,
}

/// Whether protected background operation is available.
#[tauri::command]
pub fn background_status() -> BackgroundStatus {
    #[cfg(windows)]
    {
        let (service_installed, service_running) = crate::service::status();
        BackgroundStatus {
            service_installed,
            service_running,
            degraded: !service_running,
        }
    }
    #[cfg(not(windows))]
    {
        BackgroundStatus {
            service_installed: false,
            service_running: false,
            degraded: true,
        }
    }
}

/// Asks for elevation and installs/repairs the service. There is deliberately
/// no disable command: DTSvc is product infrastructure rather than a feature.
///
/// Returns as soon as the prompt has been raised. `false` means the user
/// dismissed UAC or the shell refused to elevate — which is a normal answer, not
/// an error: the toggle simply stays where it was.
#[tauri::command]
pub fn repair_background_service() -> Result<bool, String> {
    #[cfg(windows)]
    {
        Ok(crate::service::elevate("--install"))
    }
    #[cfg(not(windows))]
    {
        Err("the background service is Windows-only".to_owned())
    }
}
