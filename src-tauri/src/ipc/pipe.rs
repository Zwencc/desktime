//! The Win32 half of the DTCore endpoint: one named pipe, one DACL, and the
//! blocking reads and writes the frame layer sits on.
//!
//! Everything `unsafe` in the IPC stack is collected here, the way the window
//! subclass keeps its own — [`transport`](super::transport) and
//! [`server`](super::server) above it deal only in byte slices.
//!
//! Two asymmetries are deliberate:
//!
//! * **The client is overlapped, the server is not.** A UI thread waiting on a
//!   wedged DTCore has to be able to give up, so client reads and writes carry
//!   `REQUEST_TIMEOUT`. A server thread waiting for its client's next request
//!   has nothing better to do and no deadline to meet, so it blocks.
//! * **Access control is the pipe's, not the protocol's.** The DACL names
//!   SYSTEM and the owning user; anyone else is refused by the object manager
//!   before a byte is read, which is why no frame carries a credential.

#![cfg(windows)]

use std::time::{Duration, Instant};

use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::{
    CloseHandle, LocalFree, ERROR_FILE_NOT_FOUND, ERROR_IO_PENDING, ERROR_PIPE_BUSY,
    ERROR_PIPE_CONNECTED, GENERIC_READ, GENERIC_WRITE, HANDLE, HLOCAL,
};
use windows::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FlushFileBuffers, ReadFile, WriteFile, FILE_FLAG_OVERLAPPED, FILE_SHARE_MODE,
    OPEN_EXISTING, PIPE_ACCESS_DUPLEX,
};
use windows::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, WaitNamedPipeW, PIPE_READMODE_BYTE,
    PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
};
use windows::Win32::System::IO::{CancelIoEx, GetOverlappedResultEx, OVERLAPPED};
use windows::Win32::System::Threading::CreateEventW;

use crate::api::{ApiError, ApiErrorCode, ApiResult};

/// Kernel buffer per direction. One frame is capped at 1 MiB by the protocol;
/// this only decides how much the kernel will hold before a writer blocks, and
/// a request that does not fit simply takes two trips through it.
const BUFFER_BYTES: u32 = 64 * 1024;

/// A connected pipe end. Owns its handle and closes it on drop, which is what
/// makes the peer's next read fail rather than hang.
pub struct PipeStream {
    handle: HANDLE,
    overlapped: bool,
    /// Only set on the server side: a listener's own instance has to be
    /// disconnected before its handle is closed, or the client is left holding
    /// a half-open pipe until it times out.
    server: bool,
}

// The handle is owned exclusively by this value; a connection is served on its
// own thread, so it has to be able to move there.
unsafe impl Send for PipeStream {}

impl Drop for PipeStream {
    fn drop(&mut self) {
        unsafe {
            if self.server {
                let _ = FlushFileBuffers(self.handle);
                let _ = DisconnectNamedPipe(self.handle);
            }
            let _ = CloseHandle(self.handle);
        }
    }
}

impl PipeStream {
    /// Opens the endpoint, waiting for a busy pipe until `timeout` runs out.
    ///
    /// Three failures are told apart because the caller answers them
    /// differently: a pipe that does not exist means DTCore is not running and
    /// is worth starting; a busy one means every instance is taken and is worth
    /// waiting for; anything else is reported as-is.
    pub fn connect(name: &str, timeout: Duration) -> ApiResult<Self> {
        let wide = HSTRING::from(name);
        let deadline = Instant::now() + timeout;

        loop {
            let opened = unsafe {
                CreateFileW(
                    PCWSTR(wide.as_ptr()),
                    (GENERIC_READ.0 | GENERIC_WRITE.0) as u32,
                    FILE_SHARE_MODE(0),
                    None,
                    OPEN_EXISTING,
                    FILE_FLAG_OVERLAPPED,
                    None,
                )
            };

            let error = match opened {
                Ok(handle) => {
                    return Ok(Self {
                        handle,
                        overlapped: true,
                        server: false,
                    })
                }
                Err(error) => error,
            };

            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(unavailable(&error));
            }

            match error.code().0 as u32 & 0xFFFF {
                code if code == ERROR_PIPE_BUSY.0 => unsafe {
                    // Returns as soon as an instance frees up, so this is a
                    // wait rather than a spin.
                    let _ = WaitNamedPipeW(PCWSTR(wide.as_ptr()), remaining.as_millis() as u32);
                },
                code if code == ERROR_FILE_NOT_FOUND.0 => {
                    std::thread::sleep(Duration::from_millis(50).min(remaining));
                }
                _ => return Err(unavailable(&error)),
            }
        }
    }

    pub fn read_exact(&self, buffer: &mut [u8], timeout: Duration) -> ApiResult<()> {
        let mut filled = 0;
        while filled < buffer.len() {
            let read = self.read(&mut buffer[filled..], timeout)?;
            if read == 0 {
                return Err(ApiError::new(
                    ApiErrorCode::CoreUnavailable,
                    "the DTCore connection closed mid-frame",
                ));
            }
            filled += read;
        }
        Ok(())
    }

    pub fn write_all(&self, mut bytes: &[u8], timeout: Duration) -> ApiResult<()> {
        while !bytes.is_empty() {
            let written = self.write(bytes, timeout)?;
            if written == 0 {
                return Err(ApiError::new(
                    ApiErrorCode::CoreUnavailable,
                    "the DTCore connection stopped accepting bytes",
                ));
            }
            bytes = &bytes[written..];
        }
        Ok(())
    }

    fn read(&self, buffer: &mut [u8], timeout: Duration) -> ApiResult<usize> {
        if !self.overlapped {
            let mut read = 0u32;
            unsafe { ReadFile(self.handle, Some(buffer), Some(&mut read), None) }
                .map_err(|error| broken(&error))?;
            return Ok(read as usize);
        }

        let request = OverlappedRequest::new()?;
        let started =
            unsafe { ReadFile(self.handle, Some(buffer), None, Some(request.as_mut_ptr())) };
        self.finish(started, &request, timeout)
    }

    fn write(&self, bytes: &[u8], timeout: Duration) -> ApiResult<usize> {
        if !self.overlapped {
            let mut written = 0u32;
            unsafe { WriteFile(self.handle, Some(bytes), Some(&mut written), None) }
                .map_err(|error| broken(&error))?;
            return Ok(written as usize);
        }

        let request = OverlappedRequest::new()?;
        let started =
            unsafe { WriteFile(self.handle, Some(bytes), None, Some(request.as_mut_ptr())) };
        self.finish(started, &request, timeout)
    }

    /// Resolves one overlapped operation.
    ///
    /// The cancel on timeout is the point of the whole overlapped path: the
    /// kernel still owns the buffer while the request is pending, so abandoning
    /// it without `CancelIoEx` would leave it writing into memory this stack
    /// frame is about to give back.
    fn finish(
        &self,
        started: windows::core::Result<()>,
        request: &OverlappedRequest,
        timeout: Duration,
    ) -> ApiResult<usize> {
        if let Err(error) = started {
            if error.code().0 as u32 & 0xFFFF != ERROR_IO_PENDING.0 {
                return Err(broken(&error));
            }
        }

        let mut transferred = 0u32;
        let waited = unsafe {
            GetOverlappedResultEx(
                self.handle,
                request.as_mut_ptr(),
                &mut transferred,
                timeout.as_millis().min(u128::from(u32::MAX)) as u32,
                false,
            )
        };

        match waited {
            Ok(()) => Ok(transferred as usize),
            Err(error) => {
                unsafe {
                    let _ = CancelIoEx(self.handle, Some(request.as_mut_ptr()));
                }
                Err(broken(&error))
            }
        }
    }
}

/// One overlapped operation's kernel state: the `OVERLAPPED` and the event the
/// kernel signals when it completes. Both are freed together, after the
/// operation has been waited for or cancelled.
struct OverlappedRequest {
    overlapped: Box<OVERLAPPED>,
}

impl OverlappedRequest {
    fn new() -> ApiResult<Self> {
        let event = unsafe { CreateEventW(None, true, false, PCWSTR::null()) }
            .map_err(|error| broken(&error))?;
        let mut overlapped = Box::new(OVERLAPPED::default());
        overlapped.hEvent = event;
        Ok(Self { overlapped })
    }

    fn as_mut_ptr(&self) -> *mut OVERLAPPED {
        std::ptr::from_ref(self.overlapped.as_ref()).cast_mut()
    }
}

impl Drop for OverlappedRequest {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.overlapped.hEvent);
        }
    }
}

/// The server end. Each `accept` creates a fresh instance, so the endpoint is
/// listening again the moment a client is handed off to its own thread.
pub struct PipeListener {
    name: HSTRING,
    descriptor: SecurityDescriptor,
}

impl PipeListener {
    pub fn bind(name: &str, dacl: &str) -> ApiResult<Self> {
        Ok(Self {
            name: HSTRING::from(name),
            descriptor: SecurityDescriptor::from_sddl(dacl)?,
        })
    }

    pub fn accept(&self) -> ApiResult<PipeStream> {
        let mut attributes = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: self.descriptor.0 .0,
            bInheritHandle: false.into(),
        };

        let handle = unsafe {
            CreateNamedPipeW(
                PCWSTR(self.name.as_ptr()),
                PIPE_ACCESS_DUPLEX,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                PIPE_UNLIMITED_INSTANCES,
                BUFFER_BYTES,
                BUFFER_BYTES,
                0,
                Some(&mut attributes),
            )
        };

        if handle.is_invalid() {
            return Err(ApiError::new(
                ApiErrorCode::CoreUnavailable,
                format!(
                    "could not create the DTCore endpoint: {}",
                    windows::core::Error::from_win32()
                ),
            ));
        }

        let stream = PipeStream {
            handle,
            overlapped: false,
            server: true,
        };

        // A client that arrived between `CreateNamedPipeW` and here is already
        // connected; the kernel reports that as an error and it is not one.
        match unsafe { ConnectNamedPipe(handle, None) } {
            Ok(()) => Ok(stream),
            Err(error) if error.code().0 as u32 & 0xFFFF == ERROR_PIPE_CONNECTED.0 => Ok(stream),
            Err(error) => Err(broken(&error)),
        }
    }
}

/// A security descriptor built from SDDL, freed with `LocalFree` as the
/// conversion function requires.
struct SecurityDescriptor(PSECURITY_DESCRIPTOR);

// Read-only after construction; the listener hands a pointer to it to every
// `CreateNamedPipeW` call on the accept thread.
unsafe impl Send for SecurityDescriptor {}
unsafe impl Sync for SecurityDescriptor {}

impl SecurityDescriptor {
    fn from_sddl(sddl: &str) -> ApiResult<Self> {
        let mut descriptor = PSECURITY_DESCRIPTOR::default();
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                &HSTRING::from(sddl),
                SDDL_REVISION_1,
                &mut descriptor,
                None,
            )
        }
        .map_err(|error| {
            ApiError::new(
                ApiErrorCode::CoreUnavailable,
                format!("could not build the DTCore endpoint DACL: {error}"),
            )
        })?;
        Ok(Self(descriptor))
    }
}

impl Drop for SecurityDescriptor {
    fn drop(&mut self) {
        unsafe {
            let _ = LocalFree(Some(HLOCAL(self.0 .0)));
        }
    }
}

fn unavailable(error: &windows::core::Error) -> ApiError {
    ApiError::new(
        ApiErrorCode::CoreUnavailable,
        format!("could not reach DTCore: {error}"),
    )
}

fn broken(error: &windows::core::Error) -> ApiError {
    ApiError::new(
        ApiErrorCode::CoreUnavailable,
        format!("the DTCore connection failed: {error}"),
    )
}
