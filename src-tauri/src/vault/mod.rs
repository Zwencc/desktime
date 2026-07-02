//! Privacy vault boundary (N2).
//!
//! Only this module handles VEK/KEK material. Commands expose opaque session
//! handles; no crypto key type is serializable or visible to frontend code.

pub mod controller;
pub mod crypto;
pub mod format;
pub mod model;
pub mod session;
pub mod store;
