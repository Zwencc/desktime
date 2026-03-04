use std::{collections::HashMap, sync::Mutex};

use tauri::{Runtime, Window};

use std::sync::Arc;

use super::messages::{MessageRouter, SubclassRegistration, VisibilityPolicy};
use crate::error::{BackendError, BackendResult};

struct RegisteredWindow {
    subclass: SubclassRegistration,
    visibility: Arc<VisibilityPolicy>,
}

#[derive(Default)]
pub struct WindowsPlatformState {
    windows: Mutex<HashMap<String, RegisteredWindow>>,
}

impl WindowsPlatformState {
    pub fn register_window<R: Runtime>(&self, window: &Window<R>) -> BackendResult<()> {
        self.register_native_window(window.label(), window.hwnd()?)
    }

    pub fn apply_app_visibility<T, E>(
        &self,
        label: &str,
        visible: bool,
        operation: impl FnOnce() -> Result<T, E>,
    ) -> BackendResult<Result<T, E>> {
        let visibility = {
            let windows = self
                .windows
                .lock()
                .map_err(|_| BackendError::StatePoisoned("Windows platform"))?;
            Arc::clone(
                &windows
                    .get(label)
                    .ok_or_else(|| BackendError::WindowNotFound(label.to_owned()))?
                    .visibility,
            )
        };

        let previous_visibility = visibility.set_app_visible(visible);
        let result = operation();
        if result.is_err() {
            visibility.set_app_visible(previous_visibility);
        }
        Ok(result)
    }

    fn register_native_window(
        &self,
        label: &str,
        hwnd: windows::Win32::Foundation::HWND,
    ) -> BackendResult<()> {
        let mut windows = self
            .windows
            .lock()
            .map_err(|_| BackendError::StatePoisoned("Windows platform"))?;

        windows.retain(|_, window| window.subclass.is_attached());
        if windows
            .get(label)
            .is_some_and(|window| window.subclass.hwnd() == hwnd.0 as isize)
        {
            return Ok(());
        }

        let visibility = Arc::new(VisibilityPolicy::default());
        let handler_visibility = Arc::clone(&visibility);
        let router = MessageRouter::default()
            .with_handler(move |message| handler_visibility.handle_message(message));
        let subclass = SubclassRegistration::install(hwnd, router)?;
        windows.insert(
            label.to_owned(),
            RegisteredWindow {
                subclass,
                visibility,
            },
        );
        Ok(())
    }

    pub fn detach_all(&self) -> BackendResult<()> {
        let mut windows = self
            .windows
            .lock()
            .map_err(|_| BackendError::StatePoisoned("Windows platform"))?;
        let first_error = windows
            .values()
            .filter_map(|window| window.subclass.detach().err())
            .next();
        windows.clear();

        match first_error {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }
}
