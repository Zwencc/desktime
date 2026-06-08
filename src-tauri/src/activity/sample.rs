//! Read-only environment probes, one tick at a time.
//!
//! Every call here is a plain Win32 query — no hooks, no injection, no elevation.
//! The keyboard probe is the sensitive one and its boundary is deliberate: it
//! polls key *state* and can therefore only ever produce counts. It never learns
//! an order, never assembles characters, and only tells apart the handful of keys
//! listed in `WHITELIST` (see docs/requirements-moo-clock.md §5.1).
//!
//! Non-Windows builds get stubs that report nothing, the same way the platform
//! layer does, so the crate still compiles elsewhere.

/// Per-tick keyboard counters. `total` is a bare count; the two named fields are
/// the only key identities that ever leave this function.
#[derive(Clone, Copy, Debug, Default)]
pub struct KeySample {
    pub total: u32,
    /// Ctrl+C / Ctrl+V — the "moving data around instead of thinking" signal.
    pub copy: u32,
    /// Backspace / Delete — the "rewriting the same sentence" signal.
    pub back: u32,
}

impl KeySample {
    pub fn add(&mut self, other: KeySample) {
        self.total += other.total;
        self.copy += other.copy;
        self.back += other.back;
    }
}

/// The slow-moving signals. Sampled on a much lazier cadence than keys because
/// each one is a registry read, a COM round-trip or a desktop handle.
#[derive(Clone, Copy, Debug, Default)]
pub struct EnvSample {
    pub mic: bool,
    pub cam: bool,
    pub audio: bool,
    pub fullscreen: bool,
    pub locked: bool,
    pub on_battery: bool,
    pub monitors: u8,
}

/// The focused application: the executable's file name, and the path it was
/// launched from.
///
/// The path is the one thing here that must not travel. It routinely contains a
/// user name (`C:\Users\…`), and for a portable tool a project folder as well —
/// neither of which the bare file name reveals. It stays in the backend, where
/// `app_names` uses it to read the executable's own version resource, and only
/// the product name it yields is ever handed out.
#[derive(Clone, Debug, Default)]
pub struct ForegroundApp {
    pub exe: String,
    pub path: String,
}

#[cfg(windows)]
pub use imp::Sampler;

#[cfg(not(windows))]
pub use stub::Sampler;

#[cfg(not(windows))]
mod stub {
    use super::{EnvSample, ForegroundApp, KeySample};

    #[derive(Default)]
    pub struct Sampler;

    impl Sampler {
        pub fn new() -> Self {
            Self
        }

        pub fn keys(&mut self) -> KeySample {
            KeySample::default()
        }

        pub fn idle_ms(&self) -> u32 {
            0
        }

        pub fn foreground_app(&self) -> Option<ForegroundApp> {
            None
        }

        pub fn cursor_delta(&mut self) -> u32 {
            0
        }

        pub fn environment(&mut self, _mic: bool, _audio: bool) -> EnvSample {
            EnvSample::default()
        }
    }
}

#[cfg(windows)]
mod imp {
    use super::{EnvSample, ForegroundApp, KeySample};

    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, POINT, RECT};
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, AudioSessionStateActive, IAudioSessionControl,
        IAudioSessionManager2, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_READ,
    };
    use windows::Win32::System::StationsAndDesktops::{
        CloseDesktop, OpenInputDesktop, DESKTOP_CONTROL_FLAGS, DESKTOP_READOBJECTS,
    };
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetForegroundWindow, GetSystemMetrics, GetWindowRect,
        GetWindowThreadProcessId, SystemParametersInfoW, SM_CMONITORS, SM_CXSCREEN, SM_CYSCREEN,
        SPI_GETSCREENSAVERRUNNING, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
    };

    /// Virtual-key codes swept every tick. Starts past the mouse buttons (0x01..0x07)
    /// so clicks never register as typing.
    const VK_FIRST: u16 = 0x08;
    const VK_LAST: u16 = 0xFE;

    const VK_BACK: u16 = 0x08;
    const VK_CONTROL: u16 = 0x11;
    const VK_DELETE: u16 = 0x2E;
    const VK_C: u16 = 0x43;
    const VK_V: u16 = 0x56;

    const CONSENT_STORE: &str = concat!(
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\",
        "CapabilityAccessManager\\ConsentStore"
    );

    /// Registry value that is zero for exactly as long as an app holds the device.
    const LAST_USED_STOP: &str = "LastUsedTimeStop";

    pub struct Sampler {
        cursor: Option<(i32, i32)>,
        com_ready: bool,
    }

    impl Sampler {
        pub fn new() -> Self {
            Self {
                cursor: None,
                com_ready: false,
            }
        }

        /// Keys pressed since the previous call. `GetAsyncKeyState`'s low bit means
        /// "went down since this thread last asked", so a 100ms sweep cannot miss a
        /// keystroke — and cannot recover one either, which is the point.
        pub fn keys(&mut self) -> KeySample {
            let mut sample = KeySample::default();
            let mut ctrl_down = false;

            for vk in VK_FIRST..=VK_LAST {
                // One call per key: reading VK_CONTROL separately would consume its
                // own "pressed since" bit and drop Ctrl from the total.
                let state = unsafe { GetAsyncKeyState(vk as i32) } as u16;
                if vk == VK_CONTROL {
                    ctrl_down = state & 0x8000 != 0;
                }
                if state & 0x0001 == 0 {
                    continue;
                }

                sample.total += 1;
                match vk {
                    VK_BACK | VK_DELETE => sample.back += 1,
                    VK_C | VK_V if ctrl_down => sample.copy += 1,
                    _ => {}
                }
            }

            sample
        }

        pub fn idle_ms(&self) -> u32 {
            let mut info = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };
            if unsafe { GetLastInputInfo(&mut info) }.as_bool() {
                unsafe { GetTickCount() }.wrapping_sub(info.dwTime)
            } else {
                0
            }
        }

        /// The focused window's executable. The window *title* is a different API
        /// and is never read — it would carry file names, page titles and chat
        /// partners, which the executable does not.
        ///
        /// The full path is returned alongside the file name, and goes no further
        /// than the backend: see [`super::ForegroundApp`].
        pub fn foreground_app(&self) -> Option<ForegroundApp> {
            let window = unsafe { GetForegroundWindow() };
            let process = open_foreground_process(window)?;

            let mut buffer = [0u16; 260];
            let mut length = buffer.len() as u32;
            let query = unsafe {
                QueryFullProcessImageNameW(
                    process,
                    PROCESS_NAME_WIN32,
                    PWSTR(buffer.as_mut_ptr()),
                    &mut length,
                )
            };
            unsafe {
                let _ = CloseHandle(process);
            }
            query.ok()?;

            let path = String::from_utf16_lossy(&buffer[..length as usize]);
            let name = path.rsplit(['\\', '/']).next()?.to_owned();
            (!name.is_empty()).then(|| ForegroundApp { exe: name, path })
        }

        /// Pixels the pointer travelled since the previous call.
        pub fn cursor_delta(&mut self) -> u32 {
            let mut point = POINT::default();
            if unsafe { GetCursorPos(&mut point) }.is_err() {
                return 0;
            }

            let delta = match self.cursor {
                Some((x, y)) => {
                    let dx = (point.x - x) as f64;
                    let dy = (point.y - y) as f64;
                    dx.hypot(dy).round() as u32
                }
                None => 0,
            };
            self.cursor = Some((point.x, point.y));
            delta
        }

        /// The expensive probes. `mic` and `audio` gate the two that a user might
        /// find intrusive, so switching them off in settings really does stop the
        /// query rather than just hiding the result.
        pub fn environment(&mut self, mic: bool, audio: bool) -> EnvSample {
            EnvSample {
                mic: mic && capability_in_use("microphone"),
                cam: mic && capability_in_use("webcam"),
                audio: audio && self.audio_playing(),
                fullscreen: foreground_is_fullscreen(),
                locked: session_locked(),
                on_battery: on_battery(),
                monitors: unsafe { GetSystemMetrics(SM_CMONITORS) }.clamp(0, 255) as u8,
            }
        }

        /// True when anything holds an active session on the default output device.
        /// Only the session *state* is read; no metadata, no levels, no content.
        fn audio_playing(&mut self) -> bool {
            if !self.com_ready {
                // Ignoring the result on purpose: RPC_E_CHANGED_MODE just means some
                // other Tauri component already initialised this thread's apartment.
                let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
                self.com_ready = true;
            }

            unsafe { render_session_active() }.unwrap_or(false)
        }
    }

    fn open_foreground_process(window: HWND) -> Option<HANDLE> {
        if window.is_invalid() {
            return None;
        }

        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(window, Some(&mut pid)) };
        if pid == 0 {
            return None;
        }

        unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()
    }

    unsafe fn render_session_active() -> windows::core::Result<bool> {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
        let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
        let sessions = manager.GetSessionEnumerator()?;

        for index in 0..sessions.GetCount()? {
            let control: IAudioSessionControl = sessions.GetSession(index)?;
            if control.GetState()? == AudioSessionStateActive {
                return Ok(true);
            }
        }

        Ok(false)
    }

    fn foreground_is_fullscreen() -> bool {
        let window = unsafe { GetForegroundWindow() };
        if window.is_invalid() {
            return false;
        }

        let mut rect = RECT::default();
        if unsafe { GetWindowRect(window, &mut rect) }.is_err() {
            return false;
        }

        let width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
        let height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
        rect.left <= 0 && rect.top <= 0 && rect.right >= width && rect.bottom >= height
    }

    /// `OpenInputDesktop` is denied while the session is locked, which makes it a
    /// more definite "nobody is here" than an idle timer.
    fn session_locked() -> bool {
        let locked =
            match unsafe { OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_READOBJECTS) } {
                Ok(desktop) => {
                    unsafe {
                        let _ = CloseDesktop(desktop);
                    }
                    false
                }
                Err(_) => true,
            };

        locked || screensaver_running()
    }

    fn screensaver_running() -> bool {
        let mut running = 0u32;
        let query = unsafe {
            SystemParametersInfoW(
                SPI_GETSCREENSAVERRUNNING,
                0,
                Some(&mut running as *mut u32 as *mut _),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            )
        };
        query.is_ok() && running != 0
    }

    fn on_battery() -> bool {
        let mut status = SYSTEM_POWER_STATUS::default();
        if unsafe { GetSystemPowerStatus(&mut status) }.is_err() {
            return false;
        }
        status.ACLineStatus == 0
    }

    // ---- Privacy capability store -------------------------------------------
    //
    // Windows records, per app, when it started and stopped using the microphone
    // or the camera. While a device is held, `LastUsedTimeStop` is zero — which is
    // exactly the "is anyone in a meeting right now" bit, and nothing more. The
    // app doing the holding is deliberately not recorded.

    struct RegKey(HKEY);

    impl Drop for RegKey {
        fn drop(&mut self) {
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn open_key(parent: HKEY, path: &str) -> Option<RegKey> {
        let name = wide(path);
        let mut key = HKEY::default();
        let status =
            unsafe { RegOpenKeyExW(parent, PCWSTR(name.as_ptr()), None, KEY_READ, &mut key) };
        status.is_ok().then_some(RegKey(key))
    }

    fn subkey_names(key: &RegKey) -> Vec<String> {
        let mut names = Vec::new();
        for index in 0.. {
            let mut buffer = [0u16; 256];
            let mut length = buffer.len() as u32;
            let status = unsafe {
                RegEnumKeyExW(
                    key.0,
                    index,
                    Some(PWSTR(buffer.as_mut_ptr())),
                    &mut length,
                    None,
                    None,
                    None,
                    None,
                )
            };
            if status.is_err() {
                break;
            }
            names.push(String::from_utf16_lossy(&buffer[..length as usize]));
        }
        names
    }

    fn read_u64(key: &RegKey, name: &str) -> Option<u64> {
        let value_name = wide(name);
        let mut value = 0u64;
        let mut size = std::mem::size_of::<u64>() as u32;
        let status = unsafe {
            RegQueryValueExW(
                key.0,
                PCWSTR(value_name.as_ptr()),
                None,
                None,
                Some(&mut value as *mut u64 as *mut u8),
                Some(&mut size),
            )
        };
        status.is_ok().then_some(value)
    }

    fn capability_in_use(capability: &str) -> bool {
        let Some(root) = open_key(HKEY_CURRENT_USER, &format!("{CONSENT_STORE}\\{capability}"))
        else {
            return false;
        };

        if any_child_holding(&root) {
            return true;
        }

        // Desktop apps are one level deeper, under a shared `NonPackaged` key.
        open_key(root.0, "NonPackaged")
            .map(|nested| any_child_holding(&nested))
            .unwrap_or(false)
    }

    fn any_child_holding(key: &RegKey) -> bool {
        subkey_names(key).into_iter().any(|name| {
            open_key(key.0, &name)
                .and_then(|child| read_u64(&child, LAST_USED_STOP))
                .is_some_and(|stop| stop == 0)
        })
    }
}
