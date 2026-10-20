"""Bounded owner-scoped snapshot streams, including producer-to-loop ingress."""
import asyncio
from collections import deque
from copy import deepcopy
from dataclasses import dataclass,field
import json
from threading import RLock
import uuid

PROTOCOL_VERSION = '1.0'


class SubscriptionLimit(ValueError):
    pass


class EventQueue(asyncio.Queue):
    def __init__(self,hub,subscriber):
        super().__init__(maxsize=128)
        self.hub=hub;self.subscriber=subscriber;self.sizes=deque()
        self.account_delivery=False;self.inflight=deque()

    def put_nowait(self,item):
        size=len(json.dumps(item,separators=(',',':'),ensure_ascii=True).encode())
        with self.hub.lock:
            if self.subscriber.retained_bytes+size>self.hub.queue_bytes or self.hub.retained_bytes+size>self.hub.total_bytes:
                raise asyncio.QueueFull
            super().put_nowait(item)
            self.sizes.append(size)
            self.subscriber.retained_bytes+=size;self.hub.retained_bytes+=size

    def get_nowait(self):
        with self.hub.lock:
            value=super().get_nowait()
            size=self.sizes.popleft()
            if self.account_delivery:self.inflight.append(size)
            else:self.subscriber.retained_bytes-=size;self.hub.retained_bytes-=size
            return value

    def release_delivery(self):
        with self.hub.lock:
            if self.inflight:
                size=self.inflight.popleft()
                self.subscriber.retained_bytes-=size;self.hub.retained_bytes-=size
                self.task_done()

    def discard_pending(self):
        with self.hub.lock:
            holding=self.account_delivery;self.account_delivery=False
            try:
                while not self.empty():self.get_nowait();self.task_done()
            finally:self.account_delivery=holding


@dataclass
class Subscription:
    owner: str|None
    loop: asyncio.AbstractEventLoop
    stream_id: str
    queue: asyncio.Queue|None=None
    sequence: int=0
    session_id: str|None=None
    control_client_id: str|None=None
    ingress: deque=field(default_factory=deque)
    retained_bytes: int=0
    scheduled: bool=False
    dropped: int=0


class EventHub:
    def __init__(self,*,maximum_subscriptions=512,maximum_per_owner=16,maximum_per_session=8,
                 event_bytes=512*1024,queue_bytes=1024*1024,total_bytes=16*1024*1024):
        self.lock=RLock();self.subscribers={};self.retained_bytes=0
        self.maximum_subscriptions=maximum_subscriptions;self.maximum_per_owner=maximum_per_owner
        self.maximum_per_session=maximum_per_session;self.event_bytes=event_bytes
        self.queue_bytes=queue_bytes;self.total_bytes=total_bytes
        self.data_bytes=max(0,total_bytes-maximum_subscriptions*512)

    def subscribe(self,owner,*,session_id=None):
        with self.lock:
            values=list(self.subscribers.values())
            if (len(values)>=self.maximum_subscriptions or sum(value.owner==owner for value in values)>=self.maximum_per_owner
                    or (session_id and sum(value.session_id==session_id for value in values)>=self.maximum_per_session)):
                raise SubscriptionLimit('SUBSCRIPTION_LIMIT')
            token=uuid.uuid4().hex
            subscriber=Subscription(owner,asyncio.get_running_loop(),uuid.uuid4().hex,session_id=session_id)
            subscriber.queue=EventQueue(self,subscriber)
            self.subscribers[token]=subscriber
            return token,subscriber.queue

    def metrics(self):
        with self.lock:
            return {'subscriptions':len(self.subscribers),'retained_bytes':self.retained_bytes,
                'ingress_events':sum(len(value.ingress) for value in self.subscribers.values()),
                'scheduled_drains':sum(value.scheduled for value in self.subscribers.values())}

    def bind_control(self,token,client_id):
        with self.lock:
            value=self.subscribers[token]
            if value.control_client_id not in (None,client_id):return False
            value.control_client_id=client_id;return True

    def control_context(self,token):
        with self.lock:
            value=self.subscribers.get(token)
            if value is None or value.control_client_id is None:return None
            return value.owner,value.session_id,value.control_client_id

    def has_control(self,owner,session_id,client_id):
        with self.lock:
            return any(not value.loop.is_closed() and (value.owner,value.session_id,value.control_client_id)==(owner,session_id,client_id)
                       for value in self.subscribers.values())

    def hello(self,token):
        with self.lock:
            subscriber=self.subscribers[token]
            return {'type':'hello','service':'netcircuit-api','protocol_version':PROTOCOL_VERSION,
                'stream_id':subscriber.stream_id,'sequence':0,'resync_required':True,
                'supported_protocol_versions':[PROTOCOL_VERSION],
                'capabilities':{'snapshot_resync':True,'ordered_stream':True,'replay_commands':False}}

    def _envelope(self,subscriber,event):
        subscriber.sequence+=1
        value={**event,'protocol_version':PROTOCOL_VERSION,'stream_id':subscriber.stream_id,'sequence':subscriber.sequence}
        if value['type']=='experiment.updated':
            value['aggregate_id']=value['experiment']['experiment_id'];value['aggregate_revision']=value['experiment']['revision']
        elif value['type']=='station.updated':value['aggregate_id']=value['station']['station_id']
        return value

    def protocol_error(self,token,code,message):
        with self.lock:
            return self._envelope(self.subscribers[token],{'type':'protocol.error','code':code,'message':message,'retryable':False})

    def unsubscribe(self,token):
        with self.lock:
            value=self.subscribers.pop(token,None)
            if value is None:return False
            self.retained_bytes-=value.retained_bytes;value.retained_bytes=0
            value.ingress.clear()
            # get_nowait may still run from the connection cancellation race.
            value.queue.sizes=deque(0 for _ in value.queue.sizes)
            value.queue.inflight=deque(0 for _ in value.queue.inflight)
            return not any(subscriber.owner==value.owner for subscriber in self.subscribers.values())

    def _discard_ingress(self,subscriber):
        amount=sum(size for _,size in subscriber.ingress)
        subscriber.retained_bytes-=amount;self.retained_bytes-=amount
        subscriber.ingress.clear()

    def _drain(self,token,subscriber):
        with self.lock:
            if self.subscribers.get(token) is not subscriber:return
            queue=subscriber.queue
            pending=list(subscriber.ingress);self._discard_ingress(subscriber)
            if subscriber.dropped or queue.qsize()+len(pending)>queue.maxsize:
                dropped=subscriber.dropped+queue.qsize()
                queue.discard_pending()
                queue.put_nowait(self._envelope(subscriber,{'type':'resync.required','reason':'QUEUE_OVERFLOW','dropped_events':max(1,dropped)}))
                subscriber.dropped=0
            for event,_ in pending:
                try:queue.put_nowait(self._envelope(subscriber,event))
                except asyncio.QueueFull:
                    queue.discard_pending()
                    queue.put_nowait(self._envelope(subscriber,{'type':'resync.required','reason':'QUEUE_OVERFLOW','dropped_events':1}))
                    try:queue.put_nowait(self._envelope(subscriber,event))
                    except asyncio.QueueFull:pass
            subscriber.scheduled=False

    def publish(self,owner,event):
        # One immutable snapshot shared among targets; no deepcopy per subscriber.
        payload=deepcopy(event)
        size=len(json.dumps(payload,separators=(',',':'),ensure_ascii=True).encode())+512
        with self.lock:
            for token,subscriber in list(self.subscribers.items()):
                if subscriber.owner!=owner:continue
                if subscriber.loop.is_closed():
                    self.unsubscribe(token);continue
                if (len(subscriber.ingress)>=127 or subscriber.retained_bytes+size>self.queue_bytes
                        or self.retained_bytes+size>self.data_bytes or size>self.event_bytes):
                    subscriber.dropped+=len(subscriber.ingress)+1
                    self._discard_ingress(subscriber)
                if (size<=self.event_bytes and subscriber.retained_bytes+size<=self.queue_bytes
                        and self.retained_bytes+size<=self.data_bytes):
                    subscriber.ingress.append((payload,size));subscriber.retained_bytes+=size;self.retained_bytes+=size
                if not subscriber.scheduled:
                    subscriber.scheduled=True
                    try:subscriber.loop.call_soon_threadsafe(self._drain,token,subscriber)
                    except RuntimeError:self.unsubscribe(token)
