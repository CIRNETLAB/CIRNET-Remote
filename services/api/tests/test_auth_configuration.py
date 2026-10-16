import pytest
from app.config import Settings


@pytest.mark.parametrize('environment',['prod','staging','Production','',None])
def test_unknown_environment_never_falls_back_to_development(environment):
    with pytest.raises(ValueError,match='ENV'): Settings(environment=environment)


@pytest.mark.parametrize('value',['yes','0','False ','enabled',''])
def test_guest_environment_boolean_rejects_invalid_values(monkeypatch,value):
    monkeypatch.setenv('NETCIRCUIT_ALLOW_GUEST',value)
    with pytest.raises(ValueError,match='ALLOW_GUEST'): Settings()


def test_guest_environment_accepts_only_explicit_boolean_values(monkeypatch):
    monkeypatch.setenv('NETCIRCUIT_ALLOW_GUEST','false'); assert Settings().allow_guest is False
    monkeypatch.setenv('NETCIRCUIT_ALLOW_GUEST','true'); assert Settings().allow_guest is True


@pytest.mark.parametrize('value',['false',0,None])
def test_constructor_guest_policy_is_a_boolean(value):
    with pytest.raises(ValueError,match='allow_guest'): Settings(allow_guest=value)
