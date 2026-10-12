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
