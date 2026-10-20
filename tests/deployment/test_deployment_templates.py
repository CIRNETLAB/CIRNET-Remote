from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
DEPLOY=ROOT/'deployment'


def test_required_deployment_templates_exist():
    required=[
        'nginx/netcircuit.conf',
        'systemd/netcircuit-api.service',
        'systemd/netcircuit-hardware.service',
        'mini-pc/README.md',
        'README.md',
    ]
    missing=[p for p in required if not (DEPLOY/p).is_file()]
    assert not missing, missing


def test_nginx_serves_spa_and_proxies_api_and_websocket_only():
    text=(DEPLOY/'nginx/netcircuit.conf').read_text()
    assert 'try_files $uri $uri/ /index.html' in text
    assert 'location /api/' in text
    assert 'proxy_pass http://127.0.0.1:8000' in text
    assert 'location /ws/' in text
    assert 'proxy_set_header Upgrade $http_upgrade' in text
    assert '50051' not in text


def test_hardware_service_is_local_only():
    text=(DEPLOY/'systemd/netcircuit-hardware.service').read_text()
    assert '127.0.0.1:50051' in text
    assert '0.0.0.0:50051' not in text


def test_production_proxy_requires_tls_for_secure_auth_and_preserves_websocket_origin():
    text=(DEPLOY/'nginx/netcircuit.conf').read_text()
    assert 'listen 443 ssl' in text and 'ssl_certificate ' in text
    assert 'return 308 https://lab.example.invalid$request_uri' in text
    assert 'proxy_set_header Origin $http_origin' in text
    assert 'client_max_body_size 4m' in text
    assert 'proxy_buffering off' in text


def test_single_worker_startup_checks_migrations_and_uses_persistent_capture_state():
    text=(DEPLOY/'systemd/netcircuit-api.service').read_text()
    assert 'EnvironmentFile=/etc/netcircuit/netcircuit.env' in text
    assert 'StateDirectory=netcircuit' in text and 'WorkingDirectory=/var/lib/netcircuit' in text
    assert '-m app.migrate --check' in text and '--workers 1' in text
    assert '--forwarded-allow-ips 127.0.0.1' in text
    # Bound the protocol receive queue before frames reach the application's
    # independent 64KiB/message and per-session admission checks.
    assert '--ws-max-size 65536' in text and '--ws-max-queue 4' in text


def test_capture_retention_is_an_explicit_bounded_separate_timer():
    service=(DEPLOY/'systemd/netcircuit-capture-maintenance.service').read_text()
    timer=(DEPLOY/'systemd/netcircuit-capture-maintenance.timer').read_text()
    assert 'Type=oneshot' in service and '-m app.capture_maintenance --limit 100' in service
    assert '-m app.migrate --check' in service and 'StateDirectory=netcircuit' in service
    assert 'OnCalendar=hourly' in timer and 'Persistent=true' in timer
    assert 'uvicorn' not in service and 'hardware_service' not in service


def test_production_environment_example_is_valid_without_opening_database_or_hardware(monkeypatch):
    from app.config import Settings
    for line in (DEPLOY/'netcircuit.production.env.example').read_text().splitlines():
        if line and not line.startswith('#'):
            name,value=line.split('=',1);monkeypatch.setenv(name,value)
    configuration=Settings()
    assert configuration.environment=='production' and configuration.allow_guest is False
    assert configuration.capture_dir=='/var/lib/netcircuit/captures'
    assert configuration.capture_retention_seconds==2592000
    assert configuration.trusted_origins==('https://lab.example.invalid',)
