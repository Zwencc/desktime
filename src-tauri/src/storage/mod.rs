//! DTCore-owned durable storage.
//!
//! Only DTCore may construct [`database::CoreDatabase`]. UI commands reach
//! repositories through IPC and must never open `desktime.db` directly.

pub mod database;
pub mod migrations;
pub mod repositories;
