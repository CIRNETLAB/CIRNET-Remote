from dataclasses import dataclass, field
import os
import math
from contracts.runtime_config import simulation_worker_count
from netcircuit_sim.backends import select_backend_id

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
    simulation_backend: str = field(default_factory=lambda: os.getenv('NETCIRCUIT_SIMULATION_BACKEND', 'legacy'))
    allow_guest: bool = field(default_factory=guest_mode)
    trusted_origins: tuple[str,...] = field(default_factory=lambda: tuple(value.strip() for value in os.getenv('NETCIRCUIT_TRUSTED_ORIGINS','http://testserver,http://localhost:5173,http://127.0.0.1:5173').split(',') if value.strip()))
    session_ttl_seconds: int = field(default_factory=lambda: int(os.getenv('NETCIRCUIT_SESSION_TTL_SECONDS','86400')))
    mutation_limit: int = 120
    login_limit: int = 10
    login_window_seconds: int = 60
    bootstrap_limit: int = field(default_factory=lambda:int(os.getenv('NETCIRCUIT_BOOTSTRAP_LIMIT','30')))
    auth_rate_max_buckets: int = 10000
    auth_retention_seconds: int = field(default_factory=lambda:int(os.getenv('NETCIRCUIT_AUTH_RETENTION_SECONDS','86400')))
    auth_maintenance_batch: int = field(default_factory=lambda:int(os.getenv('NETCIRCUIT_AUTH_MAINTENANCE_BATCH','100')))
    request_max_bytes: int = field(default_factory=lambda:int(os.getenv('NETCIRCUIT_REQUEST_MAX_BYTES','4194304')))
    auth_request_max_bytes: int = field(default_factory=lambda:int(os.getenv('NETCIRCUIT_AUTH_REQUEST_MAX_BYTES','16384')))
    request_json_max_depth: int = field(default_factory=lambda:int(os.getenv('NETCIRCUIT_REQUEST_JSON_MAX_DEPTH','64')))
    request_json_max_tokens: int = field(default_factory=lambda:int(os.getenv('NETCIRCUIT_REQUEST_JSON_MAX_TOKENS','2000000')))
    request_body_seconds: float = field(default_factory=lambda:float(os.getenv('NETCIRCUIT_REQUEST_BODY_SECONDS','10')))
    websocket_max_subscriptions: int = field(default_factory=lambda:int(os.getenv('NETCIRCUIT_WEBSOCKET_MAX_SUBSCRIPTIONS','512')))
    websocket_max_per_owner: int = field(default_factory=lambda:int(os.getenv('NETCIRCUIT_WEBSOCKET_MAX_PER_OWNER','16')))
    websocket_max_per_session: int = field(default_factory=lambda:int(os.getenv('NETCIRCUIT_WEBSOCKET_MAX_PER_SESSION','8')))
    websocket_event_bytes: int = 512 * 1024
    websocket_queue_bytes: int = 1024 * 1024
    websocket_total_bytes: int = 16 * 1024 * 1024
    websocket_handshake_seconds: float = field(default_factory=lambda:float(os.getenv('NETCIRCUIT_WEBSOCKET_HANDSHAKE_SECONDS','5')))
    websocket_send_seconds: float = field(default_factory=lambda:float(os.getenv('NETCIRCUIT_WEBSOCKET_SEND_SECONDS','5')))
    websocket_cleanup_seconds: float = field(default_factory=lambda:float(os.getenv('NETCIRCUIT_WEBSOCKET_CLEANUP_SECONDS','5')))
    websocket_message_limit: int = 120

    def __post_init__(self) -> None:
        limits=(self.bootstrap_limit,self.auth_rate_max_buckets,self.auth_maintenance_batch,self.request_max_bytes,
            self.auth_request_max_bytes,self.request_json_max_depth,self.request_json_max_tokens,
            self.websocket_max_subscriptions,self.websocket_max_per_owner,self.websocket_max_per_session,
            self.websocket_event_bytes,self.websocket_queue_bytes,self.websocket_total_bytes,self.websocket_message_limit)
        if any(type(value) is not int or value<1 for value in limits): raise ValueError('Invalid application resource limit')
        if self.request_max_bytes<2000000 or type(self.auth_retention_seconds) is not int or self.auth_retention_seconds<0: raise ValueError('Invalid request or retention limit')
        if self.websocket_total_bytes<=self.websocket_max_subscriptions*512 or self.websocket_queue_bytes<1024: raise ValueError('Insufficient realtime resync reserve')
        if any(not math.isfinite(value) or value<=0 or value>60 for value in (self.request_body_seconds,self.websocket_handshake_seconds,self.websocket_send_seconds,self.websocket_cleanup_seconds)):
            raise ValueError('Websocket deadlines must be finite and at most 60 seconds')
        if self.environment not in ('development','test','production'): raise ValueError('NETCIRCUIT_ENV must be development, test or production')
        if type(self.allow_guest) is not bool: raise ValueError('allow_guest must be a boolean')
        if (type(self.capture_max_bytes) is not int or self.capture_max_bytes<1 or type(self.capture_max_files) is not int
                or self.capture_max_files<1 or type(self.capture_retention_seconds) is not int or self.capture_retention_seconds<0):raise ValueError('Invalid capture quota or retention configuration')
        object.__setattr__(self,'simulation_workers',simulation_worker_count(self.simulation_workers))
        if not isinstance(self.simulation_backend,str):
            raise ValueError('NETCIRCUIT_SIMULATION_BACKEND must name a registered backend.')
        object.__setattr__(self,'simulation_backend',select_backend_id(self.simulation_backend))
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
