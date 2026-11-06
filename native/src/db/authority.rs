//! Lifetime scheduler ownership for the exact database being controlled.
use std::fs::{self, File, OpenOptions, TryLockError};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use sqlx::postgres::{PgConnectOptions, PgConnection};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{ConnectOptions, Connection};
use tokio::sync::Mutex;
use tokio::time::timeout;

const PG_KEY: i64 = 0x4349_524e_4554_0001;
const PG_DEADLINE: Duration = Duration::from_secs(3);
const PG_HIGH: i64 = PG_KEY >> 32;
const PG_LOW: i64 = PG_KEY & 0xffff_ffff;

#[derive(Debug, thiserror::Error)]
pub enum AuthorityError {
    #[error("Unsupported scheduler authority database URL")]
    InvalidUrl,
    #[error("A scheduler already holds database authority")]
    Busy,
    #[error("Unsafe database or scheduler lock file identity")]
    UnsafeIdentity,
    #[error("Scheduler authority unavailable")]
    Unavailable,
    #[error("Scheduler authority was lost")]
    Lost,
}

pub struct SchedulerAuthority {
    backend: Backend,
    lost: AtomicBool,
}

enum Backend {
    Postgres(PostgresAuthority),
    Sqlite(SqliteAuthority),
}

struct PostgresAuthority {
    connection: Mutex<PgConnection>,
    pid: i32,
}

struct SqliteAuthority {
    database_path: PathBuf,
    lock_path: PathBuf,
    database_file: File,
    lock_file: File,
    database_identity: FileIdentity,
    lock_identity: FileIdentity,
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct FileIdentity {
    volume: u64,
    index: u64,
    links: u64,
}

impl SchedulerAuthority {
    /// Acquire before recovery and hold through the final admission/worker drain.
    /// An old Python scheduler must relinquish Hardware access independently.
    pub async fn acquire(database_url: &str) -> Result<Self, AuthorityError> {
        let backend = if database_url.starts_with("sqlite:") {
            Backend::Sqlite(SqliteAuthority::acquire(database_url)?)
        } else {
            Backend::Postgres(PostgresAuthority::acquire(database_url).await?)
        };
        let authority = Self {
            backend,
            lost: AtomicBool::new(false),
        };
        authority.check().await?;
        Ok(authority)
    }

    /// Check the original lock before sending Hardware mutations other than
    /// safety cleanup. A failed proof is sticky and never opens a new session.
    pub async fn check(&self) -> Result<(), AuthorityError> {
        if self.is_lost() {
            return Err(AuthorityError::Lost);
        }
        let held = match &self.backend {
            Backend::Postgres(authority) => authority.held().await,
            Backend::Sqlite(authority) => authority.held(),
        };
        if !held {
            self.lost.store(true, Ordering::Release);
        }
        if self.is_lost() {
            Err(AuthorityError::Lost)
        } else {
            Ok(())
        }
    }

    pub fn is_lost(&self) -> bool {
        self.lost.load(Ordering::Acquire)
    }
}

impl PostgresAuthority {
    async fn acquire(url: &str) -> Result<Self, AuthorityError> {
        let url = if let Some(rest) = url.strip_prefix("postgresql+psycopg://") {
            format!("postgresql://{rest}")
        } else if url.starts_with("postgresql://") || url.starts_with("postgres://") {
            url.to_owned()
        } else {
            return Err(AuthorityError::InvalidUrl);
        };
        let options = url
            .parse::<PgConnectOptions>()
            .map_err(|_| AuthorityError::InvalidUrl)?
            .disable_statement_logging();
        timeout(PG_DEADLINE, async {
            // A dedicated session is deliberately not returned to a pool and
            // will never be replaced if its transport or backend fails.
            let mut connection = PgConnection::connect_with(&options)
                .await
                .map_err(|_| AuthorityError::Unavailable)?;
            let (pid, acquired): (i32, bool) =
                sqlx::query_as("SELECT pg_backend_pid(), pg_try_advisory_lock($1)")
                    .bind(PG_KEY)
                    .fetch_one(&mut connection)
                    .await
                    .map_err(|_| AuthorityError::Unavailable)?;
            if !acquired {
                return Err(AuthorityError::Busy);
            }
            Ok(Self {
                connection: Mutex::new(connection),
                pid,
            })
        })
        .await
        .map_err(|_| AuthorityError::Unavailable)?
    }

    async fn held(&self) -> bool {
        matches!(
            timeout(PG_DEADLINE, async {
                let mut connection = self.connection.lock().await;
                sqlx::query_scalar(
                    "SELECT pg_backend_pid() = $1 AND EXISTS (
                         SELECT 1 FROM pg_locks
                         WHERE locktype = 'advisory' AND pid = $1 AND granted
                           AND mode = 'ExclusiveLock' AND objsubid = 1
                           AND classid::bigint = $2 AND objid::bigint = $3
                     )",
                )
                .bind(self.pid)
                .bind(PG_HIGH)
                .bind(PG_LOW)
                .fetch_one(&mut *connection)
                .await
            })
            .await,
            Ok(Ok(true))
        )
    }
}

impl SqliteAuthority {
    fn acquire(url: &str) -> Result<Self, AuthorityError> {
        let url = match url.strip_prefix("sqlite:///") {
            Some(path) => format!("sqlite://{path}"),
            None => url.to_owned(),
        };
        let options: SqliteConnectOptions = url.parse().map_err(|_| AuthorityError::InvalidUrl)?;
        let database_path =
            fs::canonicalize(options.get_filename()).map_err(|_| AuthorityError::Unavailable)?;
        let database_file = open_owned_file(&database_path, false, false)?;
        let database_identity = single_identity(&database_file)?;
        let mut lock_path = database_path.as_os_str().to_os_string();
        lock_path.push(".cirnet-scheduler.lock");
        let lock_path = PathBuf::from(lock_path);
        let lock_file = open_owned_file(&lock_path, true, true)?;
        let lock_identity = single_identity(&lock_file)?;
        match lock_file.try_lock() {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => return Err(AuthorityError::Busy),
            Err(TryLockError::Error(_)) => return Err(AuthorityError::Unavailable),
        }
        Ok(Self {
            database_path,
            lock_path,
            database_file,
            lock_file,
            database_identity,
            lock_identity,
        })
    }

    fn held(&self) -> bool {
        matches!(single_identity(&self.database_file), Ok(id) if id == self.database_identity)
            && matches!(single_identity(&self.lock_file), Ok(id) if id == self.lock_identity)
            && same_identity(&self.database_path, self.database_identity)
            && same_identity(&self.lock_path, self.lock_identity)
    }
}

fn open_owned_file(path: &Path, write: bool, create: bool) -> Result<File, AuthorityError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if !metadata.is_file() => return Err(AuthorityError::UnsafeIdentity),
        Err(error) if !create || error.kind() != io::ErrorKind::NotFound => {
            return Err(AuthorityError::Unavailable);
        }
        _ => {}
    }
    let mut options = OpenOptions::new();
    options
        .read(true)
        .write(write)
        .create(create)
        .truncate(false);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Storage::FileSystem::{FILE_SHARE_READ, FILE_SHARE_WRITE};
        // Keep writers functional while forbidding rename or replacement
        // of the open database and lock files until this guard drops.
        options.share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path).map_err(|_| AuthorityError::Unavailable)
}

fn single_identity(file: &File) -> Result<FileIdentity, AuthorityError> {
    let identity = file_identity(file).map_err(|_| AuthorityError::Unavailable)?;
    if identity.links != 1 {
        return Err(AuthorityError::UnsafeIdentity);
    }
    Ok(identity)
}

fn same_identity(path: &Path, expected: FileIdentity) -> bool {
    open_owned_file(path, false, false)
        .and_then(|file| single_identity(&file))
        .is_ok_and(|identity| identity == expected)
}

#[cfg(unix)]
fn file_identity(file: &File) -> io::Result<FileIdentity> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata()?;
    Ok(FileIdentity {
        volume: metadata.dev(),
        index: metadata.ino(),
        links: metadata.nlink(),
    })
}

#[cfg(windows)]
fn file_identity(file: &File) -> io::Result<FileIdentity> {
    use std::mem::MaybeUninit;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
    };
    let mut information = MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::uninit();
    // The File owns a valid handle for the duration of the Win32 call, and
    // the output points to writable storage of the required size and layout.
    let success =
        unsafe { GetFileInformationByHandle(file.as_raw_handle(), information.as_mut_ptr()) };
    if success == 0 {
        return Err(io::Error::last_os_error());
    }
    // The Win32 API initialized the record on success.
    let information = unsafe { information.assume_init() };
    Ok(FileIdentity {
        volume: u64::from(information.dwVolumeSerialNumber),
        index: (u64::from(information.nFileIndexHigh) << 32) | u64::from(information.nFileIndexLow),
        links: u64::from(information.nNumberOfLinks),
    })
}

#[cfg(not(any(unix, windows)))]
fn file_identity(_: &File) -> io::Result<FileIdentity> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "File identity unavailable",
    ))
}
