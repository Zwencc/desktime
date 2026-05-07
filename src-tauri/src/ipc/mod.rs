//! Versioned DeskTime UI ↔ DTCore protocol.
//!
//! Transport code may change without changing [`protocol`]. UI code must use an
//! [`client::IpcClient`], never open `desktime.db` or a named pipe directly.

pub mod client;
pub mod endpoint;
mod pipe;
pub mod protocol;
pub mod server;
pub mod transport;
