"""Bounded single-worker admission; safety Stop/logout bypass it at the boundary."""
from collections import OrderedDict,deque
from threading import RLock
import time


class MutationAdmission:
    def __init__(self,*,limit=60,window=60,maximum_principals=10000,clock=time.monotonic):
        if min(limit,window,maximum_principals)<=0: raise ValueError('INVALID_CONFIGURATION')
        self.limit,self.window,self.maximum_principals=limit,window,maximum_principals
        self.clock=clock
        self.lock=RLock()
        self.windows=OrderedDict()

    def allow(self,principal):
        now=self.clock()
        with self.lock:
            while self.windows and next(iter(self.windows.values()))[-1]<=now-self.window:
                self.windows.popitem(last=False)
            pending=self.windows.get(principal)
            if pending is None:
                if len(self.windows)>=self.maximum_principals: return False
                pending=deque()
                self.windows[principal]=pending
            while pending and pending[0]<=now-self.window: pending.popleft()
            if len(pending)>=self.limit: return False
            pending.append(now)
            self.windows.move_to_end(principal)
            return True
