//! The DTCore half of the channel: accept, frame, dispatch.
//!
//! One thread per connection, and connections are long-lived — the UI opens one
//! and keeps it. That is affordable because the client side is a single mutexed
//! connection per process, so the instance count tracks *processes*, not calls.
//!
//! A handler never takes a connection down. Every error, including a protocol
//! version this build does not speak, is written back as a [`ResponseFrame`]
//! carrying an [`ApiError`]; the socket is only dropped when the peer goes away
//! or sends something that is not a frame at all. Silently closing on a bad
//! request is exactly the "拒绝而被 void 吞了" failure mode the B3 analysis is
//! about — the caller has to be able to see the refusal.

use std::sync::Arc;

use crate::api::{ApiError, ApiErrorCode, ApiResult};

use super::protocol::{RequestFrame, ResponseFrame, PROTOCOL_VERSION};

pub trait RequestHandler: Send + Sync + 'static {
    fn handle(&self, request: RequestFrame) -> ApiResult<ResponseFrame>;
}

pub trait IpcServer: Send + 'static {
    fn serve(&self, handler: Arc<dyn RequestHandler>) -> ApiResult<()>;
    fn shutdown(&self) -> ApiResult<()>;
}

/// Builds the reply for a request the handler refused, so the frame layer and
/// the accept loop cannot disagree about what a failure looks like.
pub fn refusal(request_id: String, error: ApiError) -> ResponseFrame {
    ResponseFrame {
        protocol_version: PROTOCOL_VERSION,
        request_id,
        result: Err(error),
    }
}

#[cfg(windows)]
pub use windows_impl::NamedPipeServer;

#[cfg(windows)]
mod windows_impl {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    use super::*;

    use super::super::endpoint::EndpointIdentity;
    use super::super::pipe::{PipeListener, PipeStream};
    use super::super::transport::{read_frame, write_frame, CONNECT_TIMEOUT, REQUEST_TIMEOUT};

    pub struct NamedPipeServer {
        name: String,
        listener: PipeListener,
        stopped: AtomicBool,
    }

    impl NamedPipeServer {
        /// The endpoint for this user's own session.
        pub fn for_identity(identity: &EndpointIdentity) -> ApiResult<Self> {
            Self::bind(&identity.pipe_name()?, &identity.dacl())
        }

        /// Binds a named endpoint with an explicit DACL. Named separately from
        /// [`Self::for_identity`] so a test can take a pipe of its own instead
        /// of fighting whatever DTCore is already running on the machine.
        pub fn bind(name: &str, dacl: &str) -> ApiResult<Self> {
            Ok(Self {
                listener: PipeListener::bind(name, dacl)?,
                name: name.to_owned(),
                stopped: AtomicBool::new(false),
            })
        }

        fn serve_connection(stream: PipeStream, handler: Arc<dyn RequestHandler>) {
            loop {
                // A read that fails is the client having gone away, which is
                // the ordinary end of a connection rather than an error.
                let Ok(request) = read_frame::<RequestFrame>(&stream, REQUEST_TIMEOUT) else {
                    return;
                };

                let request_id = request.request_id.clone();
                let response = match request.validate() {
                    Ok(()) => handler
                        .handle(request)
                        .unwrap_or_else(|error| refusal(request_id, error)),
                    Err(error) => refusal(request_id, error),
                };

                if write_frame(&stream, &response, REQUEST_TIMEOUT).is_err() {
                    return;
                }
            }
        }
    }

    impl IpcServer for NamedPipeServer {
        fn serve(&self, handler: Arc<dyn RequestHandler>) -> ApiResult<()> {
            while !self.stopped.load(Ordering::Relaxed) {
                let stream = self.listener.accept()?;
                if self.stopped.load(Ordering::Relaxed) {
                    return Ok(());
                }

                let handler = Arc::clone(&handler);
                std::thread::Builder::new()
                    .name("desktime-core-ipc".to_owned())
                    .spawn(move || Self::serve_connection(stream, handler))
                    .map_err(|error| {
                        ApiError::new(
                            ApiErrorCode::CoreUnavailable,
                            format!("could not serve a DTCore connection: {error}"),
                        )
                    })?;
            }
            Ok(())
        }

        /// Flips the flag and then connects to our own endpoint, because
        /// `ConnectNamedPipe` is blocking: without a client arriving, the accept
        /// loop would not look at the flag until someone else happened to call.
        fn shutdown(&self) -> ApiResult<()> {
            self.stopped.store(true, Ordering::Relaxed);
            let _ = PipeStream::connect(&self.name, CONNECT_TIMEOUT.min(Duration::from_secs(1)));
            Ok(())
        }
    }
}
