"""Bounded owned snapshots restore views without admitting or replaying execution."""
from sqlalchemy import event
import pytest
from test_lab_lifecycle import setup_manager,create


def test_history_is_newest_first_bounded_private_and_does_not_scan_all_experiments(tmp_path,monkeypatch):
    manager,repo,_,_,_,_=setup_manager(tmp_path)
    owned=[create(manager,'owner')['experiment_id'] for _ in range(5)]
    create(manager,'other')
    queries=[]
    event.listen(repo.engine,'before_cursor_execute',lambda db,cursor,statement,parameters,context,many:queries.append(statement))
    monkeypatch.setattr(repo,'list_experiments',lambda *args:pytest.fail('Paged history must not load the complete JSON history'))
    first=manager.history('owner',limit=2)
    second=manager.history('owner',limit=2,cursor=first['next_cursor'])
    third=manager.history('owner',limit=2,cursor=second['next_cursor'])
    assert [value['experiment_id'] for page in (first,second,third) for value in page['items']]==list(reversed(owned))
    assert third['next_cursor'] is None and len(first['items'])==2
    assert all(not any(key.startswith('_') for key in record) for record in first['items'])
    assert any('LIMIT' in query and 'owner_id' in query for query in queries)
    with pytest.raises(ValueError,match='INVALID_CURSOR'): manager.history('other',limit=2,cursor=first['next_cursor'])
    manager.closed=True;repo.close()


def test_active_snapshot_prioritizes_admitted_runs_and_includes_unstarted_create_pages(tmp_path):
    manager,repo,_,_,_,_=setup_manager(tmp_path)
    running=create(manager,'owner')['experiment_id'];manager.run(running,'owner')
    terminal=create(manager,'owner')['experiment_id'];manager._transition(terminal,'COMPLETE')
    pending=[create(manager,'owner')['experiment_id'] for _ in range(105)]
    create(manager,'stranger')
    first=manager.active_snapshot('owner')
    assert first['items'][0]['experiment_id']==running
    assert len(first['items'])==100 and first['next_cursor']
    second=manager.active_snapshot('owner',cursor=first['next_cursor'])
    ids=[record['experiment_id'] for page in (first,second) for record in page['items']]
    assert ids==[running,*reversed(pending)] and second['next_cursor'] is None
    assert terminal not in ids
    manager.close();repo.close()


def test_history_cursors_and_limits_are_strict_and_snapshot_scoped(tmp_path):
    manager,repo,_,_,_,_=setup_manager(tmp_path)
    for _ in range(3):create(manager,'owner')
    first=manager.history('owner',limit=1)
    for limit in (0,101,True,1.5):
        with pytest.raises(ValueError,match='INVALID_PAGE_LIMIT'):manager.history('owner',limit=limit)
    for cursor in ('','not-base64','e30','x'*1025):
        with pytest.raises(ValueError,match='INVALID_CURSOR'):manager.history('owner',cursor=cursor)
    with pytest.raises(ValueError,match='INVALID_CURSOR'):manager.active_snapshot('owner',cursor=first['next_cursor'])
    manager.close();repo.close()


def test_active_snapshot_keeps_a_quarantined_terminal_reservation_visible(tmp_path):
    manager,repo,_,_,_,_=setup_manager(tmp_path)
    eid=create(manager,'owner')['experiment_id']
    assert repo.reserve('p1',0,eid,0)
    repo.quarantine(eid);manager._transition(eid,'FAULT',error_code='RESTART_RECOVERY')
    assert [record['experiment_id'] for record in manager.active_snapshot('owner')['items']]==[eid]
    manager.close();repo.close()


def test_http_history_active_and_cursor_scope_are_typed_and_private():
    from app.main import create_app
    from app.services.persistence import Repository
    from contracts.registry import validate_contract
    from csrf_client import CsrfTestClient,publish_fixture_assignment
    from test_lab_lifecycle import LabGateway,DeferredJobs,assignment
    app=create_app(repository=Repository('sqlite://'),gateway=LabGateway(),submit=DeferredJobs())
    publish_fixture_assignment(app,assignment())
    with CsrfTestClient(app) as owner,CsrfTestClient(app) as stranger:
        ids=[]
        for _ in range(3):
            response=owner.post('/api/experiments',json={'station_id':'p1','assignment_id':'a1'})
            assert response.status_code==201,response.text
            ids.append(response.json()['experiment_id'])
        page=owner.get('/api/experiments/history?limit=2')
        assert page.status_code==200,page.text
        assert [value['experiment_id'] for value in page.json()['items']]==list(reversed(ids))[:2]
        validate_contract('ExperimentHistoryPage',page.json(),profile='transport')
        assert owner.get('/api/experiments/history',params={'cursor':page.json()['next_cursor']}).json()['items'][0]['experiment_id']==ids[0]
        assert stranger.get('/api/experiments/history').json()['items']==[]
        assert stranger.get('/api/experiments/active').json()['items']==[]
        assert stranger.get('/api/experiments/history',params={'cursor':page.json()['next_cursor']}).status_code==422
        assert owner.get('/api/experiments/history?limit=101').status_code==422
        active=owner.get('/api/experiments/active')
        assert active.status_code==200,active.text
        validate_contract('ExperimentActiveSnapshot',active.json(),profile='transport')
        assert all(not any(key.startswith('_') for key in record) for record in active.json()['items'])
        assert len(app.state.gateway.calls)==0


def test_queue_snapshot_does_not_load_experiment_history_payloads(monkeypatch):
    from app.main import create_app
    from app.services.persistence import Repository
    from csrf_client import CsrfTestClient,publish_fixture_assignment
    from test_lab_lifecycle import LabGateway,DeferredJobs,assignment
    app=create_app(repository=Repository('sqlite://'),gateway=LabGateway(),submit=DeferredJobs())
    now=[100.0];app.state.manager.clock=lambda:now[0]
    publish_fixture_assignment(app,assignment())
    with CsrfTestClient(app) as owner,CsrfTestClient(app) as stranger,CsrfTestClient(app) as other:
        ids=[]
        for client in (stranger,owner,other):
            response=client.post('/api/experiments',json={'station_id':'physical-station-01','assignment_id':'a1'})
            assert response.status_code==201,response.text
            identity=response.json()['experiment_id'];ids.append(identity)
            assert client.post('/api/experiments/'+identity+'/run').status_code==200
            now[0]+=2
        with monkeypatch.context() as guard:
            reads=[];original=app.state.repository.list_experiments
            def tracked(owner_id=None):
                if owner_id is not None:reads.append(owner_id)
                return original(owner_id)
            guard.setattr(app.state.repository,'list_experiments',tracked)
            value=owner.get('/api/stations/physical-station-01/queue')
        assert value.status_code==200,value.text
        assert reads==[],'Queue snapshots must not read complete owner history JSON'
        assert value.json()['queued_count']==2
        assert value.json()['own_positions']==[{'experiment_id':ids[1],'position':1}]
        assert ids[2] not in str(value.json())
