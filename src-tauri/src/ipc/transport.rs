//! Framing and the client half of the DTCore channel.
//!
//! **Framing.** A four-byte little-endian length, then that many bytes of JSON.
//! The pipe is opened in byte mode rather than message mode on purpose: message
//! mode moves the boundary into the kernel, where a frame larger than the read
//! buffer comes back as `ERROR_MORE_DATA` and has to be reassembled anyway. One
//! length prefix is the same work with no second rule to get wrong, and it caps
//! an allocation *before* making it — [`MAX_FRAME_BYTES`] is checked against the
//! prefix, so a hostile length never becomes a hostile `Vec::with_capacity`.
//!
//! **Reconnect.** The client holds one connection and re-opens it on demand.
//! DTCore is restarted by DTSvc and by [`crate::core::ensure_running`], so a
//! broken pipe is an ordinary event rather than a fault: a request that fails on
//! a connection this client had already been using is retried once on a fresh
//! one. A request that fails on a connection opened for it is *not* retried —
//! that is DTCore being genuinely absent, and a second attempt would only double
//! the wait before saying so.

use std::sync::Mutex;
use std::time::Duration;

use crate::api::{ApiError, ApiErrorCode, ApiResult};

use super::protocol::{RequestFrame, ResponseFrame, MAX_FRAME_BYTES};

pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

const LENGTH_BYTES: usize = 4;

pub trait RequestTransport: Send + Sync {
    fn round_trip(&self, request: RequestFrame, timeout: Duration) -> ApiResult<ResponseFrame>;
}

/// Serialises one frame, length prefix included.
pub fn encode<T: serde::Serialize>(value: &T) -> ApiResult<Vec<u8>> {
    let body = serde_json::to_vec(value).map_err(|error| {
        ApiError::new(
            ApiErrorCode::InvalidRequest,
            format!("frame could not be encoded: {error}"),
        )
    })?;
    if body.len() > MAX_FRAME_BYTES {
        return Err(oversized(body.len()));
    }

    let mut frame = Vec::with_capacity(LENGTH_BYTES + body.len());
    frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
    frame.extend_from_slice(&body);
    Ok(frame)
}

/// Reads the length prefix and answers how many bytes of body to expect, or
/// refuses outright. Split out from the read so both ends share one limit and
/// so it can be tested without a pipe.
pub fn decode_length(prefix: [u8; LENGTH_BYTES]) -> ApiResult<usize> {
    let length = u32::from_le_bytes(prefix) as usize;
    if length == 0 || length > MAX_FRAME_BYTES {
        return Err(oversized(length));
    }
    Ok(length)
}

fn oversized(length: usize) -> ApiError {
    ApiError::new(
        ApiErrorCode::InvalidRequest,
        format!("frame of {length} bytes exceeds the {MAX_FRAME_BYTES} byte limit"),
    )
}

pub fn parse<T: serde::de::DeserializeOwned>(body: &[u8]) -> ApiResult<T> {
    serde_json::from_slice(body).map_err(|error| {
        ApiError::new(
            ApiErrorCode::InvalidRequest,
            format!("frame could not be decoded: {error}"),
        )
    })
}

#[cfg(windows)]
pub use windows_impl::{read_frame, write_frame, NamedPipeTransport};

#[cfg(windows)]
mod windows_impl {
    use super::*;

    use super::super::endpoint::EndpointIdentity;
    use super::super::pipe::PipeStream;

    pub fn write_frame<T: serde::Serialize>(
        stream: &PipeStream,
        value: &T,
        timeout: Duration,
    ) -> ApiResult<()> {
        stream.write_all(&encode(value)?, timeout)
    }

    pub fn read_frame<T: serde::de::DeserializeOwned>(
        stream: &PipeStream,
        timeout: Duration,
    ) -> ApiResult<T> {
        let mut prefix = [0u8; LENGTH_BYTES];
        stream.read_exact(&mut prefix, timeout)?;
        let mut body = vec![0u8; decode_length(prefix)?];
        stream.read_exact(&mut body, timeout)?;
        parse(&body)
    }

    /// The UI's end of the channel.
    ///
    /// One connection, guarded by a mutex, so concurrent commands queue rather
    /// than each opening a pipe instance of their own — request and response are
    /// matched by position on the wire, and two callers sharing a stream would
    /// read each other's answers.
    #[derive(Default)]
    pub struct NamedPipeTransport {
        /// `None` means this user's own DTCore, resolved on first use. Naming an
        /// endpoint explicitly exists for tests, which must not collide with a
        /// DTCore that is already running on the machine.
        endpoint: Option<String>,
        connection: Mutex<Option<PipeStream>>,
    }

    impl NamedPipeTransport {
        pub fn at(endpoint: impl Into<String>) -> Self {
            Self {
                endpoint: Some(endpoint.into()),
                connection: Mutex::new(None),
            }
        }

        fn name(&self) -> ApiResult<String> {
            match &self.endpoint {
                Some(endpoint) => Ok(endpoint.clone()),
                None => EndpointIdentity::current()?.pipe_name(),
            }
        }

        fn attempt(
            stream: &PipeStream,
            request: &RequestFrame,
            timeout: Duration,
        ) -> ApiResult<ResponseFrame> {
            write_frame(stream, request, timeout)?;
            read_frame(stream, timeout)
        }
    }

    impl RequestTransport for NamedPipeTransport {
        fn round_trip(&self, request: RequestFrame, timeout: Duration) -> ApiResult<ResponseFrame> {
            let mut held = self.connection.lock().map_err(|_| {
                ApiError::new(
                    ApiErrorCode::CoreUnavailable,
                    "the DTCore connection state is unavailable",
                )
            })?;

            if let Some(stream) = held.as_ref() {
                match Self::attempt(stream, &request, timeout) {
                    Ok(response) => return Ok(response),
                    // The peer restarted, or the pipe was torn down under us.
                    // Drop it and fall through to a fresh connection.
                    Err(_) => *held = None,
                }
            }

            let stream = PipeStream::connect(&self.name()?, CONNECT_TIMEOUT)?;
            let response = Self::attempt(&stream, &request, timeout)?;
            *held = Some(stream);
            Ok(response)
        }
    }
}

#[cfg(not(windows))]
#[derive(Default)]
pub struct NamedPipeTransport;

#[cfg(not(windows))]
impl RequestTransport for NamedPipeTransport {
    fn round_trip(&self, _request: RequestFrame, _timeout: Duration) -> ApiResult<ResponseFrame> {
        Err(ApiError::new(
            ApiErrorCode::CoreUnavailable,
            "the DTCore endpoint is Windows-only",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::{decode_length, encode, parse, MAX_FRAME_BYTES};
    use crate::ipc::protocol::{CoreMethod, RequestFrame, PROTOCOL_VERSION};

    #[test]
    fn a_frame_round_trips_through_its_own_encoding() {
        let request = RequestFrame {
            protocol_version: PROTOCOL_VERSION,
            request_id: "request-1".to_owned(),
            method: CoreMethod::Ping,
            payload: serde_json::json!({ "hello": "core" }),
        };

        let frame = encode(&request).unwrap();
        let length = decode_length(frame[..4].try_into().unwrap()).unwrap();
        assert_eq!(length, frame.len() - 4);

        let decoded: RequestFrame = parse(&frame[4..]).unwrap();
        assert_eq!(decoded.request_id, request.request_id);
        assert_eq!(decoded.method, CoreMethod::Ping);
    }

    /// A real pipe, a real DACL and a real client, because none of the three
    /// can be checked by inspection: the framing is only correct if both ends
    /// agree on it, and the overlapped read path has no unit-testable half.
    ///
    /// The endpoint is named after this process so it cannot collide with the
    /// DTCore that may well be running on the machine the test runs on.
    #[cfg(windows)]
    #[test]
    fn a_client_and_a_server_agree_over_a_real_pipe() {
        use std::sync::Arc;
        use std::time::Duration;

        use super::{NamedPipeTransport, RequestTransport, REQUEST_TIMEOUT};
        use crate::api::{ApiError, ApiErrorCode, ApiResult};
        use crate::ipc::endpoint::EndpointIdentity;
        use crate::ipc::protocol::ResponseFrame;
        use crate::ipc::server::{refusal, IpcServer, NamedPipeServer, RequestHandler};

        struct Echo;
        impl RequestHandler for Echo {
            fn handle(&self, request: RequestFrame) -> ApiResult<ResponseFrame> {
                let request_id = request.request_id.clone();
                Ok(match request.method {
                    CoreMethod::Ping => ResponseFrame {
                        protocol_version: PROTOCOL_VERSION,
                        request_id,
                        result: Ok(request.payload),
                    },
                    _ => refusal(
                        request_id,
                        ApiError::new(ApiErrorCode::NotImplemented, "only Ping is served here"),
                    ),
                })
            }
        }

        let identity = EndpointIdentity::current().expect("the current user has a SID");
        let name = format!(
            "{}.test.{}",
            crate::ipc::endpoint::PIPE_PREFIX,
            std::process::id()
        );
        let server = Arc::new(NamedPipeServer::bind(&name, &identity.dacl()).unwrap());

        let accepting = Arc::clone(&server);
        let accept = std::thread::spawn(move || accepting.serve(Arc::new(Echo)));

        let transport = NamedPipeTransport::at(name);
        let call = |method, payload| {
            transport.round_trip(
                RequestFrame {
                    protocol_version: PROTOCOL_VERSION,
                    request_id: "test-1".to_owned(),
                    method,
                    payload,
                },
                REQUEST_TIMEOUT,
            )
        };

        // A payload big enough to prove the length prefix is doing its job:
        // one write and one read would otherwise be indistinguishable from a
        // framing bug that happens to work on short messages.
        let big = "x".repeat(200_000);
        let echoed = call(CoreMethod::Ping, serde_json::json!({ "text": big })).unwrap();
        assert_eq!(echoed.result.unwrap()["text"], serde_json::json!(big));

        // The same connection again: this is the reuse path, not a reconnect.
        let second = call(CoreMethod::Ping, serde_json::json!(1)).unwrap();
        assert_eq!(second.result.unwrap(), serde_json::json!(1));

        // A refusal comes back as a frame, not as a dropped connection — and the
        // connection is still usable afterwards.
        let refused = call(CoreMethod::Status, serde_json::Value::Null).unwrap();
        assert_eq!(
            refused.result.unwrap_err().code,
            crate::api::ApiErrorCode::NotImplemented
        );
        assert!(call(CoreMethod::Ping, serde_json::json!(2)).is_ok());

        // A version this build does not speak is refused before dispatch, so the
        // handler above never sees it.
        let stale = transport.round_trip(
            RequestFrame {
                protocol_version: PROTOCOL_VERSION + 1,
                request_id: "test-2".to_owned(),
                method: CoreMethod::Ping,
                payload: serde_json::Value::Null,
            },
            REQUEST_TIMEOUT,
        );
        assert_eq!(
            stale.unwrap().result.unwrap_err().code,
            crate::api::ApiErrorCode::ProtocolMismatch
        );

        server.shutdown().unwrap();
        // Give the accept loop the moment it needs to notice the flag.
        std::thread::sleep(Duration::from_millis(200));
        assert!(accept.is_finished(), "the accept loop did not stop");
    }

    #[test]
    fn refuses_a_length_before_allocating_for_it() {
        let hostile = ((MAX_FRAME_BYTES + 1) as u32).to_le_bytes();
        assert!(decode_length(hostile).is_err());
        // A zero-length frame carries no JSON at all and would only ever be a
        // desynchronised stream.
        assert!(decode_length([0, 0, 0, 0]).is_err());
    }
}
