from dataclasses import dataclass, field
import os
from contracts.runtime_config import simulation_worker_count

@dataclass(frozen=True)
class Settings:
    environment: str = field(default_factory=lambda: os.getenv("NETCIRCUIT_ENV", "development"))
    hardware_mode: str = field(default_factory=lambda: os.getenv("NETCIRCUIT_HARDWARE_MODE", "simulation"))
    database_url: str = field(default_factory=lambda: os.getenv("NETCIRCUIT_DATABASE_URL", "sqlite:///./netcircuit.db"))
    hardware_grpc_target: str = field(default_factory=lambda: os.getenv("NETCIRCUIT_HARDWARE_GRPC_TARGET", "127.0.0.1:50051"))
    capture_dir: str = field(default_factory=lambda: os.getenv('NETCIRCUIT_CAPTURE_DIR','.runtime/captures'))
    simulation_workers: int = field(default_factory=simulation_worker_count)

    def __post_init__(self) -> None:
        object.__setattr__(self,'simulation_workers',simulation_worker_count(self.simulation_workers))
        if self.hardware_mode not in ("simulation", "hardware"):
            raise ValueError("NETCIRCUIT_HARDWARE_MODE must be 'simulation' or 'hardware'.")
        if self.environment == 'production':
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
