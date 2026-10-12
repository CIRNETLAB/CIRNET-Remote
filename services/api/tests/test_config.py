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
        Settings(environment='production',database_url=url)


def test_production_postgresql_config_does_not_need_a_running_database():
    assert Settings(environment='production',database_url='postgresql+psycopg://user:pass@localhost/lab').environment=='production'
