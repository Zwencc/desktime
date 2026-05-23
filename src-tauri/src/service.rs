//! The Windows service.
//!
//! It exists to do the two things a user-session process cannot: start before
//! anyone logs in, and outlive a logoff. What it must **not** try to do is the
//! actual work — session 0 has its own window station, so a sampler running here
//! would report a machine nobody ever touches, and a window shown from here
//! would appear on a desktop nobody can see.
//!
//! So the service is a launcher and a watchdog, nothing more:
//!
//! ```text
//!   service (session 0, LocalSystem)
//!      │  logon / already-active session
//!      └─► DTCore.exe (user session, user privileges)
//!                 ▲
//!                 └── the UI is a third process, started by the user
//! ```
//!
//! # Privileges
//!
//! Installing a service needs administrator rights, and that is the *only* place
//! DeskTime asks for them. The installer or repair action launches DTSvc.exe with
//! `--install`; the
//! UI itself stays unelevated, because an elevated GUI silently loses
//! drag-and-drop from ordinary applications and moves its WebView2 data folder.
//!
//! If installation is declined, DeskTime starts DTCore directly for the current
//! session. That fallback has no watchdog but keeps business work out of the UI.

#![cfg(windows)]

use std::ffi::OsString;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use windows_service::service::{
    ServiceAccess, ServiceControl, ServiceControlAccept, ServiceErrorControl, ServiceExitCode,
    ServiceInfo, ServiceStartType, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::service_manager::{ServiceManager, ServiceManagerAccess};

pub const SERVICE_NAME: &str = "DeskTimeService";
const DISPLAY_NAME: &str = "DeskTime Background Service";
const DESCRIPTION: &str =
    "Keeps DeskTime's activity collection and reminders running without a window open.";

/// Services report their type on every status update; getting it wrong makes the
/// SCM refuse the update rather than fail loudly.
const SERVICE_KIND: ServiceType = ServiceType::OWN_PROCESS;

windows_service::define_windows_service!(ffi_service_main, service_main);

/// Entry point for DTSvc.exe. Hands control to the SCM, which calls
/// [`service_main`] on its own thread.
pub fn run() {
    let _ = windows_service::service_dispatcher::start(SERVICE_NAME, ffi_service_main);
}

fn service_main(_arguments: Vec<OsString>) {
    if let Err(error) = serve() {
        // There is no console and no window here; the crash log is the only
        // place this could be read from.
        panic!("service failed: {error}");
    }
}

/// Raw process handles for the DTCore processes this service started.
///
/// Handles rather than process ids: a pid is reused once its process is gone, so
/// terminating one is a coin flip against having killed something unrelated. The
/// handle stays valid and unambiguous until it is closed, which is why these are
/// deliberately leaked until stop time.
type CoreProcesses = Arc<Mutex<Vec<isize>>>;

fn serve() -> windows_service::Result<()> {
    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    let cores: CoreProcesses = Arc::new(Mutex::new(Vec::new()));

    let session_cores = Arc::clone(&cores);
    let handler = move |control| match control {
        ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
        ServiceControl::Stop | ServiceControl::Shutdown => {
            let _ = stop_tx.send(());
            ServiceControlHandlerResult::NoError
        }
        // A logon is the moment a session gains a desktop to collect from. The
        // DTCore is started per session, so this is the whole reason the service
        // asks for session notifications at all.
        ServiceControl::SessionChange(event) => {
            if matches!(
                event.reason,
                windows_service::service::SessionChangeReason::SessionLogon
                    | windows_service::service::SessionChangeReason::ConsoleConnect
                    | windows_service::service::SessionChangeReason::RemoteConnect
            ) {
                launch_core(event.notification.session_id, &session_cores);
            }
            ServiceControlHandlerResult::NoError
        }
        _ => ServiceControlHandlerResult::NotImplemented,
    };

    let status_handle = service_control_handler::register(SERVICE_NAME, handler)?;

    let running = ServiceStatus {
        service_type: SERVICE_KIND,
        current_state: ServiceState::Running,
        // Session changes have to be asked for explicitly; without this the
        // service would only ever see the session that was active at boot.
        controls_accepted: ServiceControlAccept::STOP
            | ServiceControlAccept::SHUTDOWN
            | ServiceControlAccept::SESSION_CHANGE,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    };
    status_handle.set_service_status(running.clone())?;

    // A service usually starts at boot, before anyone has logged in — but it can
    // also be started by the settings toggle, hours into a session that is
    // already up. That session will never send a logon notification, so it is
    // picked up here.
    if let Some(session) = active_session() {
        launch_core(session, &cores);
    }

    // Nothing to poll: the work is in DTCore, and the handler runs on the
    // SCM's thread. This blocks until a stop arrives.
    let _ = stop_rx.recv();

    // The DTCore processes were started by this service and have no other owner; leaving
    // them behind would mean collection carrying on after the user switched the
    // service off, which is the one thing the switch promises not to do.
    stop_cores(&cores);

    status_handle.set_service_status(ServiceStatus {
        current_state: ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        ..running
    })?;

    Ok(())
}

/// Registers the service to start with Windows and starts it now.
///
/// Runs in the elevated one-shot process spawned by the installer or repair action, so the
/// only channel it has back to the user is its exit code — and, when something
/// goes wrong, the crash log.
pub fn install() {
    if let Err(error) = install_inner() {
        panic!("installing the service failed: {error}");
    }
}

fn install_inner() -> windows_service::Result<()> {
    let manager = ServiceManager::local_computer(
        None::<&str>,
        ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE,
    )?;

    let executable = std::env::current_exe().map_err(windows_service::Error::Winapi)?;
    let info = ServiceInfo {
        name: OsString::from(SERVICE_NAME),
        display_name: OsString::from(DISPLAY_NAME),
        service_type: SERVICE_KIND,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: executable,
        launch_arguments: vec![],
        dependencies: vec![],
        // LocalSystem: the service's whole job is to reach into other users'
        // sessions, which is exactly what an ordinary account cannot do.
        account_name: None,
        account_password: None,
    };

    let service = match manager.create_service(&info, ServiceAccess::START | ServiceAccess::CHANGE_CONFIG)
    {
        Ok(service) => service,
        // Already registered — most likely from a previous install. Reuse it.
        Err(_) => manager.open_service(SERVICE_NAME, ServiceAccess::START)?,
    };

    let _ = service.set_description(DESCRIPTION);
    let _ = service.start(&[] as &[&std::ffi::OsStr]);
    Ok(())
}

/// Stops and deletes the service. Deletion takes effect once the last handle to
/// it closes, which is why nothing here waits for it to disappear.
pub fn uninstall() {
    if let Err(error) = uninstall_inner() {
        panic!("removing the service failed: {error}");
    }
}

fn uninstall_inner() -> windows_service::Result<()> {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    let service = manager.open_service(
        SERVICE_NAME,
        ServiceAccess::STOP | ServiceAccess::DELETE | ServiceAccess::QUERY_STATUS,
    )?;

    // Stopping a service that is not running is an error, not a no-op.
    if let Ok(status) = service.query_status() {
        if status.current_state == ServiceState::Running {
            let _ = service.stop();
        }
    }

    service.delete()?;
    Ok(())
}

/// Whether the service is registered, and whether it is running right now.
/// Read by the repair/status UI. The service is infrastructure, not a switch.
pub fn status() -> (bool, bool) {
    let Ok(manager) = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)
    else {
        return (false, false);
    };

    let Ok(service) = manager.open_service(SERVICE_NAME, ServiceAccess::QUERY_STATUS) else {
        return (false, false);
    };

    let running = service
        .query_status()
        .map(|status| status.current_state == ServiceState::Running)
        .unwrap_or(false);

    (true, running)
}

/// Launches the sibling DTSvc.exe with `action`, elevated.
///
/// `runas` is the shell verb that raises the UAC prompt. There is no way to ask
/// for elevation *within* a running process, which is the whole reason the
/// install path is a separate one-shot launch rather than a function call.
///
/// Returns whether the prompt was accepted. A dismissed prompt comes back as an
/// error here and as "nothing happened" to the user, which is what dismissing it
/// should mean.
pub fn elevate(action: &str) -> bool {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;

    let Ok(ui_executable) = std::env::current_exe() else {
        return false;
    };
    let Some(install_dir) = ui_executable.parent() else {
        return false;
    };
    let executable = install_dir.join("DTSvc.exe");
    if !executable.is_file() {
        return false;
    }

    let verb = HSTRING::from("runas");
    let file = HSTRING::from(executable.as_os_str());
    let parameters = HSTRING::from(action);

    // ShellExecuteW reports success as a fake HINSTANCE above 32. Anything at or
    // below is a failure code, and a dismissed UAC prompt is one of them.
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(file.as_ptr()),
            PCWSTR(parameters.as_ptr()),
            PCWSTR::null(),
            SW_HIDE,
        )
    };

    result.0 as usize > 32
}

/// The session at the physical console, if anyone is logged on to it.
fn active_session() -> Option<u32> {
    use windows::Win32::System::RemoteDesktop::WTSGetActiveConsoleSessionId;

    match unsafe { WTSGetActiveConsoleSessionId() } {
        // 0xFFFFFFFF means no session is attached — the machine is at the logon
        // screen, or between sessions. There is nothing to collect from yet, and
        // the logon notification will arrive when there is.
        u32::MAX => None,
        session => Some(session),
    }
}

/// Starts the sibling `DTCore.exe` inside a logged-on user's session, as that user.
///
/// This is the step that cannot be shortened. `CreateProcessW` from a service
/// would put the process in session 0 with LocalSystem's privileges, where it
/// would see an empty desktop and write files as the wrong user; DTCore has
/// to run *as the person sitting there*, which means their token, their
/// environment block, and their window station.
fn stop_cores(cores: &CoreProcesses) {
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::Threading::TerminateProcess;

    let Ok(mut handles) = cores.lock() else {
        return;
    };

    for raw in handles.drain(..) {
        unsafe {
            let handle = HANDLE(raw as *mut std::ffi::c_void);
            let _ = TerminateProcess(handle, 0);
            let _ = CloseHandle(handle);
        }
    }
}

fn launch_core(session_id: u32, cores: &CoreProcesses) {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::Environment::{CreateEnvironmentBlock, DestroyEnvironmentBlock};
    use windows::Win32::System::RemoteDesktop::WTSQueryUserToken;
    use windows::Win32::System::Threading::{
        CreateProcessAsUserW, CREATE_NO_WINDOW, CREATE_UNICODE_ENVIRONMENT, PROCESS_INFORMATION,
        STARTUPINFOW,
    };

    let Ok(service_executable) = std::env::current_exe() else {
        return;
    };
    let Some(install_dir) = service_executable.parent() else {
        return;
    };
    let executable = install_dir.join("DTCore.exe");
    if !executable.is_file() {
        return;
    }

    unsafe {
        let mut token = HANDLE::default();
        if WTSQueryUserToken(session_id, &mut token).is_err() {
            // No interactive user in that session — nothing to run as.
            return;
        }

        let mut environment = std::ptr::null_mut();
        let has_environment = CreateEnvironmentBlock(&mut environment, Some(token), false).is_ok();

        // CreateProcessAsUserW writes into the command line it is given, so it
        // has to be an owned, mutable, NUL-terminated buffer.
        let mut command: Vec<u16> = format!("\"{}\"", executable.display())
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let mut startup = STARTUPINFOW {
            cb: std::mem::size_of::<STARTUPINFOW>() as u32,
            ..Default::default()
        };
        // The interactive window station and desktop. Without it the process
        // starts in the service's own station, which is precisely the isolation
        // this whole dance exists to escape.
        let mut desktop: Vec<u16> = "winsta0\\default"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        startup.lpDesktop = PWSTR(desktop.as_mut_ptr());

        let mut process = PROCESS_INFORMATION::default();
        let launched = CreateProcessAsUserW(
            Some(token),
            None,
            Some(PWSTR(command.as_mut_ptr())),
            None,
            None,
            false,
            CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
            if has_environment {
                Some(environment)
            } else {
                None
            },
            None,
            &startup,
            &mut process,
        );

        if launched.is_ok() {
            let _ = CloseHandle(process.hThread);
            // The process handle is kept, not closed: it is what stop_cores
            // terminates, and it is the only way to name that exact process.
            if let Ok(mut handles) = cores.lock() {
                handles.push(process.hProcess.0 as isize);
            } else {
                let _ = CloseHandle(process.hProcess);
            }
        }

        if has_environment {
            let _ = DestroyEnvironmentBlock(environment);
        }
        let _ = CloseHandle(token);
    }
}
