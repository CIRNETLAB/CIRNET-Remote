"""Bounded software probes: actual scheduler workers, controlled RPC and asyncio.

The gateway is explicitly the regression fixture, never hardware timing evidence.
Raw measurements and fixture state use the shared external artifact session.
"""
import asyncio
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
from pathlib import Path
import sys
from threading import Event, local
from time import perf_counter

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from scripts.artifact_paths import artifact_directory


def summary(values):
    values=sorted(values)
    def percentile(fraction):return round(values[max(0,math.ceil(len(values)*fraction)-1)]*1000,3)
    return {'count':len(values),'p50_ms':percentile(.5),'p95_ms':percentile(.95),'p99_ms':percentile(.99),'max_ms':percentile(1)} if values else {'count':0}


class TimedLock:
    def __init__(self,lock):
        self.lock=lock;self.scope=local();self.wait=deque(maxlen=4096);self.hold=deque(maxlen=4096)
    def acquire(self,*args,**kwargs):
        began=perf_counter();acquired=self.lock.acquire(*args,**kwargs)
        if acquired:
            now=perf_counter();self.wait.append(now-began)
            if not hasattr(self.scope,'starts'):self.scope.starts=[]
            self.scope.starts.append(now)
        return acquired
    def release(self):
        self.hold.append(perf_counter()-self.scope.starts.pop());self.lock.release()
    def __enter__(self):self.acquire();return self
    def __exit__(self,*_):self.release()


async def event_probe():
    from app.services.events import EventHub
    hub=EventHub();token,queue=hub.subscribe('probe',session_id='probe');loop=asyncio.get_running_loop()
    original=loop.call_soon_threadsafe;scheduled=0;peak={};bursts=10;published=0
    def schedule(callback,*args,**kwargs):
        nonlocal scheduled
        scheduled+=1;return original(callback,*args,**kwargs)
    loop.call_soon_threadsafe=schedule
    try:
        for burst in range(bursts):
            for index in range(1001):
                hub.publish('probe',{'type':'station.updated','station':{'station_id':'software-fixture','revision':published}})
                published+=1
                for key,value in hub.metrics().items():peak[key]=max(peak.get(key,0),value)
            await asyncio.sleep(0)
            # Leave the consumer unread across bursts, exercising overflow too.
        resync=0
        while not queue.empty():resync+=queue.get_nowait()['type']=='resync.required'
        hub.unsubscribe(token)
        return {'publications':published,'bursts':bursts,'scheduled_callbacks':scheduled,'peak':peak,
                'resync_markers_observed':resync,'retained_after_cleanup':hub.metrics()['retained_bytes']}
    finally:loop.call_soon_threadsafe=original


def control_probe(directory):
    sys.path.insert(0,str(ROOT/'services/api/tests'))
    from test_lab_lifecycle import setup_manager,assignment
    from test_instrument_lifecycle import configuration
    stops=[];accepted=[];waits=[];holds=[];pool=[]
    for iteration in range(6):
        case=directory/str(iteration);case.mkdir()
        manager,repo,gateway,*_=setup_manager(case)
        lock=TimedLock(manager.lock);manager.lock=lock
        original_connect=repo.engine.connect
        def connect(*args,**kwargs):
            began=perf_counter();connection=original_connect(*args,**kwargs);pool.append(perf_counter()-began);return connection
        repo.engine.connect=connect
        definition=assignment();definition['assignment_id']='generator';definition['lab_endpoints'][0].update(role='GENERATOR',channel=1);repo.create_assignment(definition)
        caps=gateway.capabilities;call=gateway.call;emit=manager.emit
        running={station:Event() for station in ('A','B')};finish=Event();blocked=Event();release=Event();sent=Event();began=[None];ids={}
        def capabilities(station):
            value=caps(station);value['instrument_capabilities']['generator']={'channels':1,'runtime_reconfiguration_supported':True};value['routing_resources'][0]['roles'].append('GENERATOR');return value
        def remote(station,eid,method,**kwargs):
            if method=='start_execution':running[station].set();assert finish.wait(30)
            if method=='configure_instrument' and station=='A':blocked.set();assert release.wait(30)
            if method=='stop_execution' and station=='B':sent.set()
            return call(station,eid,method,**kwargs)
        def changed(owner,event):
            emit(owner,event)
            if began[0] is not None and event['experiment']['experiment_id']==ids.get('B') and event['experiment']['state']=='STOPPING':accepted.append(perf_counter()-began[0]);began[0]=None
        gateway.capabilities=capabilities;gateway.call=remote;manager.emit=changed
        workers=ThreadPoolExecutor(max_workers=4);manager.submit=workers.submit
        try:
            for station in ('A','B'):
                record=manager.create(station,{'station_id':station,'assignment_id':'generator'});ids[station]=record['experiment_id'];manager.run(ids[station],station);assert running[station].wait(10)
            pending=workers.submit(manager.configure_instrument,ids['A'],'A',{'instrument':'generator','configuration':configuration()});assert blocked.wait(10)
            began[0]=perf_counter();start=began[0];stopping=workers.submit(manager.stop,ids['B'],'B');assert sent.wait(10);stopping.result(10);stops.append(perf_counter()-start)
            assert manager.cancel[ids['B']].is_set() and not release.is_set()
        finally:
            release.set();finish.set();workers.shutdown(wait=True);manager.close();repo.close()
        waits.extend(lock.wait);holds.extend(lock.hold)
    return {'samples':6,'unrelated_stop':summary(stops),'cancel_acceptance':summary(accepted),
            'global_lock_wait':summary(waits),'global_lock_hold':summary(holds),
            'database_connection_checkout_including_pool':summary(pool),'reservoir_bound_per_lock':4096,
            'gateway':'explicit regression fixture; no physical timing claim'}


def main():
    directory=artifact_directory('bounds-probe')
    os.environ['NETCIRCUIT_CAPTURE_DIR']=str(directory/'captures')
    os.environ['NETCIRCUIT_DATABASE_URL']='sqlite:///'+(directory/'default.db').as_posix()
    result={'event_ingress':asyncio.run(event_probe()),'control':control_probe(directory),
            'database_history':'Real PostgreSQL 2,000-history/active-index workload is a separate release gate.',
            'limits':'Local bounded probe with concurrent verification; not target capacity or a soak.'}
    (directory/'report.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result))


if __name__=='__main__':main()
