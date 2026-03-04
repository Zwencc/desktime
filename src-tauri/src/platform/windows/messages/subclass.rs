use std::{
    panic::{catch_unwind, AssertUnwindSafe},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Weak,
    },
};

use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::{
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::WM_NCDESTROY,
    },
};

use crate::error::BackendResult;

const DESKTIME_SUBCLASS_ID: usize = 0x4453_4B54;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WindowMessage {
    pub id: u32,
    pub wparam: usize,
    pub lparam: isize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MessageDisposition {
    Forward,
    // The first native feature that consumes a message will construct this variant.
    #[allow(dead_code)]
    Handled(isize),
}

type MessageHandler = Box<dyn Fn(WindowMessage) -> MessageDisposition + Send + Sync>;

#[derive(Default)]
pub struct MessageRouter {
    handlers: Vec<MessageHandler>,
}

impl MessageRouter {
    pub fn with_handler(
        mut self,
        handler: impl Fn(WindowMessage) -> MessageDisposition + Send + Sync + 'static,
    ) -> Self {
        self.handlers.push(Box::new(handler));
        self
    }

    fn dispatch(&self, message: WindowMessage) -> MessageDisposition {
        self.handlers
            .iter()
            .map(|handler| handler(message))
            .find(|result| matches!(result, MessageDisposition::Handled(_)))
            .unwrap_or(MessageDisposition::Forward)
    }
}

struct SubclassState {
    hwnd: isize,
    detached: AtomicBool,
    router: MessageRouter,
}

pub struct SubclassRegistration {
    hwnd: isize,
    state: Weak<SubclassState>,
}

impl SubclassRegistration {
    pub fn install(hwnd: HWND, router: MessageRouter) -> BackendResult<Self> {
        let state = Arc::new(SubclassState {
            hwnd: hwnd.0 as isize,
            detached: AtomicBool::new(false),
            router,
        });
        let weak_state = Arc::downgrade(&state);
        let state_pointer = Arc::into_raw(state);

        let installed = unsafe {
            SetWindowSubclass(
                hwnd,
                Some(subclass_proc),
                DESKTIME_SUBCLASS_ID,
                state_pointer as usize,
            )
        };

        if !installed.as_bool() {
            unsafe {
                drop(Arc::from_raw(state_pointer));
            }
            return Err(windows::core::Error::from_win32().into());
        }

        Ok(Self {
            hwnd: hwnd.0 as isize,
            state: weak_state,
        })
    }

    pub fn hwnd(&self) -> isize {
        self.hwnd
    }

    pub fn is_attached(&self) -> bool {
        self.state
            .upgrade()
            .is_some_and(|state| !state.detached.load(Ordering::Acquire))
    }

    pub fn detach(&self) -> BackendResult<()> {
        let Some(state) = self.state.upgrade() else {
            return Ok(());
        };

        if state.detached.swap(true, Ordering::AcqRel) {
            return Ok(());
        }

        let hwnd = HWND(state.hwnd as *mut _);
        let removed =
            unsafe { RemoveWindowSubclass(hwnd, Some(subclass_proc), DESKTIME_SUBCLASS_ID) };

        if !removed.as_bool() {
            state.detached.store(false, Ordering::Release);
            return Err(windows::core::Error::from_win32().into());
        }

        unsafe {
            drop(Arc::from_raw(Arc::as_ptr(&state)));
        }
        Ok(())
    }
}

impl Drop for SubclassRegistration {
    fn drop(&mut self) {
        if let Err(error) = self.detach() {
            super::super::report_error(
                "failed to remove native window subclass",
                &format!("HWND {}", self.hwnd),
                &error,
            );
        }
    }
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    message_id: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    reference_data: usize,
) -> LRESULT {
    if reference_data == 0 {
        return unsafe { DefSubclassProc(hwnd, message_id, wparam, lparam) };
    }

    let state_pointer = reference_data as *const SubclassState;
    let state = unsafe { &*state_pointer };
    let message = WindowMessage {
        id: message_id,
        wparam: wparam.0,
        lparam: lparam.0,
    };

    let disposition = dispatch_safely(&state.router, message);

    if message_id == WM_NCDESTROY {
        let owns_callback_reference = mark_callback_detached(hwnd, state_pointer);
        let result = unsafe { DefSubclassProc(hwnd, message_id, wparam, lparam) };
        if owns_callback_reference {
            unsafe {
                drop(Arc::from_raw(state_pointer));
            }
        }
        return result;
    }

    match disposition {
        MessageDisposition::Forward => unsafe { DefSubclassProc(hwnd, message_id, wparam, lparam) },
        MessageDisposition::Handled(result) => LRESULT(result),
    }
}

fn dispatch_safely(router: &MessageRouter, message: WindowMessage) -> MessageDisposition {
    catch_unwind(AssertUnwindSafe(|| router.dispatch(message)))
        .unwrap_or(MessageDisposition::Forward)
}

fn mark_callback_detached(hwnd: HWND, state_pointer: *const SubclassState) -> bool {
    let state = unsafe { &*state_pointer };
    if state.detached.swap(true, Ordering::AcqRel) {
        return false;
    }

    unsafe {
        let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), DESKTIME_SUBCLASS_ID);
    }
    true
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    use super::{dispatch_safely, MessageDisposition, MessageRouter, WindowMessage};

    #[test]
    fn router_stops_after_a_message_is_handled() {
        let calls = Arc::new(AtomicUsize::new(0));
        let first_calls = Arc::clone(&calls);
        let last_calls = Arc::clone(&calls);
        let router = MessageRouter::default()
            .with_handler(move |_| {
                first_calls.fetch_add(1, Ordering::Relaxed);
                MessageDisposition::Handled(42)
            })
            .with_handler(move |_| {
                last_calls.fetch_add(1, Ordering::Relaxed);
                MessageDisposition::Forward
            });

        let result = router.dispatch(WindowMessage {
            id: 1,
            wparam: 2,
            lparam: 3,
        });

        assert_eq!(result, MessageDisposition::Handled(42));
        assert_eq!(calls.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn router_forwards_unhandled_messages() {
        let router = MessageRouter::default().with_handler(|_| MessageDisposition::Forward);

        let result = router.dispatch(WindowMessage {
            id: 1,
            wparam: 2,
            lparam: 3,
        });

        assert_eq!(result, MessageDisposition::Forward);
    }

    #[test]
    fn panicking_handler_is_safely_forwarded() {
        let router = MessageRouter::default().with_handler(|_| panic!("handler failed"));

        let result = dispatch_safely(
            &router,
            WindowMessage {
                id: 1,
                wparam: 2,
                lparam: 3,
            },
        );

        assert_eq!(result, MessageDisposition::Forward);
    }
}
