"""Bounded owner-scoped lifecycle subscriptions; publishers can run in worker threads."""
import asyncio
from threading import RLock
import uuid

class EventHub:
    def __init__(self):
        self.lock=RLock()
        self.subscribers={}

    def subscribe(self,owner):
        token=uuid.uuid4().hex
        queue=asyncio.Queue(maxsize=128)
        with self.lock:
            self.subscribers[token]=(owner,asyncio.get_running_loop(),queue)
        return token,queue

    def unsubscribe(self,token):
        with self.lock:
            value=self.subscribers.pop(token,None)
            if value is None: return False
            return not any(s[0]==value[0] for s in self.subscribers.values())

    def publish(self,owner,event):
        with self.lock: targets=list(self.subscribers.values())
        for target,loop,queue in targets:
            if target!=owner: continue
            def enqueue(queue=queue,event=event):
                if queue.full(): queue.get_nowait()
                queue.put_nowait(event)
            try: loop.call_soon_threadsafe(enqueue)
            except RuntimeError: pass
