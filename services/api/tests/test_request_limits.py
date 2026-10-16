from app.services.request_limits import MutationAdmission


def test_admission_window_expires_and_does_not_mix_principals():
    now=[0.0]
    admission=MutationAdmission(limit=2,window=60,clock=lambda:now[0])
    assert admission.allow('alice') and admission.allow('alice')
    assert not admission.allow('alice')
    assert admission.allow('bob')
    now[0]=60
    assert admission.allow('alice')


def test_new_principals_cannot_grow_admission_memory_without_bound():
    now=[0.0]
    admission=MutationAdmission(limit=2,window=60,maximum_principals=2,clock=lambda:now[0])
    assert admission.allow('alice') and admission.allow('bob')
    assert not admission.allow('third')
    now[0]=61
    assert admission.allow('third')
