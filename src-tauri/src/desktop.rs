//! Desktop takeover: enumerating what is on the desktop, borrowing its icons,
//! and launching things.
//!
//! The desktop-layer widget covers the real desktop, so it has to put the icons
//! back — otherwise "a wallpaper widget" would just be "your shortcuts are gone".
//! Rather than parking the window behind the shell (`SetParent` into `WorkerW`,
//! which costs *all* mouse and keyboard input), the window stays a normal
//! always-on-bottom window and redraws the icons itself.
//!
//! Icons come out of the shell's own cache via `SHGetFileInfoW`, so a shortcut
//! looks exactly as it did before it was covered. They are returned as PNG data
//! URIs because the alternative — raw pixels — is several megabytes of JSON for
//! a full desktop.
//!
//! What is *not* enumerated: the virtual items (This PC, Recycle Bin, Network).
//! They are not files, so they need shell-namespace enumeration rather than a
//! directory listing; the takeover covers real files, folders and shortcuts.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::BackendResult;

/// Depth limit for the Start Menu walk. The tree is shallow in practice and a
/// bad symlink should not turn this into an unbounded crawl.
const MENU_DEPTH: usize = 4;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellEntry {
    pub name: String,
    pub path: String,
    pub directory: bool,
    /// `data:image/png;base64,...`, or empty when the icon could not be read.
    pub icon: String,
    /// Where it came from, so the launcher can rank desktop items first.
    pub source: &'static str,
}

/// Asks the shell where a known folder is, rather than assuming where its usual
/// environment variable would put it.
///
/// `%USERPROFILE%\Desktop` is a guess, and a wrong one on any machine whose
/// Desktop has been redirected. OneDrive's "back up your folders" does exactly
/// that and is on by default — it moves the desktop to
/// `%USERPROFILE%\OneDrive\Desktop` and leaves the old folder behind, usually
/// with a few stale files still in it. The layer would then draw a desktop that
/// looks plausible and is not the user's.
///
/// The returned string is allocated by the shell, so it is freed here.
#[cfg(windows)]
fn known_folder(id: *const windows::core::GUID) -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{SHGetKnownFolderPath, KF_FLAG_DEFAULT};

    unsafe {
        let raw = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
        let path = raw.to_string().ok().map(PathBuf::from);
        CoTaskMemFree(Some(raw.0.cast()));
        path
    }
}

/// Both desktops: the user's own and the one shared by all accounts, which is
/// where most installers actually drop their shortcuts.
///
/// No environment-variable fallback if the shell cannot answer. There is no
/// better guess to fall back *to* — the guess is what was wrong — and an empty
/// desktop is a bug someone reports, while a desktop showing three stale files
/// is a bug nobody notices.
#[cfg(windows)]
fn desktop_dirs() -> Vec<PathBuf> {
    use windows::Win32::UI::Shell::{FOLDERID_Desktop, FOLDERID_PublicDesktop};

    [
        known_folder(&FOLDERID_Desktop),
        known_folder(&FOLDERID_PublicDesktop),
    ]
    .into_iter()
    .flatten()
    .filter(|path| path.is_dir())
    .collect()
}

/// `FOLDERID_Programs` is already the `Programs` folder inside the Start Menu,
/// so nothing is appended to it.
#[cfg(windows)]
fn start_menu_dirs() -> Vec<PathBuf> {
    use windows::Win32::UI::Shell::{FOLDERID_CommonPrograms, FOLDERID_Programs};

    [
        known_folder(&FOLDERID_Programs),
        known_folder(&FOLDERID_CommonPrograms),
    ]
    .into_iter()
    .flatten()
    .filter(|path| path.is_dir())
    .collect()
}

#[cfg(not(windows))]
fn desktop_dirs() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(not(windows))]
fn start_menu_dirs() -> Vec<PathBuf> {
    Vec::new()
}

/// File name without the `.lnk` that the shell also hides.
fn display_name(path: &Path) -> String {
    let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
    name.strip_suffix(".lnk")
        .or_else(|| name.strip_suffix(".url"))
        .unwrap_or(name)
        .to_owned()
}

fn read_dir_entries(dir: &Path, source: &'static str, icons: bool) -> Vec<ShellEntry> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let name = display_name(&path);
            // `desktop.ini` carries folder metadata and is hidden by the shell.
            if name.is_empty() || name.eq_ignore_ascii_case("desktop.ini") {
                return None;
            }

            let text = path.to_string_lossy().to_string();
            Some(ShellEntry {
                name,
                directory: path.is_dir(),
                icon: if icons { icon_data_uri(&text) } else { String::new() },
                path: text,
                source,
            })
        })
        .collect()
}

/// Everything on the desktop, with icons, sorted the way the shell sorts it:
/// folders first, then names.
pub fn desktop_entries() -> Vec<ShellEntry> {
    let mut entries: Vec<ShellEntry> = desktop_dirs()
        .iter()
        .flat_map(|dir| read_dir_entries(dir, "desktop", true))
        .collect();

    entries.sort_by(|a, b| {
        b.directory
            .cmp(&a.directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    entries
}

fn walk_menu(dir: &Path, depth: usize, out: &mut Vec<ShellEntry>) {
    if depth == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_menu(&path, depth - 1, out);
            continue;
        }
        let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
        if !name.to_lowercase().ends_with(".lnk") {
            continue;
        }
        out.push(ShellEntry {
            name: display_name(&path),
            path: path.to_string_lossy().to_string(),
            directory: false,
            // Icons are skipped here: the launcher shows a short filtered list,
            // and extracting several hundred up front is what would make opening
            // it feel slow.
            icon: String::new(),
            source: "menu",
        });
    }
}

/// The launcher's index: the desktop plus every Start Menu shortcut, deduped by
/// name so the same app installed twice does not appear twice.
pub fn launcher_index() -> Vec<ShellEntry> {
    let mut entries: Vec<ShellEntry> = desktop_dirs()
        .iter()
        .flat_map(|dir| read_dir_entries(dir, "desktop", false))
        .collect();

    for dir in start_menu_dirs() {
        walk_menu(&dir, MENU_DEPTH, &mut entries);
    }

    let mut seen = std::collections::HashSet::new();
    entries.retain(|entry| seen.insert(entry.name.to_lowercase()));
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    entries
}

#[cfg(windows)]
pub fn icon_data_uri(path: &str) -> String {
    windows_icons::extract(path).unwrap_or_default()
}

#[cfg(not(windows))]
pub fn icon_data_uri(_path: &str) -> String {
    String::new()
}

#[cfg(windows)]
pub fn launch(path: &str) -> BackendResult<()> {
    windows_icons::shell_execute(path)
}

#[cfg(not(windows))]
pub fn launch(_path: &str) -> BackendResult<()> {
    Err(crate::error::BackendError::UnsupportedPlatform(
        "launching shell items",
    ))
}

#[cfg(windows)]
mod windows_icons {
    use base64::Engine;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Shell::{
        SHGetFileInfoW, ShellExecuteW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
    };
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO, SW_SHOWNORMAL};

    use crate::error::{BackendError, BackendResult};

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn shell_execute(path: &str) -> BackendResult<()> {
        let target = wide(path);
        let verb = wide("open");
        let result = unsafe {
            ShellExecuteW(
                Some(HWND::default()),
                PCWSTR(verb.as_ptr()),
                PCWSTR(target.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };

        // ShellExecuteW returns a fake HINSTANCE; anything at or below 32 is an
        // error code rather than a handle.
        if result.0 as isize <= 32 {
            return Err(BackendError::LaunchFailed(path.to_owned()));
        }
        Ok(())
    }

    /// Asks the shell for the same icon Explorer would draw, then turns it into a
    /// PNG data URI.
    pub fn extract(path: &str) -> Option<String> {
        let target = wide(path);
        let mut info = SHFILEINFOW::default();
        let ok = unsafe {
            SHGetFileInfoW(
                PCWSTR(target.as_ptr()),
                FILE_FLAGS_AND_ATTRIBUTES(0),
                Some(&mut info),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_LARGEICON,
            )
        };
        if ok == 0 || info.hIcon.is_invalid() {
            return None;
        }

        let png = unsafe { encode(info.hIcon) };
        unsafe {
            let _ = DestroyIcon(info.hIcon);
        }
        png
    }

    unsafe fn encode(icon: HICON) -> Option<String> {
        let mut icon_info = ICONINFO::default();
        GetIconInfo(icon, &mut icon_info).ok()?;

        let color = icon_info.hbmColor;
        let mask = icon_info.hbmMask;
        let result = read_pixels(color);
        if !color.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(color.0));
        }
        if !mask.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(mask.0));
        }

        let (width, height, pixels) = result?;
        let mut out = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut out, width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().ok()?;
            writer.write_image_data(&pixels).ok()?;
        }

        Some(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&out)
        ))
    }

    unsafe fn read_pixels(
        bitmap: windows::Win32::Graphics::Gdi::HBITMAP,
    ) -> Option<(u32, u32, Vec<u8>)> {
        if bitmap.is_invalid() {
            return None;
        }

        let mut shape = BITMAP::default();
        let read = GetObjectW(
            HGDIOBJ(bitmap.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut shape as *mut BITMAP as *mut _),
        );
        if read == 0 || shape.bmWidth <= 0 || shape.bmHeight <= 0 {
            return None;
        }

        let width = shape.bmWidth as u32;
        let height = shape.bmHeight as u32;
        let mut header = BITMAPINFO::default();
        header.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: shape.bmWidth,
            // Negative height asks for a top-down image, which is the order PNG
            // wants; a bottom-up DIB would come out upside down.
            biHeight: -shape.bmHeight,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        };

        let mut pixels = vec![0u8; (width * height * 4) as usize];
        let dc = GetDC(Some(HWND::default()));
        let lines = GetDIBits(
            dc,
            bitmap,
            0,
            height,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut header,
            DIB_RGB_COLORS,
        );
        ReleaseDC(Some(HWND::default()), dc);
        if lines == 0 {
            return None;
        }

        // GDI hands back BGRA; PNG wants RGBA.
        pixels.chunks_exact_mut(4).for_each(|pixel| pixel.swap(0, 2));

        // Older icons carry no alpha channel at all, which would encode as a
        // fully transparent image. Treat "no alpha anywhere" as opaque.
        if pixels.chunks_exact(4).all(|pixel| pixel[3] == 0) {
            pixels.chunks_exact_mut(4).for_each(|pixel| pixel[3] = 255);
        }

        Some((width, height, pixels))
    }
}
