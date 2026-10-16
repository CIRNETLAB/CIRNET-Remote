import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Settings


@pytest.mark.parametrize('mode', ['bogus', ''])
def test_settings_reject_mode_outside_api_contract(mode):
    with pytest.raises(ValueError, match='NETCIRCUIT_HARDWARE_MODE'):
        Settings(hardware_mode=mode)


@pytest.mark.parametrize('url',['sqlite://','', 'mysql://local/db'])
def test_production_requires_postgresql(url):
    with pytest.raises(ValueError,match='PostgreSQL'):
        Settings(environment='production',database_url=url,allow_guest=False,trusted_origins=('https://lab.example',))


def test_production_postgresql_config_does_not_need_a_running_database():
    assert Settings(environment='production',database_url='postgresql+psycopg://user:pass@localhost/lab',
                    allow_guest=False,trusted_origins=('https://lab.example',)).environment=='production'


@pytest.mark.parametrize('environment', ['prodution', 'Production', 'prod', ''])
def test_unknown_environment_cannot_silently_enable_development_auth(environment):
    with pytest.raises(ValueError,match='NETCIRCUIT_ENV'):
        Settings(environment=environment)


@pytest.mark.parametrize('field,value', [('capture_max_bytes',0),('capture_max_bytes',True),('capture_max_bytes',1.5),('capture_max_files',0),('capture_max_files',False),('capture_max_files',2.0),('capture_retention_seconds',-1),('capture_retention_seconds',True),('capture_retention_seconds',1.5)])
def test_capture_storage_limits_are_explicit_bounded_integers(field,value):
    with pytest.raises(ValueError,match='capture quota or retention'):
        Settings(**{field:value})


def test_capture_limits_use_deployment_environment_and_zero_disables_retention(monkeypatch):
    monkeypatch.setenv('NETCIRCUIT_CAPTURE_MAX_BYTES','1024')
    monkeypatch.setenv('NETCIRCUIT_CAPTURE_MAX_FILES','3')
    monkeypatch.setenv('NETCIRCUIT_CAPTURE_RETENTION_SECONDS','0')
    settings=Settings()
    assert (settings.capture_max_bytes,settings.capture_max_files,settings.capture_retention_seconds)==(1024,3,0)
