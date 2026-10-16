"""Bounded owner-scoped snapshot streams; no command replay or durable event log."""
import asyncio
from copy import deepcopy
from dataclasses import dataclass
from threading import RLock
import uuid

PROTOCOL_VERSION = "1.0"


@dataclass
class Subscription:
    owner: str | None
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue
    stream_id: str
    sequence: int = 0
    session_id: str | None = None
    control_client_id: str | None = None


class EventHub:
    def __init__(self):
        self.lock = RLock()
        self.subscribers = {}

    def subscribe(self, owner, *, session_id=None):
        token = uuid.uuid4().hex
        queue = asyncio.Queue(maxsize=128)
        with self.lock:
            self.subscribers[token] = Subscription(owner, asyncio.get_running_loop(), queue, uuid.uuid4().hex,session_id=session_id)
        return token, queue

    def bind_control(self,token,client_id):
        with self.lock:
            value=self.subscribers[token]
            if value.control_client_id not in (None,client_id): return False
            value.control_client_id=client_id
            return True

    def control_context(self,token):
        with self.lock:
            value=self.subscribers.get(token)
            if value is None or value.control_client_id is None: return None
            return value.owner,value.session_id,value.control_client_id

    def has_control(self,owner,session_id,client_id):
        with self.lock:
            return any((value.owner,value.session_id,value.control_client_id)==(owner,session_id,client_id)
                       for value in self.subscribers.values())

    def hello(self, token):
        with self.lock:
            subscriber = self.subscribers[token]
            return {"type": "hello", "service": "netcircuit-api", "protocol_version": PROTOCOL_VERSION,
                    "stream_id": subscriber.stream_id, "sequence": 0, "resync_required": True,
                    "supported_protocol_versions": [PROTOCOL_VERSION],
                    "capabilities": {"snapshot_resync": True, "ordered_stream": True, "replay_commands": False}}

    def _envelope(self, subscriber, event):
        subscriber.sequence += 1
        value = {**deepcopy(event), "protocol_version": PROTOCOL_VERSION,
                 "stream_id": subscriber.stream_id, "sequence": subscriber.sequence}
        if value["type"] == "experiment.updated":
            value["aggregate_id"] = value["experiment"]["experiment_id"]
            value["aggregate_revision"] = value["experiment"]["revision"]
        elif value["type"] == "station.updated":
            value["aggregate_id"] = value["station"]["station_id"]
        return value

    def protocol_error(self, token, code, message):
        with self.lock:
            return self._envelope(self.subscribers[token],
                {"type": "protocol.error", "code": code, "message": message, "retryable": False})

    def unsubscribe(self, token):
        with self.lock:
            value = self.subscribers.pop(token, None)
            if value is None:
                return False
            return not any(subscriber.owner == value.owner for subscriber in self.subscribers.values())

    def publish(self, owner, event):
        payload = deepcopy(event)
        with self.lock:
            targets = [(token, subscriber) for token, subscriber in self.subscribers.items() if subscriber.owner == owner]
        for token, subscriber in targets:
            def enqueue(token=token, subscriber=subscriber):
                with self.lock:
                    if self.subscribers.get(token) is not subscriber:
                        return
                    queue = subscriber.queue
                    if queue.full():
                        dropped = queue.qsize()
                        while not queue.empty():
                            queue.get_nowait()
                        queue.put_nowait(self._envelope(subscriber,
                            {"type": "resync.required", "reason": "QUEUE_OVERFLOW", "dropped_events": dropped}))
                    queue.put_nowait(self._envelope(subscriber, payload))
            try:
                subscriber.loop.call_soon_threadsafe(enqueue)
            except RuntimeError:
                # A closed event loop cannot retain a subscription or a lease heartbeat.
                pass
