//! Composition root for DTCore-owned business modules.
//!
//! Startup order matters and is not arbitrary: the database is opened and
//! migrated first, the legacy day files are imported next, and only then is the
//! sampler started. A sampler running against a half-migrated table would be
//! writing minutes that the import is about to insert again.
//!
//! The IPC server is started last, because it is the point at which the UI is
//! allowed to see any of this.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::activity::{Monitor, SharedRepositories};
use crate::api::ApiResult;
use crate::config::Config;
use crate::ipc::endpoint::EndpointIdentity;
use crate::ipc::server::IpcServer;
use crate::storage::database::CoreDatabase;
use crate::storage::repositories::SqliteRepositories;

use super::handler::CoreRequestHandler;

pub struct CoreHost {
    monitor: Arc<Monitor>,
    stopping: Arc<AtomicBool>,
    #[cfg(windows)]
    server: Arc<crate::ipc::server::NamedPipeServer>,
}

impl CoreHost {
    pub fn start(config: Config) -> ApiResult<Self> {
        let root = crate::devmode::root_dir();
        let repositories: SharedRepositories = Arc::new(Mutex::new(SqliteRepositories::new(
            CoreDatabase::open(&root)?,
        )));
        crate::activity::import_legacy_days(&repositories, &root.join("activity"))?;

        let monitor = crate::activity::spawn(config.activity_config(), Arc::clone(&repositories));
        let stopping = Arc::new(AtomicBool::new(false));

        #[cfg(windows)]
        let server = {
            let server = Arc::new(crate::ipc::server::NamedPipeServer::for_identity(&EndpointIdentity::current()?)?);
            let handler = Arc::new(CoreRequestHandler::new(
                Arc::clone(&monitor),
                Arc::clone(&repositories),
                Arc::clone(&stopping),
            ));

            let accepting = Arc::clone(&server);
            let stopped = Arc::clone(&stopping);
            std::thread::Builder::new()
                .name("desktime-core-accept".to_owned())
                .spawn(move || {
                    // The endpoint going away is DTCore losing its only way to
                    // be reached, so it ends the process rather than leaving a
                    // sampler running that nothing can ever read.
                    let _ = accepting.serve(handler);
                    stopped.store(true, Ordering::Relaxed);
                })
                .ok();
            server
        };

        Ok(Self {
            monitor,
            stopping,
            #[cfg(windows)]
            server,
        })
    }

    /// Whether a `Shutdown` request — or a dead endpoint — has asked the process
    /// to end.
    pub fn stopping(&self) -> bool {
        self.stopping.load(Ordering::Relaxed)
    }

    pub fn shutdown(&self) {
        self.stopping.store(true, Ordering::Relaxed);
        self.monitor.shutdown();
        #[cfg(windows)]
        let _ = self.server.shutdown();
    }
}
