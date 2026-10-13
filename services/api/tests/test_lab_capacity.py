"""FIFO admission follows current station slots and configured virtual workers."""
from test_lab_lifecycle import setup_manager,create,modules


def capacity_manager(tmp_path,slots=1,available=True):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    current={'slots':slots,'available':available}; original=g.capabilities
    def caps(station_id):
        value=original(station_id)
        value.update(physical_execution_slots=current['slots'],available=current['available'])
        return value
    g.capabilities=caps
    return m,repo,g,jobs,current


def enqueue(m,count):
    entries=[]
    for index in range(count):
        owner=f'student-{index}'; e=create(m,owner)
        m.run(e['experiment_id'],owner); entries.append((e['experiment_id'],owner))
    return entries


def test_zero_slots_or_offline_rejects_head_without_hardware_or_lease(tmp_path):
    m,repo,g,jobs,current=capacity_manager(tmp_path,0)
    entries=enqueue(m,2)
    for eid,owner in entries:
        assert m.get(eid,owner)['state']=='COMPLETE'
        assert m.get(eid,owner)['execution_decision']['decision']=='BLOCK_UNEXECUTABLE'
    assert not repo.leases() and not jobs.jobs and not g.calls
    current.update(slots=2,available=False)
    owner='offline-student'; eid=create(m,owner)['experiment_id']; m.run(eid,owner)
    assert m.get(eid,owner)['execution_decision']['decision']=='BLOCK_UNEXECUTABLE'


def test_two_physical_slots_reserve_two_third_waits_and_release_dispatches_fifo(tmp_path):
    m,repo,g,jobs,current=capacity_manager(tmp_path,2)
    entries=enqueue(m,3)
    assert len(repo.leases())==2 and len(jobs.jobs)==2
    assert m.queue('p1')==[entries[2][0]]
    jobs.run_one()
    assert len(repo.leases())==2 and not m.queue('p1')
    assert m.get(*entries[2])['state']=='RESERVED'
    jobs.run_one(); jobs.run_one(); assert not repo.leases()


def test_capacity_shrink_counts_existing_leases_even_outside_new_slot_range(tmp_path):
    m,repo,g,jobs,current=capacity_manager(tmp_path,2)
    entries=enqueue(m,3); current['slots']=1
    jobs.run_one()  # slot 0 released, slot 1 still occupies all current capacity
    assert len(repo.leases())==1
    assert m.get(*entries[2])['state']=='QUEUED'
    jobs.run_one()
    assert m.get(*entries[2])['state']=='RESERVED'


def test_one_quarantined_slot_blocks_whole_unpartitioned_station(tmp_path):
    m,repo,g,jobs,current=capacity_manager(tmp_path,2)
    first=enqueue(m,1)[0]; repo.quarantine(first[0])
    second=create(m,'another'); m.run(second['experiment_id'],'another')
    assert len(repo.leases())==1 and len(jobs.jobs)==1
    assert m.get(second['experiment_id'],'another')['state']=='QUEUED'


def test_configured_simulation_capacity_and_api_executor_are_not_fixed_at_four(tmp_path):
    from app.config import Settings
    assert Settings(simulation_workers=6).simulation_workers==6
    m,repo,g,jobs,current=capacity_manager(tmp_path)
    graph={'schema_version':'1.0','circuit_id':'input-led',
           'modules':[{'id':'X','type':'DIGITAL_SWITCH','properties':{'state':True}},{'id':'L','type':'LED'}],
           'connections':[{'source':'X.OUT','destination':'L.IN'}]}
    original=g.capabilities
    def caps(station_id):
        value=original(station_id); value.update(mode='simulation',virtual_digital=True)
        return value
    g.capabilities=caps
    experiments,_=modules()
    configured=experiments.ExperimentManager(repo,g,simulation_workers=6,submit=jobs)
    for index in range(7):
        owner=f'sim-{index}'; e=configured.create(owner,{'station_id':'p1','circuit_graph':graph})
        configured.run(e['experiment_id'],owner)
    assert len(repo.leases())==6 and len(configured.queue('p1'))==1
    isolated=experiments.ExperimentManager(modules()[1].Repository('sqlite://'),g,simulation_workers=6)
    try: assert isolated.executor._max_workers>6
    finally: isolated.close()
