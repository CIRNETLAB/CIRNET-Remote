from dataclasses import dataclass, field
import os
from contracts.runtime_config import simulation_worker_count

def guest_mode() -> bool:
    value=os.getenv('NETCIRCUIT_ALLOW_GUEST','true')
    if value not in ('true','false'): raise ValueError('NETCIRCUIT_ALLOW_GUEST must be true or false')
    return value=='true'

@dataclass(frozen=True)
class Settings:
    environment: str = field(default_factory=lambda: os.getenv("NETCIRCUIT_ENV", "development"))
    hardware_mode: str = field(default_factory=lambda: os.getenv("NETCIRCUIT_HARDWARE_MODE", "simulation"))
    database_url: str = field(default_factory=lambda: os.getenv("NETCIRCUIT_DATABASE_URL", "sqlite:///./netcircuit.db"))
    hardware_grpc_target: str = field(default_factory=lambda: os.getenv("NETCIRCUIT_HARDWARE_GRPC_TARGET", "127.0.0.1:50051"))
    capture_dir: str = field(default_factory=lambda: os.getenv('NETCIRCUIT_CAPTURE_DIR','.runtime/captures'))
    capture_max_bytes: int = field(default_factory=lambda: int(os.getenv('NETCIRCUIT_CAPTURE_MAX_BYTES','268435456')))
    capture_max_files: int = field(default_factory=lambda: int(os.getenv('NETCIRCUIT_CAPTURE_MAX_FILES','4096')))
    capture_retention_seconds: int = field(default_factory=lambda: int(os.getenv('NETCIRCUIT_CAPTURE_RETENTION_SECONDS','2592000')))
    simulation_workers: int = field(default_factory=simulation_worker_count)
    allow_guest: bool = field(default_factory=guest_mode)
    trusted_origins: tuple[str,...] = field(default_factory=lambda: tuple(value.strip() for value in os.getenv('NETCIRCUIT_TRUSTED_ORIGINS','http://testserver,http://localhost:5173,http://127.0.0.1:5173').split(',') if value.strip()))
    session_ttl_seconds: int = field(default_factory=lambda: int(os.getenv('NETCIRCUIT_SESSION_TTL_SECONDS','86400')))
    mutation_limit: int = 120
    login_limit: int = 10
    login_window_seconds: int = 60

    def __post_init__(self) -> None:
        if self.environment not in ('development','test','production'): raise ValueError('NETCIRCUIT_ENV must be development, test or production')
        if type(self.allow_guest) is not bool: raise ValueError('allow_guest must be a boolean')
        if (type(self.capture_max_bytes) is not int or self.capture_max_bytes<1 or type(self.capture_max_files) is not int
                or self.capture_max_files<1 or type(self.capture_retention_seconds) is not int or self.capture_retention_seconds<0):raise ValueError('Invalid capture quota or retention configuration')
        object.__setattr__(self,'simulation_workers',simulation_worker_count(self.simulation_workers))
        from urllib.parse import urlsplit
        if self.session_ttl_seconds<60 or self.session_ttl_seconds>604800: raise ValueError('Session TTL must be between 60 and 604800 seconds')
        for origin in self.trusted_origins:
            parsed=urlsplit(origin)
            if parsed.scheme not in ('http','https') or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username: raise ValueError('Trusted origins must be exact HTTP origins')
        if self.hardware_mode not in ("simulation", "hardware"):
            raise ValueError("NETCIRCUIT_HARDWARE_MODE must be 'simulation' or 'hardware'.")
        if self.environment == 'production':
            if self.allow_guest: raise ValueError('Production requires NETCIRCUIT_ALLOW_GUEST=false')
            if not self.trusted_origins or 'http://testserver' in self.trusted_origins or any(not origin.startswith('https://') for origin in self.trusted_origins): raise ValueError('Production requires explicit HTTPS trusted origins')
            from sqlalchemy.engine import make_url
            try:
                url = make_url(self.database_url)
                valid = url.get_backend_name() == 'postgresql' and bool(url.database)
            except Exception:
                valid = False
            if not valid:
                raise ValueError('Production requires a PostgreSQL database URL')
            if url.drivername == 'postgresql':
                object.__setattr__(self, 'database_url', url.set(drivername='postgresql+psycopg').render_as_string(hide_password=False))

settings = Settings()
