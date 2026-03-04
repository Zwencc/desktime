use std::sync::atomic::{AtomicBool, Ordering};

use windows::Win32::UI::WindowsAndMessaging::{
    SC_MINIMIZE, SWP_HIDEWINDOW, SWP_SHOWWINDOW, WINDOWPOS, WM_CLOSE, WM_DESTROY, WM_SHOWWINDOW,
    WM_SYSCOMMAND, WM_WINDOWPOSCHANGING,
};

use super::{MessageDisposition, WindowMessage};

const SYSTEM_COMMAND_MASK: usize = 0xFFF0;

pub struct VisibilityPolicy {
    app_visible: AtomicBool,
    closing: AtomicBool,
}

impl Default for VisibilityPolicy {
    fn default() -> Self {
        Self {
            app_visible: AtomicBool::new(true),
            closing: AtomicBool::new(false),
        }
    }
}

impl VisibilityPolicy {
    pub fn handle_message(&self, message: WindowMessage) -> MessageDisposition {
        match message.id {
            WM_CLOSE | WM_DESTROY => {
                self.closing.store(true, Ordering::Release);
                MessageDisposition::Forward
            }
            WM_SYSCOMMAND
                if message.wparam & SYSTEM_COMMAND_MASK == SC_MINIMIZE as usize
                    && self.should_reject_hide() =>
            {
                MessageDisposition::Handled(0)
            }
            WM_SHOWWINDOW if self.should_reject_visibility(message.wparam != 0) => {
                MessageDisposition::Handled(0)
            }
            WM_WINDOWPOSCHANGING if !self.closing.load(Ordering::Acquire) => {
                enforce_window_position_visibility(
                    message.lparam,
                    self.app_visible.load(Ordering::Acquire),
                );
                MessageDisposition::Forward
            }
            _ => MessageDisposition::Forward,
        }
    }

    pub fn set_app_visible(&self, visible: bool) -> bool {
        self.app_visible.swap(visible, Ordering::AcqRel)
    }

    fn should_reject_hide(&self) -> bool {
        !self.closing.load(Ordering::Acquire) && self.app_visible.load(Ordering::Acquire)
    }

    fn should_reject_visibility(&self, requested_visible: bool) -> bool {
        !self.closing.load(Ordering::Acquire)
            && requested_visible != self.app_visible.load(Ordering::Acquire)
    }
}

fn enforce_window_position_visibility(lparam: isize, app_visible: bool) {
    let Some(window_position) = (unsafe { (lparam as *mut WINDOWPOS).as_mut() }) else {
        return;
    };

    if app_visible {
        window_position.flags.0 &= !SWP_HIDEWINDOW.0;
    } else {
        window_position.flags.0 &= !SWP_SHOWWINDOW.0;
    }
}

#[cfg(test)]
mod tests {
    use windows::Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{
            SC_MINIMIZE, SWP_HIDEWINDOW, WINDOWPOS, WM_CLOSE, WM_SHOWWINDOW, WM_SYSCOMMAND,
            WM_WINDOWPOSCHANGING,
        },
    };

    use super::VisibilityPolicy;
    use crate::platform::windows::messages::{MessageDisposition, WindowMessage};

    #[test]
    fn rejects_unsolicited_minimize_commands() {
        let policy = VisibilityPolicy::default();

        let result = policy.handle_message(WindowMessage {
            id: WM_SYSCOMMAND,
            wparam: SC_MINIMIZE as usize,
            lparam: 0,
        });

        assert_eq!(result, MessageDisposition::Handled(0));
    }

    #[test]
    fn permits_app_initiated_visibility_changes() {
        let policy = VisibilityPolicy::default();
        policy.set_app_visible(false);

        let result = policy.handle_message(WindowMessage {
            id: WM_SHOWWINDOW,
            wparam: 0,
            lparam: 0,
        });

        assert_eq!(result, MessageDisposition::Forward);
    }

    #[test]
    fn rejects_unsolicited_show_when_app_is_hidden() {
        let policy = VisibilityPolicy::default();
        policy.set_app_visible(false);

        let result = policy.handle_message(WindowMessage {
            id: WM_SHOWWINDOW,
            wparam: 1,
            lparam: 0,
        });

        assert_eq!(result, MessageDisposition::Handled(0));
    }

    #[test]
    fn strips_unsolicited_hide_from_window_position() {
        let policy = VisibilityPolicy::default();
        let mut position = WINDOWPOS {
            hwnd: HWND::default(),
            hwndInsertAfter: HWND::default(),
            x: 0,
            y: 0,
            cx: 0,
            cy: 0,
            flags: SWP_HIDEWINDOW,
        };

        let result = policy.handle_message(WindowMessage {
            id: WM_WINDOWPOSCHANGING,
            wparam: 0,
            lparam: (&mut position as *mut WINDOWPOS) as isize,
        });

        assert_eq!(result, MessageDisposition::Forward);
        assert_eq!(position.flags.0 & SWP_HIDEWINDOW.0, 0);
    }

    #[test]
    fn permits_hiding_during_window_close() {
        let policy = VisibilityPolicy::default();
        policy.handle_message(WindowMessage {
            id: WM_CLOSE,
            wparam: 0,
            lparam: 0,
        });

        let result = policy.handle_message(WindowMessage {
            id: WM_SYSCOMMAND,
            wparam: SC_MINIMIZE as usize,
            lparam: 0,
        });

        assert_eq!(result, MessageDisposition::Forward);
    }
}
