use cirnet_contracts_native::validation::Registry;
use cirnet_remote_native::{
    assignments::AssignmentService,
    auth::AuthService,
    config::Config,
    db::{Db, WriteDb, authority::SchedulerAuthority, runtime::ExperimentRepository},
    events::{EventHub, EventLimits},
    experiments::ExperimentManager,
    hardware::HardwareClient,
    http_api::{self, AppState, WritableAuth},
    projects::ProjectService,
    stations::StationService,
    websocket::{SocketLimits, WebSocketState},
};
use cirnet_remote_native::{diagnostics::safety_log, error::ApiError};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::SocketAddr,
    path::Path,
    sync::Arc,
    time::Duration,
};

#[tokio::main]
async fn main() {
    if let Err(code) = run().await {
        safety_log(format_args!("{code}"));
        std::process::exit(2);
    }
}
async fn run() -> Result<(), String> {
    let mut listen = "127.0.0.1:8000".to_string();
    let (mut stdin_shutdown, mut migrate, mut export_openapi) = (false, false, false);
    let mut arguments = std::env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--migrate" => migrate = true,
            "--export-openapi" => export_openapi = true,
            "--listen" => listen = arguments.next().ok_or("Missing --listen value")?,
            "--exit-on-stdin-eof" => stdin_shutdown = true,
            "--route-inventory" => {
                println!(
                    "{}",
                    serde_json::to_string(http_api::IMPLEMENTED_OPERATIONS).unwrap()
                );
                return Ok(());
            }
            "--help" => {
                println!(
                    "cirnet-remote --listen ADDRESS [--exit-on-stdin-eof] [--route-inventory] [--export-openapi] [--migrate]"
                );
                return Ok(());
            }
            _ => return Err("Unsupported argument".into()),
        }
    }
    let variables: HashMap<String, String> = std::env::vars().collect();
    let config = Config::from_vars(&variables)?;
    if migrate {
        let report = cirnet_remote_native::db::migrations::migrate(&config.database_url)
            .await
            .map_err(|error| error.to_string())?;
        println!(
            "{}",
            serde_json::json!({"from":report.from,"to":report.to,"applied":report.applied})
        );
        return Ok(());
    }
    let contracts = variables
        .get("CIRNET_CONTRACTS_ROOT")
        .or_else(|| variables.get("NETCIRCUIT_CONTRACTS_ROOT"))
        .ok_or("CIRNET_CONTRACTS_ROOT is required")?;
    let openapi = Arc::new(cirnet_remote_native::openapi::load(
        Path::new(contracts),
        http_api::IMPLEMENTED_OPERATIONS,
    )?);
    if export_openapi {
        std::io::stdout()
            .write_all(&openapi)
            .map_err(|_| "OpenAPI output failed")?;
        return Ok(());
    }
    let routes = cirnet_remote_native::openapi::Routes::from_bytes(&openapi)?;
    let shutdown_signal = termination_signal()?;
    let registry = Arc::new(
        Registry::load(Path::new(contracts)).map_err(|_| "Contracts registry unavailable")?,
    );
    let hardware = HardwareClient::new(&config.hardware_target)
        .map_err(|_| "Hardware endpoint unavailable")?;
    // Reserve the HTTP socket before admitting commands or acquiring Hardware authority.
    let listener = tokio::net::TcpListener::bind(&listen)
        .await
        .map_err(|_| "HTTP bind failed")?;
    let address = listener
        .local_addr()
        .map_err(|_| "HTTP address unavailable")?;
    let probe =
        cirnet_remote_native::stop_probe::StopProbe::configure(&variables, &config, address)?;
    let hardware = hardware.with_stop_probe(probe.clone());
    let (db, projects, assignments, manager, websocket, writable_auth, hub, monitor_auth, stations) =
        if config.read_only {
            let db = Db::open_readonly(&config.database_url)
                .await
                .map_err(|_| "Read-only database unavailable")?;
            let stations = StationService::new(registry.clone(), hardware.clone(), db.clone())
                .map_err(|_| "Station configuration unavailable")?;
            (db, None, None, None, None, None, None, None, stations)
        } else {
            let authority = SchedulerAuthority::acquire(&config.database_url)
                .await
                .map_err(|_| "Scheduler authority unavailable")?;
            let write = WriteDb::open_existing(&config.database_url)
                .await
                .map_err(|_| "Writable database unavailable")?;
            let db = write.reads();
            let stations = StationService::new(registry.clone(), hardware.clone(), db.clone())
                .map_err(|_| "Station configuration unavailable")?;
            let projects = ProjectService::new(write.clone(), config.clone(), registry.clone());
            let assignments =
                AssignmentService::new(write.clone(), config.clone(), registry.clone());
            let auth = Arc::new(
                AuthService::new(write.clone(), config.clone())
                    .await
                    .map_err(|_| "Authentication unavailable")?,
            );
            let hub =
                EventHub::new(EventLimits::from(&config)).map_err(|_| "Event limits invalid")?;
            let manager = Arc::new(
                ExperimentManager::new(
                    ExperimentRepository::new(write, registry.clone()),
                    hardware.clone(),
                    Arc::new(config.clone()),
                    registry.clone(),
                    hub.clone(),
                    assignments.clone(),
                    projects.clone(),
                    authority,
                )
                .map_err(|_| "Scheduler initialization failed")?,
            );
            if manager.initialize().await.is_err() {
                manager.stop_admissions();
                hub.shutdown();
                manager
                    .shutdown()
                    .await
                    .map_err(|_| "Scheduler recovery failed; safety cleanup incomplete")?;
                return Err("Scheduler recovery failed".into());
            }
            let websocket = WebSocketState::new(
                Arc::new(config.clone()),
                db.clone(),
                registry.clone(),
                hub.clone(),
                SocketLimits::from_config(&config),
                manager.clone(),
            );
            let writable_auth = WritableAuth::new(auth.clone(), manager.clone(), &config);
            (
                db,
                Some(projects),
                Some(assignments),
                Some(manager),
                Some(websocket),
                Some(writable_auth),
                Some(hub),
                Some(auth),
                stations,
            )
        };
    let state = Arc::new(AppState {
        config,
        db,
        registry,
        hardware,
        projects,
        assignments,
        manager: manager.clone(),
        websocket,
        writable_auth,
        openapi: Some(openapi),
        routes: Some(routes),
        stations: Some(stations),
    });
    let (stop, stopped) = tokio::sync::oneshot::channel();
    if stdin_shutdown {
        std::thread::spawn(move || {
            let mut buffer = [0u8; 128];
            while let Ok(count) = std::io::stdin().read(&mut buffer) {
                if count == 0 {
                    break;
                }
            }
            let _ = stop.send(());
        });
    } else {
        std::mem::forget(stop);
    }
    let mut readiness = std::io::stdout();
    if writeln!(readiness, "CIRNET_REMOTE_READY={address}")
        .and_then(|_| readiness.flush())
        .is_err()
    {
        if let Some(manager) = &manager {
            manager.stop_admissions();
        }
        if let Some(hub) = &hub {
            hub.shutdown();
        }
        if let Some(manager) = &manager {
            manager
                .shutdown()
                .await
                .map_err(|_| "Readiness output failed; safety cleanup incomplete")?;
        }
        return Err("Readiness output failed".into());
    }
    let (monitor_stop, mut monitor_stopped) = tokio::sync::watch::channel(false);
    let (monitor, monitor_done) = manager.clone().map(|manager| {
        spawn_supervised_monitor(async move {
            let mut ticks = tokio::time::interval(Duration::from_secs(1));
            let mut last_maintenance = tokio::time::Instant::now() - Duration::from_secs(60);
            loop {
                tokio::select! {
                    _ = monitor_stopped.changed() => break,
                    _ = ticks.tick() => {
                        if let Err(error) = manager.monitor_tick().await {
                            safety_log(format_args!("Scheduler monitor: {}", error.code));
                        }
                        if last_maintenance.elapsed() >= Duration::from_secs(60) {
                            last_maintenance = tokio::time::Instant::now();
                            if let Some(auth) = &monitor_auth && auth.maintain().await.is_err() {
                                safety_log(format_args!("Authentication maintenance unavailable"));
                            }
                        }
                    },
                }
            }
        })
    }).unzip();
    let signal_manager = manager.clone();
    let signal_hub = hub.clone();
    let signal_monitor_stop = monitor_stop.clone();
    let served = axum::serve(
        listener,
        http_api::router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(close_on_shutdown(
        stopped,
        shutdown_signal,
        monitor_done,
        move || {
            begin_shutdown(
                signal_manager.as_deref(),
                signal_hub.as_ref(),
                &signal_monitor_stop,
            )
        },
    ))
    .await;
    let scheduler = finish_scheduler(
        monitor,
        || begin_shutdown(manager.as_deref(), hub.as_ref(), &monitor_stop),
        async {
            if let Some(manager) = &manager {
                manager.shutdown().await
            } else {
                Ok(())
            }
        },
    )
    .await;
    if let Some(probe) = probe {
        probe.flush_stop_phases();
    }
    scheduler?;
    served.map_err(|_| "HTTP service failed".into())
}

fn spawn_supervised_monitor(
    monitor: impl std::future::Future<Output = ()> + Send + 'static,
) -> (
    tokio::task::JoinHandle<()>,
    tokio::sync::oneshot::Receiver<()>,
) {
    let (alive, done) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        let _alive = alive;
        monitor.await;
    });
    (task, done)
}

async fn close_on_shutdown(
    stopped: impl std::future::Future,
    shutdown_signal: impl std::future::Future,
    monitor_done: Option<tokio::sync::oneshot::Receiver<()>>,
    close: impl FnOnce(),
) {
    let monitor_exit = async {
        if let Some(done) = monitor_done {
            let _ = done.await;
        } else {
            std::future::pending::<()>().await;
        }
    };
    tokio::select! {
        _ = stopped => {},
        _ = shutdown_signal => {},
        _ = monitor_exit => {},
    }
    close();
}

fn begin_shutdown(
    manager: Option<&ExperimentManager>,
    hub: Option<&EventHub>,
    monitor_stop: &tokio::sync::watch::Sender<bool>,
) {
    if let Some(manager) = manager {
        manager.stop_admissions();
    }
    if let Some(hub) = hub {
        hub.shutdown();
    }
    let _ = monitor_stop.send(true);
}

async fn finish_scheduler(
    monitor: Option<tokio::task::JoinHandle<()>>,
    close: impl FnOnce(),
    shutdown: impl std::future::Future<Output = Result<(), ApiError>>,
) -> Result<(), &'static str> {
    // Also close on a serve return where Axum never ran its graceful callback.
    close();
    let monitor_failed = match monitor {
        Some(monitor) => monitor.await.is_err(),
        None => false,
    };
    let cleanup_failed = shutdown.await.is_err();
    match (monitor_failed, cleanup_failed) {
        (true, true) => Err("Scheduler monitor failed; safety cleanup incomplete"),
        (true, false) => Err("Scheduler monitor failed"),
        (false, true) => Err("Scheduler shutdown incomplete"),
        (false, false) => Ok(()),
    }
}

#[cfg(test)]
mod safety_regression {
    use super::*;
    use std::{cell::Cell, future::pending};

    #[tokio::test]
    async fn monitor_panic_closes_admissions_without_external_signal_and_drains() {
        let (monitor, done) = spawn_supervised_monitor(async { panic!("fixture monitor failure") });
        let closed = Cell::new(false);
        tokio::time::timeout(
            Duration::from_secs(1),
            close_on_shutdown(pending::<()>(), pending::<()>(), Some(done), || {
                closed.set(true)
            }),
        )
        .await
        .unwrap();
        let drained = Cell::new(false);
        let result = finish_scheduler(Some(monitor), || {}, async {
            assert!(closed.get());
            drained.set(true);
            Ok(())
        })
        .await;
        assert!(drained.get());
        assert_eq!(result, Err("Scheduler monitor failed"));
    }

    #[tokio::test]
    async fn failed_monitor_and_failed_cleanup_are_both_reported() {
        let (monitor, _done) =
            spawn_supervised_monitor(async { panic!("fixture monitor failure") });
        let result = finish_scheduler(Some(monitor), || {}, async {
            Err(ApiError::new("UNAVAILABLE", 503))
        })
        .await;
        assert_eq!(
            result,
            Err("Scheduler monitor failed; safety cleanup incomplete")
        );
    }

    #[tokio::test]
    async fn serve_return_stops_a_live_monitor_before_join_and_drains() {
        let (signal, mut stopped) = tokio::sync::watch::channel(false);
        let (monitor, _done) = spawn_supervised_monitor(async move {
            stopped.changed().await.unwrap();
            assert!(*stopped.borrow());
        });
        let closed = Cell::new(false);
        let drained = Cell::new(false);
        let finished = tokio::time::timeout(
            Duration::from_secs(1),
            finish_scheduler(
                Some(monitor),
                || {
                    closed.set(true);
                    begin_shutdown(None, None, &signal);
                },
                async {
                    assert!(closed.get());
                    drained.set(true);
                    Ok(())
                },
            ),
        )
        .await
        .unwrap();
        assert_eq!(finished, Ok(()));
        assert!(drained.get());
    }

    #[tokio::test]
    async fn readonly_without_monitor_stays_open_until_an_external_signal() {
        let closed = Cell::new(false);
        let stalled = tokio::time::timeout(
            Duration::from_millis(10),
            close_on_shutdown(pending::<()>(), pending::<()>(), None, || closed.set(true)),
        )
        .await;
        assert!(stalled.is_err() && !closed.get());
        close_on_shutdown(std::future::ready(()), pending::<()>(), None, || {
            closed.set(true)
        })
        .await;
        assert!(closed.get());
    }
}

#[cfg(unix)]
fn termination_signal() -> Result<impl std::future::Future<Output = ()>, String> {
    let mut interrupt = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())
        .map_err(|_| "Interrupt signal handler unavailable")?;
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .map_err(|_| "Termination signal handler unavailable")?;
    Ok(async move {
        tokio::select! {_=interrupt.recv()=>{},_=terminate.recv()=>{}}
    })
}
#[cfg(windows)]
fn termination_signal() -> Result<impl std::future::Future<Output = ()>, String> {
    let mut interrupt =
        tokio::signal::windows::ctrl_c().map_err(|_| "Interrupt signal handler unavailable")?;
    Ok(async move {
        interrupt.recv().await;
    })
}
