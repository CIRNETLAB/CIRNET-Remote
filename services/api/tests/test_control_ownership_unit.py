"""Control lifetime is scoped to a tab/session, independently of data ownership."""
import asyncio
from app.services.events import EventHub
from test_lab_lifecycle import setup_manager,create


def test_viewer_disconnect_does_not_cancel_another_control_client(tmp_path):
    manager,repo,gateway,jobs,_,_=setup_manager(tmp_path)
    eid=create(manager,'alice')['experiment_id']
    manager.run(eid,'alice',control_session_id='login-a',control_client_id='controller')
    manager.disconnect_control('login-a','viewer')
    manager.disconnect_control('other-login','controller')
    assert manager.get(eid,'alice')['state']=='RESERVED'
    manager.disconnect_control('login-a','controller')
    jobs.run_one()
    assert manager.get(eid,'alice')['error_code']=='DISCONNECTED'
    assert not repo.leases()
    manager.close(); repo.close()


def test_revoked_control_session_cannot_be_maintained_by_a_viewer(tmp_path):
    manager,repo,gateway,jobs,_,_=setup_manager(tmp_path)
    eid=create(manager,'alice')['experiment_id']
    manager.run(eid,'alice',control_session_id='revoked',control_client_id='controller')
    manager.expire_control_sessions(lambda session:session!='revoked')
    jobs.run_one()
    assert manager.get(eid,'alice')['error_code']=='SESSION_EXPIRED'
    manager.close(); repo.close()


def test_control_binding_cannot_switch_context_and_viewers_are_distinct():
    async def check():
        hub=EventHub()
        controller,_=hub.subscribe('alice',session_id='login-a')
        viewer,_=hub.subscribe('alice',session_id='login-a')
        assert hub.bind_control(controller,'controller')
        assert not hub.bind_control(controller,'different-client')
        assert hub.bind_control(viewer,'viewer')
        assert hub.control_context(controller)==('alice','login-a','controller')
        hub.unsubscribe(controller)
        assert not hub.has_control('alice','login-a','controller')
        assert hub.has_control('alice','login-a','viewer')
    asyncio.run(check())


def test_revoked_session_is_rechecked_before_any_hardware_start(tmp_path):
    manager,repo,gateway,jobs,_,_=setup_manager(tmp_path)
    active=[True]
    manager.control_session_active=lambda session:active[0]
    eid=create(manager,'alice')['experiment_id']
    manager.run(eid,'alice',control_session_id='login-a',control_client_id='controller')
    active[0]=False
    jobs.run_one()
    assert 'start_execution' not in gateway.calls
    assert manager.get(eid,'alice')['error_code']=='SESSION_EXPIRED'
    manager.close(); repo.close()
