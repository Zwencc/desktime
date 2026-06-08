//! Executable file name → the name a human would call the application.
//!
//! `code.exe` is Visual Studio Code, `Weixin.exe` is 微信, and `msedgewebview2.exe`
//! is whichever Electron shell happens to be in front. The answer is in the
//! executable's own **version resource** — the same block the file's Properties
//! dialog shows — which is a documented Win32 read and, crucially, *not* the
//! window title. The privacy boundary does not move: this learns what the
//! application is, never what is open in it.
//!
//! Product names are static — one executable is always the same product — so
//! they never enter `MinuteRecord`. Storing one per minute would be storing the
//! same string tens of thousands of times. They are resolved on request instead,
//! from paths the sampler happened to see, and cached by the caller.

use std::collections::BTreeMap;
use std::sync::Mutex;

/// Paths of executables seen in the foreground this run.
///
/// Bounded by how many distinct applications one person focuses between
/// restarts, which is dozens. Never written to disk and never returned to the
/// frontend — a path carries a user name, and the file name it is keyed by does
/// not.
#[derive(Default)]
pub struct AppPaths {
    paths: Mutex<BTreeMap<String, String>>,
}

impl AppPaths {
    pub fn remember(&self, exe: &str, path: &str) {
        let Ok(mut paths) = self.paths.lock() else {
            return;
        };

        let key = exe.to_lowercase();
        if !paths.contains_key(&key) {
            paths.insert(key, path.to_owned());
        }
    }

    /// Resolves what it can and stays silent about the rest.
    ///
    /// An executable this run has not seen in the foreground has no path to read,
    /// and the caller already has a usable answer — the file name. So a miss is
    /// an absent entry, not an error and not an empty string.
    pub fn resolve(&self, exes: &[String]) -> BTreeMap<String, String> {
        let Ok(paths) = self.paths.lock() else {
            return BTreeMap::new();
        };

        exes.iter()
            .filter_map(|exe| {
                let key = exe.to_lowercase();
                let name = product_name(paths.get(&key)?)?;
                Some((exe.clone(), name))
            })
            .collect()
    }
}

#[cfg(not(windows))]
fn product_name(_path: &str) -> Option<String> {
    None
}

/// Reads `FileDescription`, falling back to `ProductName`.
///
/// `FileDescription` is what Task Manager shows and is the friendlier of the
/// two: Visual Studio Code's is "Visual Studio Code" while its `ProductName` is
/// the terser "Visual Studio Code" as well, but plenty of applications fill in
/// only one of them.
#[cfg(windows)]
fn product_name(path: &str) -> Option<String> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Storage::FileSystem::{
        GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
    };

    let wide = HSTRING::from(path);
    let size = unsafe { GetFileVersionInfoSizeW(&wide, None) };
    if size == 0 {
        return None;
    }

    let mut block = vec![0u8; size as usize];
    unsafe { GetFileVersionInfoW(&wide, None, size, block.as_mut_ptr().cast()) }.ok()?;

    // The string table is keyed by language and code page, and there is no fixed
    // pair to assume — a localized build files its strings under its own. The
    // translation table says which ones this executable actually has.
    let (language, code_page) = translation(&block)?;

    ["FileDescription", "ProductName"].into_iter().find_map(|field| {
        let query = HSTRING::from(format!(
            "\\StringFileInfo\\{language:04x}{code_page:04x}\\{field}"
        ));
        let mut value = std::ptr::null_mut();
        let mut length = 0u32;

        let found = unsafe {
            VerQueryValueW(
                block.as_ptr().cast(),
                PCWSTR(query.as_ptr()),
                &mut value,
                &mut length,
            )
        };
        if !found.as_bool() || length == 0 {
            return None;
        }

        // `length` counts characters including the terminator.
        let chars = unsafe { std::slice::from_raw_parts(value.cast::<u16>(), length as usize) };
        let text = String::from_utf16_lossy(chars);
        let text = text.trim_end_matches('\0').trim();

        (!text.is_empty()).then(|| text.to_owned())
    })
}

/// The first language/code-page pair the executable declares.
#[cfg(windows)]
fn translation(block: &[u8]) -> Option<(u16, u16)> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Storage::FileSystem::VerQueryValueW;

    let query = HSTRING::from("\\VarFileInfo\\Translation");
    let mut value = std::ptr::null_mut();
    let mut length = 0u32;

    let found = unsafe {
        VerQueryValueW(
            block.as_ptr().cast(),
            PCWSTR(query.as_ptr()),
            &mut value,
            &mut length,
        )
    };
    if !found.as_bool() || length < 4 {
        return None;
    }

    // Each entry is two u16s: language id, then code page.
    let pair = unsafe { std::slice::from_raw_parts(value.cast::<u16>(), 2) };
    Some((pair[0], pair[1]))
}
