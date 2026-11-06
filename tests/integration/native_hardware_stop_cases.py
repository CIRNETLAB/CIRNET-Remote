"""Paired Stage 3 HTTP Stop with four real C++ requests in flight."""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack, closing, contextmanager, nullcontext
from contextvars import ContextVar
import ctypes
from ctypes import wintypes
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sqlite3
from statistics import median
import subprocess
import sys
from threading import Barrier, Condition, Event, Lock
from time import get_clock_info, monotonic, perf_counter_ns, sleep
from uuid import uuid4

import grpc
import psutil
import pytest

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import Metrics, Session
from tests.integration import native_external_baseline_cases as harness
from tests.integration import native_stop_baseline_cases as stop
from tests.integration.native_hardware_gate_cases import matrix_services, selected, serve_test_lane


PEER_CAPTURE_SHA256 = "e1cf0959657fb5eaf833b8d0093d149942e22b3e6ad4ead2ef9f9bcaa2d1dc23"
# CNP1 prefix, header, 93 edges, 124 gates, 215,623 events and one probe.
SATURATED_REQUEST_BYTES = 2_806_507
STOP_INGRESS_HEADER = "x-cirnet-stop-ingress"
STOP_INGRESS_CLOCK = "qpc-ns-v1"
STOP_INGRESS_PATTERN = re.compile(r"qpc-ns-v1:([0-9a-f]{32}):([1-9][0-9]{0,18})")


def _decode_stop_ingress(metadata):
    values = [value for key, value in metadata if key == STOP_INGRESS_HEADER]
    if len(values) != 1 or not isinstance(values[0], str):
        return None
    match = STOP_INGRESS_PATTERN.fullmatch(values[0])
    if match is None:
        return None
    experiment, entered = match.groups()
    entered = int(entered)
    if entered > (1 << 63) - 1:
        return None
    return {"experiment_id": experiment, "entered_ns": entered}


START_WAVE_HEADER = "x-cirnet-start-wave"
START_WAVE_ENV = "CIRNET_HARDWARE_START_RENDEZVOUS"
STOP_METHOD_ENV = "CIRNET_NATIVE_STAGE3_STOP_METHOD"
STOP_ACCEPTANCE_SCOPE_ENV = "CIRNET_NATIVE_STAGE3_STOP_ACCEPTANCE_SCOPE"
WINDOWS_FUNCTIONAL_SAFETY = "windows-functional-safety-v1"
REMOTE_RENDEZVOUS = "natural-loaded-stop-remote-rendezvous-v1"
HARDWARE_RENDEZVOUS = "natural-loaded-stop-hardware-rendezvous-v1"
IDLE_PRE_DISPATCH = "natural-loaded-stop-idle-pre-dispatch-v1"
START_WAVE_PATTERN = re.compile(
    r"qpc-ns-v1:([0-9a-f]{32}):([0-9a-f]{32}):([1-9][0-9]{0,18}):([1-9][0-9]{0,18})"
)
EXPERIMENT_ID = re.compile(r"[0-9a-f]{32}")


def _start_wave_metadata(wave_id, identities):
    members = tuple(sorted(identities))
    assert len(members) == len(set(members)) == stop.WORKERS
    assert EXPERIMENT_ID.fullmatch(wave_id) and all(EXPERIMENT_ID.fullmatch(member) for member in members)
    return ":".join(("v1", wave_id, *members))


def _decode_start_wave(metadata):
    values = [value for key, value in metadata if key == START_WAVE_HEADER]
    if len(values) != 1 or not isinstance(values[0], str):
        return None
    match = START_WAVE_PATTERN.fullmatch(values[0])
    if match is None:
        return None
    wave, identity, entered, released = match.groups()
    entered, released = int(entered), int(released)
    if not 0 < entered <= released <= (1 << 63) - 1:
        return None
    return {"wave_id": wave, "experiment_id": identity, "entered_ns": entered, "released_ns": released}


def _start_wave_proof(events, identities, *, before_ns, tick_ns):
    if len(events) != stop.WORKERS or len(identities) != stop.WORKERS or len(set(identities)) != stop.WORKERS:
        return None
    stamps = []
    for trace, identity in zip(events, identities, strict=True):
        starts = [entry for entry in trace if entry["event"] == "start-returned"]
        if len(starts) != 1:
            return None
        start = starts[0]
        stamp = start.get("hardware_start")
        if not stamp or stamp["experiment_id"] != identity or stamp["wave_id"] != start.get("start_wave_id"):
            return None
        if not (stamp["entered_ns"] - start["sent_ns"] > tick_ns
                and stamp["entered_ns"] <= stamp["released_ns"] <= start["at_ns"]
                and before_ns - stamp["released_ns"] > tick_ns):
            return None
        stamps.append(stamp)
    wave, released = stamps[0]["wave_id"], stamps[0]["released_ns"]
    if any((stamp["wave_id"], stamp["released_ns"]) != (wave, released) for stamp in stamps):
        return None
    return {"wave_id": wave, "released_ns": released, "members": stamps,
            "handler_ingress_spread_ns": max(s["entered_ns"] for s in stamps) - min(s["entered_ns"] for s in stamps)}


class _PythonStartWave:
    def __init__(self, members):
        self.members = members
        self.deadline = monotonic() + 2
        self.changed = Condition()
        self.arrived = {}
        self.ready = set()
        self.outcome = None

    def _latch(self, outcome):
        if self.outcome is None:
            self.outcome = outcome
            self.arrived.clear()
            self.changed.notify_all()
        return self.outcome

    def abort(self, code):
        with self.changed:
            self._latch(code)

    def cancel(self):
        self.abort(grpc.StatusCode.CANCELLED)

    def enter(self, members, identity, context):
        # grpc invokes callbacks for normal completion too. A latched release
        # cannot be revoked by such a callback or a subsequent cancellation.
        if not context.add_callback(self.cancel):
            self.cancel()
        with self.changed:
            if self.outcome is not None:
                if type(self.outcome) is int:
                    return grpc.StatusCode.FAILED_PRECONDITION
                return self.outcome
            if monotonic() >= self.deadline:
                return self._latch(grpc.StatusCode.DEADLINE_EXCEEDED)
            if members != self.members or identity in self.arrived:
                return self._latch(grpc.StatusCode.FAILED_PRECONDITION)
            self.arrived[identity] = context
            if len(self.arrived) == stop.WORKERS:
                self.changed.notify_all()
            while self.outcome is None:
                remaining = self.deadline - monotonic()
                if remaining <= 0:
                    return self._latch(grpc.StatusCode.DEADLINE_EXCEEDED)
                if not all(peer.is_active() for peer in self.arrived.values()):
                    return self._latch(grpc.StatusCode.CANCELLED)
                if len(self.arrived) == stop.WORKERS:
                    self.ready.add(identity)
                    if len(self.ready) == stop.WORKERS:
                        released = perf_counter_ns()
                        outcome = grpc.StatusCode.DEADLINE_EXCEEDED if monotonic() >= self.deadline else released
                        return self._latch(outcome)
                self.changed.wait(timeout=min(remaining, .025))
            return self.outcome


def _python_start_handler(original):
    waves = {}
    lock = Lock()

    def start_with_wave(servicer, request, context):
        entered = perf_counter_ns()
        probes = [value for key, value in context.invocation_metadata() if key == START_WAVE_HEADER]
        if not probes:
            return original(servicer, request, context)
        invalid = grpc.StatusCode.INVALID_ARGUMENT
        detail = "Hardware Start rendezvous did not release"
        if len(probes) != 1 or request.station_id != "virtual-station-01":
            context.abort(invalid, detail)
        fields = probes[0].split(":")
        if len(fields) != 2 + stop.WORKERS or fields[0] != "v1" or any(
            not EXPERIMENT_ID.fullmatch(field) for field in fields[1:]
        ):
            context.abort(invalid, detail)
        wave_id, *members = fields[1:]
        identity = request.experiment_id
        if members != sorted(set(members)):
            context.abort(invalid, detail)
        members = tuple(members)
        with lock:
            wave = waves.get(wave_id)
            if wave is None:
                # Preserve closed wave IDs for this dedicated service lifetime.
                if len(waves) >= 1024:
                    context.abort(grpc.StatusCode.RESOURCE_EXHAUSTED, detail)
                wave = waves[wave_id] = _PythonStartWave(members)
        if identity not in members:
            wave.abort(grpc.StatusCode.FAILED_PRECONDITION)
            context.abort(grpc.StatusCode.FAILED_PRECONDITION, detail)
        released = wave.enter(members, identity, context)
        if type(released) is not int:
            context.abort(released, detail)
        if not context.is_active():
            context.abort(grpc.StatusCode.CANCELLED, detail)
        reply = original(servicer, request, context)
        context.send_initial_metadata((
            (START_WAVE_HEADER, f"qpc-ns-v1:{wave_id}:{identity}:{entered}:{released}"),
        ))
        return reply

    return start_with_wave




def install_python_stop_ingress():
    """Wrap the installed B handler only in the test-owned Hardware process."""
    from hardware_service.rpc import LifecycleRpc

    original = LifecycleRpc.StopExecution

    def stop_with_ingress(servicer, request, context):
        entered = perf_counter_ns()
        probes = [value for key, value in context.invocation_metadata() if key == STOP_INGRESS_HEADER]
        reply = original(servicer, request, context)
        if probes == [STOP_INGRESS_CLOCK] and re.fullmatch(r"[0-9a-f]{32}", request.experiment_id):
            context.send_initial_metadata((
                (STOP_INGRESS_HEADER, f"{STOP_INGRESS_CLOCK}:{request.experiment_id}:{entered}"),
            ))
        return reply

    LifecycleRpc.StopExecution = stop_with_ingress
    if os.environ.get(START_WAVE_ENV) == "1":
        LifecycleRpc.StartExecution = _python_start_handler(LifecycleRpc.StartExecution)


def install_start_barrier(directory):
    """Line up real starts and reuse the same Remote ACK and durable lease probe."""
    from app.services.hardware_client import HardwareServiceClient

    stop.install_stop_probes("api", directory)
    invoke = HardwareServiceClient._invoke
    original_connect = HardwareServiceClient._connect
    event_writer = stop._event
    aligned = os.environ.get(START_WAVE_ENV) == "1"
    arrivals, wave = [], {}
    wave_lock = Lock()

    def ticket():
        # The driver completes all four terminals before submitting another wave.
        with wave_lock:
            identity = uuid4().hex
            wave.update(wave_id=identity, metadata=_start_wave_metadata(identity, arrivals))
            arrivals.clear()

    rendezvous = Barrier(stop.WORKERS, action=ticket if aligned else None)
    observations = Path(directory) / "stop-observations"
    current_stop = ContextVar("stop_ingress_receipt", default=None)
    current_start = ContextVar("start_wave_receipt", default=None)

    class StartWithWave:
        def __init__(self, method):
            self.method = method

        def __call__(self, request, *, timeout):
            receipt = current_start.get()
            if receipt is None:
                return self.method(request, timeout=timeout)
            receipt["sent_ns"] = perf_counter_ns()
            response, call = self.method.with_call(
                request, timeout=timeout, metadata=((START_WAVE_HEADER, receipt["metadata"]),),
            )
            receipt["at_ns"] = perf_counter_ns()
            receipt["hardware_start"] = _decode_start_wave(call.initial_metadata())
            return response

    class StopWithIngress:
        def __init__(self, method):
            self.method = method

        def __call__(self, request, *, timeout):
            response, call = self.method.with_call(
                request, timeout=timeout, metadata=((STOP_INGRESS_HEADER, STOP_INGRESS_CLOCK),),
            )
            received = perf_counter_ns()
            receipt = current_stop.get()
            if receipt is not None:
                receipt.update(
                    received_ns=received, hardware_ingress=_decode_stop_ingress(call.initial_metadata()),
                )
            return response

    def connect_with_ingress(client):
        stub = original_connect(client)
        method = stub.StopExecution
        if not isinstance(method, StopWithIngress):
            stub.StopExecution = StopWithIngress(method)
        if aligned and not isinstance(stub.StartExecution, StartWithWave):
            stub.StartExecution = StartWithWave(stub.StartExecution)
        return stub

    def event_with_ingress(path, name, timestamp, **fields):
        receipt = current_stop.get()
        if name == "stop-ack" and receipt:
            timestamp = receipt["received_ns"]
            fields["hardware_ingress"] = receipt["hardware_ingress"]
        return event_writer(path, name, timestamp, **fields)

    def invoke_after_barrier(client, method, request):
        if method == "StopExecution":
            token = current_stop.set({})
            try:
                return invoke(client, method, request)
            finally:
                current_stop.reset(token)
        if method != "StartExecution":
            return invoke(client, method, request)
        if aligned:
            with wave_lock:
                arrivals.append(request.experiment_id)
        rendezvous.wait(timeout=8)
        sent = perf_counter_ns()
        receipt = dict(wave) if aligned else None
        token = current_start.set(receipt) if aligned else None
        try:
            return invoke(client, method, request)
        finally:
            path = stop._experiment_trace(observations, request.experiment_id)
            if receipt is None:
                stop._event(path, "start-returned", perf_counter_ns(), sent_ns=sent)
            else:
                current_start.reset(token)
                stop._event(
                    path, "start-returned", receipt.get("at_ns", perf_counter_ns()),
                    sent_ns=receipt.get("sent_ns", sent), start_wave_id=receipt["wave_id"],
                    hardware_start=receipt.get("hardware_start"),
                )

    stop._event = event_with_ingress
    HardwareServiceClient._connect = connect_with_ingress
    HardwareServiceClient._invoke = invoke_after_barrier


def _worker_processes(hardware_pid, executable):
    processes = {}
    for child in psutil.Process(hardware_pid).children():
        try:
            if Path(child.exe()).resolve() == executable:
                processes[child.pid] = child
        except psutil.NoSuchProcess:
            continue
    return processes


class _IoCounters(ctypes.Structure):
    _fields_ = [
        (name, ctypes.c_ulonglong)
        for name in ("read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes")
    ]


def _qpc_tick_ns():
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.QueryPerformanceFrequency.argtypes = (ctypes.POINTER(ctypes.c_longlong),)
    kernel.QueryPerformanceFrequency.restype = wintypes.BOOL
    frequency = ctypes.c_longlong()
    if not kernel.QueryPerformanceFrequency(ctypes.byref(frequency)) or frequency.value <= 0:
        raise ctypes.WinError(ctypes.get_last_error())
    return (1_000_000_000 + frequency.value - 1) // frequency.value


def _windows_counters(processes, stack):
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = wintypes.DWORD, wintypes.BOOL, wintypes.DWORD
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.GetProcessIoCounters.argtypes = wintypes.HANDLE, ctypes.POINTER(_IoCounters)
    kernel.GetProcessIoCounters.restype = wintypes.BOOL
    kernel.WaitForSingleObject.argtypes = wintypes.HANDLE, wintypes.DWORD
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    kernel.WaitForMultipleObjects.argtypes = (
        wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE), wintypes.BOOL, wintypes.DWORD,
    )
    kernel.WaitForMultipleObjects.restype = wintypes.DWORD
    kernel.CreateEventW.argtypes = ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR
    kernel.CreateEventW.restype = wintypes.HANDLE
    kernel.SetEvent.argtypes = (wintypes.HANDLE,)
    kernel.SetEvent.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = (wintypes.HANDLE,)
    kernel.CloseHandle.restype = wintypes.BOOL
    handles = {}
    for pid in processes:
        # PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE
        handle = kernel.OpenProcess(0x101000, False, pid)
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        stack.callback(kernel.CloseHandle, handle)
        handles[pid] = handle
    cancel_event = kernel.CreateEventW(None, True, False, None)
    if not cancel_event:
        raise ctypes.WinError(ctypes.get_last_error())
    stack.callback(kernel.CloseHandle, cancel_event)
    pids = tuple(handles)
    watched = (wintypes.HANDLE * (len(pids) + 1))(*handles.values(), cancel_event)

    def sample():
        started = perf_counter_ns()
        exited, values = [], {}
        for pid, handle in handles.items():
            state = kernel.WaitForSingleObject(handle, 0)
            if state == 0:
                exited.append(pid)
            elif state != 0x102:  # WAIT_TIMEOUT
                raise ctypes.WinError(ctypes.get_last_error())
        # Sample every peer after observing any exit. The retained handle
        # still exposes the final counters of the terminated child.
        counters_started = perf_counter_ns()
        for pid, handle in handles.items():
            counter = _IoCounters()
            if not kernel.GetProcessIoCounters(handle, ctypes.byref(counter)):
                raise ctypes.WinError(ctypes.get_last_error())
            values[pid] = (counter.read_bytes, counter.write_ops, counter.write_bytes)
        return {"started_ns": started, "counters_started_ns": counters_started,
                "at_ns": perf_counter_ns(), "exited": exited, "counters": values}

    def wait_for_exit():
        state = kernel.WaitForMultipleObjects(len(watched), watched, False, 3000)
        observed = perf_counter_ns()
        if state < len(pids):
            return {"pid": pids[state], "at_ns": observed}
        if state == len(pids) or state == 0x102:  # Cancellation event or WAIT_TIMEOUT
            return None
        raise ctypes.WinError(ctypes.get_last_error())

    def cancel_wait():
        if not kernel.SetEvent(cancel_event):
            raise ctypes.WinError(ctypes.get_last_error())

    return sample, wait_for_exit, cancel_wait


@contextmanager
def _watch_exit(executor, wait, cancel):
    notification = executor.submit(wait)
    try:
        yield notification
    finally:
        # Join before the owning ExitStack can close any waited-on handle.
        try:
            if not notification.done():
                cancel()
        finally:
            notification.result()


def _unwritten_requests(counters, baseline):
    return {
        pid for pid, current in counters.items()
        if current[0] - baseline[pid][0] == SATURATED_REQUEST_BYTES
        and current[1:] == baseline[pid][1:]
    }


def _pending_requests(counters, baseline):
    return {
        pid for pid, current in counters.items()
        if 0 < current[0] - baseline[pid][0] < SATURATED_REQUEST_BYTES
        and current[1:] == baseline[pid][1:]
    }


@contextmanager
def _paused_idle_workers(workers):
    alignment = {"pause_started_ns": perf_counter_ns(), "resumed_ns": {}}

    def resume(pid, process):
        process.resume()
        alignment["resumed_ns"][pid] = perf_counter_ns()

    with ExitStack() as paused:
        for pid, process in workers.items():
            paused.callback(resume, pid, process)
            process.suspend()
        alignment["all_paused_ns"] = perf_counter_ns()
        yield alignment
    resumes = alignment["resumed_ns"].values()
    alignment["resume_spread_ns"] = max(resumes) - min(resumes)
    alignment["pause_wall_ns"] = max(resumes) - alignment["pause_started_ns"]


def _wait_for_pending_dispatch(read, baseline):
    deadline = monotonic() + 3
    while True:
        snapshot = read()
        counters = snapshot["counters"]
        if snapshot["exited"] or any(
            current[1:] != baseline[pid][1:] or current[0] - baseline[pid][0] >= SATURATED_REQUEST_BYTES
            for pid, current in counters.items()
        ):
            return {"pending": snapshot, "rejected": "an idle-paused child exited or progressed beyond a partial request"}
        if len(_pending_requests(counters, baseline)) == stop.WORKERS:
            return {"pending": snapshot}
        if monotonic() >= deadline:
            return {"pending": snapshot, "rejected": "pending dispatch not proven on four idle-paused children"}
        sleep(.001)


def _wait_for_activity(read, baseline, *, observe_full=False):
    deadline = monotonic() + 3
    full_frames = {}
    while True:
        snapshot = read()
        counters = snapshot["counters"]
        proof = {"before": baseline, "observed": snapshot}
        if snapshot["exited"]:
            return {"rejected": "a warmed child exited before HTTP Stop", **proof}
        unwritten = _unwritten_requests(counters, baseline)
        if observe_full:
            for pid in unwritten:
                full_frames.setdefault(pid, snapshot["at_ns"])
            proof["full_frame_without_reply_observed_ns"] = full_frames
        if len(unwritten) == stop.WORKERS:
            return proof
        if any(current[1:] != baseline[pid][1:] for pid, current in counters.items()):
            return {"rejected": "a worker began replying before all four full requests arrived", **proof}
        if any(current[0] - baseline[pid][0] > SATURATED_REQUEST_BYTES for pid, current in counters.items()):
            return {"rejected": "a warmed child read more than one pinned CNP request", **proof}
        if monotonic() >= deadline:
            return {"rejected": "four complete CNP requests did not arrive within the observation window", **proof}
        sleep(.001)


def _observe_stop(read, request, activity, *, diagnostic):
    last_all_alive = activity["observed"]["started_ns"]
    last_zero = dict.fromkeys(activity["before"], activity["observed"]["started_ns"]) if diagnostic else {}
    first_writes = {}
    while True:
        finished = request.done()
        snapshot = read()
        if not snapshot["exited"]:
            last_all_alive = snapshot["started_ns"]
        if diagnostic:
            for pid, counters in snapshot["counters"].items():
                if counters[1:] == activity["before"][pid][1:]:
                    last_zero[pid] = snapshot["started_ns"]
                elif pid not in first_writes:
                    first_writes[pid] = {"last_zero_ns": last_zero[pid], "first_observed_write_ns": snapshot["at_ns"]}
        if snapshot["exited"] or finished:
            snapshot["last_all_alive_ns"] = last_all_alive
            if diagnostic:
                snapshot["first_writes"] = first_writes
            return snapshot
        sleep(.001)


def _observed_exit_at_ns(activity, reaped):
    snapshot = activity["at_stop"]
    if snapshot["exited"] != [reaped] or len(_unwritten_requests(snapshot["counters"], activity["before"])) != stop.WORKERS:
        return None
    notification = activity.get("exit_notification")
    if (notification is not None and notification["pid"] == reaped
            and snapshot["last_all_alive_ns"] <= notification["at_ns"] <= snapshot["counters_started_ns"]):
        return notification["at_ns"]
    return snapshot["at_ns"]


def test_worker_counter_proof_requires_a_complete_frame_and_no_reply():
    baseline = {11: (100, 2, 40), 22: (200, 4, 80)}
    received = {11: (100 + SATURATED_REQUEST_BYTES, 2, 40),
                22: (200 + SATURATED_REQUEST_BYTES, 4, 80)}
    assert _unwritten_requests(received, baseline) == {11, 22}
    partial = {**received, 11: (received[11][0] - 1, 2, 40)}
    assert _unwritten_requests(partial, baseline) == {22}
    assert _pending_requests(partial, baseline) == {11}
    writing = {**received, 22: (received[22][0], 5, 80)}
    assert _unwritten_requests(writing, baseline) == {11}
    assert not _pending_requests({11: (100, 2, 40), 22: (4296, 5, 80)}, baseline)


def test_idle_barrier_resumes_every_child_if_dispatch_fails():
    class Worker:
        paused = False

        def suspend(self):
            self.paused = True

        def resume(self):
            self.paused = False

    workers = {pid: Worker() for pid in range(stop.WORKERS)}
    with pytest.raises(RuntimeError, match="dispatch failed"):
        with _paused_idle_workers(workers):
            assert all(worker.paused for worker in workers.values())
            raise RuntimeError("dispatch failed")
    assert all(not worker.paused for worker in workers.values())


def test_exit_notification_needs_same_pid_and_later_unwritten_counters():
    before = {pid: (100, 2, 40) for pid in range(stop.WORKERS)}
    counters = {pid: (100 + SATURATED_REQUEST_BYTES, 2, 40) for pid in before}
    at_stop = {
        "exited": [1], "last_all_alive_ns": 10, "counters_started_ns": 30,
        "at_ns": 40, "counters": counters,
    }
    activity = {"before": before, "at_stop": at_stop, "exit_notification": {"pid": 1, "at_ns": 20}}
    assert _observed_exit_at_ns(activity, 1) == 20
    assert _observed_exit_at_ns({**activity, "exit_notification": {"pid": 2, "at_ns": 20}}, 1) == 40
    assert _observed_exit_at_ns({**activity, "exit_notification": {"pid": 1, "at_ns": 5}}, 1) == 40
    assert _observed_exit_at_ns({**activity, "exit_notification": {"pid": 1, "at_ns": 31}}, 1) == 40
    written = {**counters, 2: (counters[2][0], 3, 41)}
    assert _observed_exit_at_ns({**activity, "at_stop": {**at_stop, "counters": written}}, 1) is None


def test_exit_notification_wait_is_cancelled_and_joined_on_exception():
    started, cancelled = Event(), Event()

    def wait():
        started.set()
        assert cancelled.wait(timeout=2)

    with ThreadPoolExecutor(max_workers=1) as executor:
        with pytest.raises(RuntimeError, match="Stop observer failed"):
            with _watch_exit(executor, wait, cancelled.set) as pending:
                assert started.wait(timeout=2)
                raise RuntimeError("Stop observer failed")
        assert cancelled.is_set() and pending.done() and pending.result() is None


@pytest.mark.skipif(os.name != "nt", reason="Windows process notification")
def test_windows_exit_wait_observes_owned_process_and_cancels():
    child = subprocess.Popen(
        [sys.executable, "-I", "-B", "-c", "import sys; sys.stdin.buffer.read()"],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    try:
        with ThreadPoolExecutor(max_workers=1) as observer:
            with ExitStack() as handles:
                read, wait, cancel = _windows_counters([child.pid], handles)
                with _watch_exit(observer, wait, cancel) as notice:
                    assert not read()["exited"]
                    cancel()
                    assert notice.result(timeout=2) is None
                assert child.poll() is None
            with ExitStack() as handles:
                read, wait, cancel = _windows_counters([child.pid], handles)
                with _watch_exit(observer, wait, cancel) as notice:
                    closing_at = perf_counter_ns()
                    child.stdin.close()
                    signal = notice.result(timeout=5)
                snapshot = read()
                assert snapshot["exited"] == [child.pid]
                assert signal["pid"] == child.pid
                assert closing_at <= signal["at_ns"] <= snapshot["counters_started_ns"]
        assert child.wait(timeout=5) == 0
    finally:
        if child.poll() is None:
            child.kill()
            child.wait(timeout=5)
        child.stdin.close()


@pytest.mark.parametrize(("marker", "exit_ns", "reason"), [
    (None, 140, "missing actual Stop handler ingress"),
    ({"experiment_id": "2" * 32, "entered_ns": 120}, 140, "actual Stop handler ingress target mismatch"),
    ({"experiment_id": "1" * 32, "entered_ns": 109}, 140, "actual Stop handler ingress outside the RPC window"),
    ({"experiment_id": "1" * 32, "entered_ns": 111}, 140, "actual Stop handler ingress outside the RPC window"),
    ({"experiment_id": "1" * 32, "entered_ns": 135}, 140, "no all-alive observation after actual Stop handler ingress"),
    ({"experiment_id": "1" * 32, "entered_ns": 129}, 140, "no all-alive observation after actual Stop handler ingress"),
    ({"experiment_id": "1" * 32, "entered_ns": 120}, 131, "target exit not distinct from the all-alive observation"),
    ({"experiment_id": "1" * 32, "entered_ns": 120}, 159, "first child-exit observation was too late to order before safe ACK and cleanup"),
    ({"experiment_id": "1" * 32, "entered_ns": 120}, 140, None),
])
def test_stop_qualification_requires_actual_handler_order(monkeypatch, marker, exit_ns, reason):
    experiment = "1" * 32
    before = {pid: (100, 2, 40) for pid in range(stop.WORKERS)}
    activity = {
        "experiment_id": experiment, "qpc_tick_ns": 1, "before": before, "observed": {"at_ns": 90},
        "at_stop": {
            "exited": [0], "last_all_alive_ns": 130, "counters_started_ns": exit_ns + 2, "at_ns": exit_ns + 4,
            "counters": {pid: (100 + SATURATED_REQUEST_BYTES, 2, 40) for pid in before},
        },
        "exit_notification": {"pid": 0, "at_ns": exit_ns},
    }
    events = [[{"event": "start-returned", "sent_ns": 80, "at_ns": 165}] for _ in before]
    initial = {"event": "stop-ack", "kind": "stop", "sent_ns": 110, "at_ns": 160, "safe": True}
    if marker is not None:
        initial["hardware_ingress"] = marker
    events[0].extend((
        initial, {"event": "stop-ack", "kind": "run", "sent_ns": 170, "at_ns": 190, "safe": True},
        {"event": "lease-released", "at_ns": 200},
    ))
    terminal = {
        "state": "COMPLETE", "error_code": "STOPPED",
        "state_history": ["RUNNING", "STOPPING", "SAFE_STATE", "RELEASE", "COMPLETE"],
    }
    monkeypatch.setattr(psutil, "pid_exists", lambda _pid: False)
    monkeypatch.setattr(sys.modules[__name__], "_worker_processes", lambda *_: {1: None, 2: None, 3: None})
    result = _stop_sample((100, 180), activity, events, terminal, 0, 10, None)
    assert result.get("rejected") == reason


def test_stop_ingress_decoder_rejects_duplicate_or_malformed_proof():
    target = "1" * 32
    valid = (STOP_INGRESS_HEADER, f"{STOP_INGRESS_CLOCK}:{target}:120")
    assert _decode_stop_ingress([valid]) == {"experiment_id": target, "entered_ns": 120}
    assert _decode_stop_ingress([valid, valid]) is None
    for value in (STOP_INGRESS_CLOCK, f"{STOP_INGRESS_CLOCK}:{target}:0",
                  f"{STOP_INGRESS_CLOCK}:{target}:{1 << 63}", f"{STOP_INGRESS_CLOCK}:wrong:120"):
        assert _decode_stop_ingress([(STOP_INGRESS_HEADER, value)]) is None


def _stop_sample(http, activity, events, terminal, target, hardware_pid, worker):
    if "rejected" in activity:
        return activity
    assert http is not None
    began, replied = http
    proof = {**activity, "http_started_ns": began}
    acknowledgements = [entry for entry in events[target] if entry["event"] == "stop-ack"]
    proof["acknowledgements"] = acknowledgements
    assert all(entry["safe"] for entry in acknowledgements)
    initial = next((entry for entry in acknowledgements if entry["kind"] == "stop"), None)
    if initial is None:
        return {"rejected": "the target completed before the Stop RPC", "proof": proof}
    ingress = initial.get("hardware_ingress")
    if not isinstance(ingress, dict) or type(ingress.get("entered_ns")) is not int:
        return {"rejected": "missing actual Stop handler ingress", "proof": proof}
    if ingress.get("experiment_id") != activity["experiment_id"]:
        return {"rejected": "actual Stop handler ingress target mismatch", "proof": proof}
    entered = ingress["entered_ns"]
    proof["hardware_ingress_ns"] = entered
    # QPC values within a tick can be ambiguous across threads/processes.
    tick = activity["qpc_tick_ns"]
    if entered - initial["sent_ns"] <= tick or entered > initial["at_ns"]:
        return {"rejected": "actual Stop handler ingress outside the RPC window", "proof": proof}
    starts = [next(entry for entry in trace if entry["event"] == "start-returned") for trace in events]
    proof.update(grpc_sent_ns=initial["sent_ns"], starts=starts)
    if not all(entry["sent_ns"] <= began <= initial["sent_ns"] <= entered < entry["at_ns"] for entry in starts):
        return {"rejected": "a Start RPC completed before Stop ingress", "proof": proof}
    if not 0 <= began - activity["observed"]["at_ns"] <= 12_000_000:
        return {"rejected": "the four-child pipe observation expired before HTTP Stop", "proof": proof}
    assert began <= initial["sent_ns"] <= initial["at_ns"] <= replied
    assert terminal["state"] == "COMPLETE" and terminal["error_code"] == "STOPPED"
    assert terminal["state_history"][-5:] == ["RUNNING", "STOPPING", "SAFE_STATE", "RELEASE", "COMPLETE"]
    assert not (terminal.get("capture") or {}).get("available")
    cleanup, = [entry for entry in acknowledgements if entry["kind"] == "run"]
    durable, = [entry for entry in events[target] if entry["event"] in ("lease-released", "lease-quarantined")]
    assert durable["event"] == "lease-released" and cleanup["at_ns"] <= durable["at_ns"]
    proof["durable_release_ns"] = durable["at_ns"]
    ended = activity["at_stop"]
    if not ended["exited"]:
        return {"rejected": "the target worker completed before cancellation reached the child", "proof": proof}
    reaped, = ended["exited"]
    assert not psutil.pid_exists(reaped)
    assert set(_worker_processes(hardware_pid, worker)) == activity["before"].keys() - {reaped}
    exit_observed_ns = _observed_exit_at_ns(activity, reaped)
    if exit_observed_ns is None:
        return {"rejected": "a worker replied before target process exit was observed", "proof": proof}
    proof["exit_observed_ns"] = exit_observed_ns
    if ended["last_all_alive_ns"] - entered <= tick:
        return {"rejected": "no all-alive observation after actual Stop handler ingress", "proof": proof}
    if exit_observed_ns - ended["last_all_alive_ns"] <= tick:
        return {"rejected": "target exit not distinct from the all-alive observation", "proof": proof}
    if any(entry["sent_ns"] < initial["sent_ns"] for entry in acknowledgements):
        return {"rejected": "another Stop RPC preceded the explicit Stop RPC", "proof": proof}
    # Active Hardware Stop must reap the child before its safe ACK. The
    # run finalizer cannot account for that exit if it has yet to send Stop.
    exit_deadline = min(initial["at_ns"], cleanup["sent_ns"], cleanup["at_ns"], durable["at_ns"])
    if exit_deadline - exit_observed_ns <= tick:
        return {"rejected": "first child-exit observation was too late to order before safe ACK and cleanup", "proof": proof}
    assert starts[target]["at_ns"] <= cleanup["sent_ns"]
    return {
        "http_ns": replied - began, "grpc_ack_ns": initial["at_ns"] - began,
        "safe_release_ns": durable["at_ns"] - began, "busy_workers": stop.WORKERS,
        "proof": {**proof, "reaped_pid": reaped},
    }


def _verify_peer(client, terminal, *, warmup):
    if warmup:
        digest = stop._peer_capture(client, terminal)
        assert digest == PEER_CAPTURE_SHA256
        return digest
    capture = terminal["capture"]
    assert capture["available"] and capture["duration_ns"] == stop.SATURATED_DURATION_NS
    response = client.request("peer_capture", "GET", capture["payload_ref"])
    assert len(response.content) == capture["payload_byte_count"]
    digest = sha256(response.content).hexdigest()
    assert digest == capture["sha256"] == PEER_CAPTURE_SHA256
    return digest


def _create_wave(threads, clients, workload):
    creations = [threads.submit(stop._create, client, workload) for client in clients]
    return [future.result() for future in creations]


def _start_wave(threads, clients, entries):
    return [threads.submit(stop._run, client, *entry) for client, entry in zip(clients, entries)]


def _finish_wave(clients, entries, runs):
    for run in runs:
        run.result()
    terminals = [
        stop._until(lambda: stop._finished(client, identity), 15, "No durable terminal state.")
        for client, (identity, _) in zip(clients, entries)
    ]
    assert all(terminal["state"] == "COMPLETE" for terminal in terminals), terminals
    return terminals


@contextmanager
def _stop_services(directory, database_url, native, candidate, monkeypatch, *, start_rendezvous):
    with monkeypatch.context() as scope:
        if start_rendezvous:
            scope.setenv(START_WAVE_ENV, "1")
        else:
            scope.delenv(START_WAVE_ENV, raising=False)
        if native:
            with matrix_services(directory, database_url, True, candidate, scope, service_probe="stop") as services:
                yield services
            return
        scope.setenv("CIRNET_HARDWARE_PREVIEW", "false")
        scope.setenv("CIRNET_STAGE3_SERVICE_PROBE", "stop")
        scope.setattr(harness, "MODULE", "tests.integration.native_hardware_stop_cases")
        with harness.baseline_services(directory, database_url, backend="cpp") as services:
            yield services


def _measure(directory, native, candidate, monkeypatch, workload, samples_required, *,
             diagnostic, idle_barrier, start_rendezvous=False):
    assert not (start_rendezvous and idle_barrier)
    lane_started = perf_counter_ns()
    traces = directory / "stop-observations"
    samples, rejected, warmups = [], [], []
    metrics = Metrics()
    worker = candidate["worker"]
    workload_hash = sha256(json.dumps(workload, sort_keys=True).encode()).hexdigest() if start_rendezvous else None
    qpc_tick_ns = _qpc_tick_ns()
    with (
        harness.baseline_database("sqlite", directory) as database_url,
        _stop_services(directory, database_url, native, candidate, monkeypatch, start_rendezvous=start_rendezvous)
        as (url, _, (_, hardware_pid)),
        ExitStack() as stack,
    ):
        threads = stack.enter_context(ThreadPoolExecutor(max_workers=stop.WORKERS))
        control = stack.enter_context(ThreadPoolExecutor(max_workers=1))
        exit_observer = stack.enter_context(ThreadPoolExecutor(max_workers=1))
        exit_observer.submit(lambda: None).result()
        clients, controllers = [], []
        for _ in range(stop.WORKERS):
            client, controller = Session(url, metrics), Session(url, metrics)
            stack.callback(client.close)
            stack.callback(controller.close)
            session = client.request("session", "GET", "/api/auth/session").json()
            client.client.headers["X-CSRF-Token"] = session["csrf_token"]
            controller.client.cookies.update(client.client.cookies)
            controller.client.headers.update(client.client.headers)
            clients.append(client)
            controllers.append(controller)
        # Cap attempts independently of the valid count so rejected waves
        # cannot reduce the predeclared sample size or enter a percentile.
        for wave in range(1, 4 * samples_required + 4):
            workers = _worker_processes(hardware_pid, worker)
            if len(workers) < stop.WORKERS:
                warm_started = perf_counter_ns()
                old_pids = sorted(workers)
                warm_entries = _create_wave(threads, clients, workload)
                warm_admitted = monotonic()
                warm_runs = _start_wave(threads, clients, warm_entries)
                for client, terminal in zip(clients, _finish_wave(clients, warm_entries, warm_runs)):
                    _verify_peer(client, terminal, warmup=not warmups)
                workers = _worker_processes(hardware_pid, worker)
                assert len(workers) == stop.WORKERS, "Warmup did not fill every pinned C++ lane."
                warmups.append({"before_wave": wave, "old_pids": old_pids,
                                "warm_pids": sorted(workers), "wall_ns": perf_counter_ns() - warm_started})
                sleep(max(0, warm_admitted + 1.01 - monotonic()))
            assert len(workers) == stop.WORKERS
            target = (wave - 1) % stop.WORKERS
            controller = controllers[target]
            control.submit(controller.request, "warm_stop_connection", "GET", "/api/health").result()
            entries = _create_wave(threads, clients, workload)
            experiment = entries[target][0]
            admitted = monotonic()
            http = None
            with ExitStack() as handles:
                read, wait_for_exit, cancel_wait = _windows_counters(workers, handles)
                pause = _paused_idle_workers(workers) if idle_barrier else nullcontext({})
                with pause as alignment:
                    baseline = read()
                    assert not baseline["exited"]
                    runs = _start_wave(threads, clients, entries)
                    if idle_barrier:
                        alignment["before"] = baseline["counters"]
                        alignment.update(_wait_for_pending_dispatch(read, baseline["counters"]))
                if "rejected" in alignment:
                    activity = {"rejected": alignment["rejected"], "idle_alignment": alignment}
                else:
                    activity = _wait_for_activity(read, baseline["counters"], observe_full=start_rendezvous)
                    if idle_barrier:
                        alignment["last_resume_to_full_frame_check_ns"] = (
                            activity["observed"]["at_ns"] - max(alignment["resumed_ns"].values())
                        )
                        activity["idle_alignment"] = alignment
                if "rejected" not in activity:
                    with _watch_exit(exit_observer, wait_for_exit, cancel_wait) as observer:
                        request = control.submit(stop._stop, controller, experiment)
                        activity["at_stop"] = _observe_stop(read, request, activity, diagnostic=diagnostic)
                        http = request.result()
                    activity["exit_notification"] = observer.result()
            terminals = _finish_wave(clients, entries, runs)
            captures = {}
            for index, (client, terminal) in enumerate(zip(clients, terminals)):
                if index != target or not http or terminal["error_code"] is None:
                    captures[entries[index][0]] = _verify_peer(client, terminal, warmup=False)
            events = [stop._read_events(traces / identity) for identity, _ in entries]
            activity["experiment_id"] = experiment
            activity["qpc_tick_ns"] = qpc_tick_ns
            result = _stop_sample(http, activity, events, terminals[target], target, hardware_pid, worker)
            if start_rendezvous:
                identities = [identity for identity, _ in entries]
                alignment = _start_wave_proof(
                    events, identities, before_ns=activity["observed"]["started_ns"], tick_ns=qpc_tick_ns,
                )
                full_frames = activity.get("full_frame_without_reply_observed_ns", {})
                if alignment and any(at - alignment["released_ns"] <= qpc_tick_ns for at in full_frames.values()):
                    alignment = None
                if alignment is None:
                    result = {"rejected": "missing or invalid Hardware Start rendezvous evidence",
                              "unaligned_result": result, "start_traces": events}
                else:
                    release = alignment["released_ns"]
                    result["start_rendezvous"] = {
                        "release_to_full_frame_observation_ns": {
                            pid: observed - release
                            for pid, observed in full_frames.items()
                        },
                        **alignment, "workload_sha256": workload_hash,
                        "clock": "qpc-ns-v1", "idle_pre_dispatch_barrier": False,
                    }
            if "rejected" not in result:
                assert len(captures) == stop.WORKERS - 1 and experiment not in captures
                result["capture_proof"] = {
                    "peer_sha256": captures,
                    "target_available": bool((terminals[target].get("capture") or {}).get("available")),
                }
            result.update(wave=wave, experiment_id=experiment)
            (rejected if "rejected" in result else samples).append(result)
            if ("rejected" not in result and (len(samples) % 10 == 0 or len(samples) == samples_required)
                    or wave % 25 == 0):
                elapsed = (perf_counter_ns() - lane_started) / 1_000_000_000
                print(
                    f"{directory.name}: {len(samples)}/{samples_required} qualified after {wave} attempts, "
                    f"{len(rejected)} rejected, {len(warmups)} warmups, {elapsed:.1f} s elapsed",
                    flush=True,
                )
            if len(samples) >= samples_required:
                break
            sleep(max(0, admitted + 1.01 - monotonic()))
    database = directory / "baseline.sqlite"
    with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as connection:
        assert connection.execute("SELECT COUNT(*) FROM lab_leases").fetchone()[0] == 0
    result = {"samples": samples, "rejected": rejected, "warmups": warmups, "peer_capture_sha256": PEER_CAPTURE_SHA256,
              "hardware_start_rendezvous": start_rendezvous,
              "percentiles": {field: stop._summarize(samples, field) for field in stop.STOP_GATE_FIELDS} if samples else {}}
    (directory / "stop-profile.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


@pytest.mark.skipif(os.name != "nt", reason="Windows child pipe I/O evidence")
def test_stage3_natural_stop(selected, monkeypatch):
    assert "QueryPerformanceCounter" in get_clock_info("perf_counter").implementation
    workload = stop._saturated_load()
    workload_hash = sha256(json.dumps(workload, sort_keys=True).encode()).hexdigest()
    assert workload_hash == stop.SATURATED_WORKLOAD_SHA256
    limits = stop._load_stop_limits(selected["reference_sha256"])
    diagnostic = os.environ.get("CIRNET_NATIVE_STAGE3_STOP_SMOKE") == "1"
    idle_barrier = os.environ.get("CIRNET_NATIVE_STAGE3_STOP_IDLE_BARRIER") == "1"
    assert not idle_barrier or diagnostic, "The idle pre-dispatch barrier requires diagnostic mode."
    selected_method = os.environ.get(STOP_METHOD_ENV, "")
    assert selected_method in ("", REMOTE_RENDEZVOUS, HARDWARE_RENDEZVOUS), selected_method
    scope = os.environ.get(STOP_ACCEPTANCE_SCOPE_ENV, "")
    assert scope in ("", WINDOWS_FUNCTIONAL_SAFETY), scope
    if scope == WINDOWS_FUNCTIONAL_SAFETY:
        assert selected_method == HARDWARE_RENDEZVOUS, "Select the approved Hardware rendezvous method."
    replay_alignment = os.environ.get("CIRNET_NATIVE_STAGE3_STOP_START_RENDEZVOUS") == "1"
    assert not replay_alignment or (diagnostic and selected_method != REMOTE_RENDEZVOUS), (
        "Use the named Hardware rendezvous method for formal acceptance."
    )
    start_rendezvous = replay_alignment or selected_method == HARDWARE_RENDEZVOUS
    assert not (idle_barrier and (start_rendezvous or selected_method)), (
        "The idle pre-dispatch diagnostic cannot be combined with a named acceptance method."
    )
    method = REMOTE_RENDEZVOUS
    if start_rendezvous:
        method = HARDWARE_RENDEZVOUS
    elif idle_barrier:
        method = IDLE_PRE_DISPATCH

    samples_required = 8 if diagnostic else 100
    attempt_cap = 4 * samples_required + 3
    windows_required = 1 if diagnostic else 3
    root = artifact_directory(f"native-hardware-stop/{uuid4().hex}")
    print(f"Stage 3 natural Stop ({method}): {root}", flush=True)
    profiles = {False: [], True: []}
    exhausted = False
    for batch in range(windows_required):
        for native in ((False, True) if batch % 2 == 0 else (True, False)):
            lane = root / f"{batch + 1}-{'rust' if native else 'python'}"
            lane.mkdir()
            print(f"Starting {lane.name}, window {batch + 1}/{windows_required}", flush=True)
            profile = _measure(
                lane, native, selected, monkeypatch, workload, samples_required,
                diagnostic=diagnostic, idle_barrier=idle_barrier, start_rendezvous=start_rendezvous,
            )
            profiles[native].append(profile)
            if not diagnostic and len(profile["samples"]) < samples_required:
                exhausted = True
                break
        if exhausted:
            break

    assert {row["peer_capture_sha256"] for rows in profiles.values() for row in rows} == {PEER_CAPTURE_SHA256}
    qualification = {"python": [], "rust": []}
    for native, side in ((False, "python"), (True, "rust")):
        for window in range(windows_required):
            profile = profiles[native][window] if window < len(profiles[native]) else None
            samples = len(profile["samples"]) if profile is not None else 0
            rejected = Counter(item["rejected"] for item in profile["rejected"]) if profile is not None else {}
            status = "NOT RUN" if profile is None else ("PASS" if samples == samples_required else "FAIL")
            qualification[side].append({
                "window": window + 1, "status": status, "samples": samples, "required": samples_required,
                "attempts": samples + sum(rejected.values()), "attempt_cap": attempt_cap,
                "warmups": len(profile["warmups"]) if profile is not None else 0, "rejected": dict(rejected),
            })
    insufficient = [
        side for side, windows in qualification.items() if any(row["status"] != "PASS" for row in windows)
    ]
    frozen, paired, combined = {}, {}, {}
    if not insufficient:
        for field, percentiles in limits.items():
            for percentile, ceiling in percentiles.items():
                baseline, candidate = (
                    median(row["percentiles"][field][percentile] for row in profiles[native])
                    for native in (False, True)
                )
                name = f"{field}.{percentile}"
                paired_limit = 1.10 * baseline
                measurement = {"legacy_ms": baseline, "rust_ms": candidate}
                frozen[name] = {**measurement, "maximum_ms": ceiling, "passed": candidate <= ceiling}
                paired[name] = {**measurement, "maximum_ms": paired_limit, "passed": candidate <= paired_limit}
                maximum = min(ceiling, paired_limit)
                combined[name] = {**measurement, "maximum_ms": maximum, "passed": candidate <= maximum}
    blocking = frozen if scope == WINDOWS_FUNCTIONAL_SAFETY else combined
    failed = [name for name, result in blocking.items() if not result["passed"]]
    summary = {
        "status": "DIAGNOSTIC" if diagnostic else ("FAIL" if insufficient or failed else "PASS"),
        "method": method, "workload_sha256": workload_hash, "candidate_sha256": selected["manifest_sha256"],
        "samples_required_per_lane": samples_required, "attempt_cap_per_lane": attempt_cap,
        "windows_required_per_side": windows_required, "qualification": qualification,
        "idle_pre_dispatch_barrier": idle_barrier, "hardware_start_rendezvous": start_rendezvous,
    }
    if scope == WINDOWS_FUNCTIONAL_SAFETY:
        summary.update(
            acceptance_scope=scope,
            windows_safety_checks=frozen,
            performance_diagnostics={
                "status": "NOT RUN" if insufficient else "DIAGNOSTIC",
                "paired_checks": paired, "historical_combined_checks": combined,
            },
            linux_performance={
                "platform": "Linux/Xeon", "status": "NOT RUN", "thresholds": "TBD_BEFORE_ACCEPTANCE",
            },
        )
    else:
        summary["checks"] = combined
    (root / "stop-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    assert not insufficient, qualification
    if not diagnostic:
        assert not failed, failed




@pytest.mark.parametrize("defect", ["missing", "identity", "release", "late", None])
def test_start_rendezvous_proof_rejects_incomplete_or_misordered_wave(defect):
    identities = [f"{index:032x}" for index in range(1, 5)]
    wave = "e" * 32
    events = [[{"event": "start-returned", "sent_ns": 100, "at_ns": 1000,
                "start_wave_id": wave, "hardware_start": {
                    "wave_id": wave, "experiment_id": identity,
                    "entered_ns": 200 + index, "released_ns": 400,
                }}] for index, identity in enumerate(identities)]
    if defect == "missing":
        events[0][0]["hardware_start"] = None
    elif defect == "identity":
        events[0][0]["hardware_start"]["experiment_id"] = identities[1]
    elif defect == "release":
        events[0][0]["hardware_start"]["released_ns"] = 399
    elif defect == "late":
        events[0][0]["hardware_start"]["entered_ns"] = 401
    proof = _start_wave_proof(events, identities, before_ns=500, tick_ns=1)
    if defect:
        assert proof is None
    else:
        assert proof["wave_id"] == wave and proof["released_ns"] == 400


@pytest.mark.parametrize("service", ["cirnet.hardware.v2.HardwareService", "netcircuit.hardware.v2.HardwareService"])
def test_python_start_rendezvous_preserves_default_and_aborts_whole_wave(monkeypatch, service):
    import grpc
    from contracts.generated import rpc_v2_pb2 as pb
    from hardware_service.rpc import LifecycleRpc
    from hardware_service.server import build_server

    starts = []

    def station_start(_servicer, request, _context):
        starts.append(request.experiment_id)
        return pb.OperationReply(accepted=True)

    monkeypatch.setenv("CIRNET_SIMULATION_WORKERS", "4")
    monkeypatch.setattr(LifecycleRpc, "StartExecution", _python_start_handler(station_start))
    server = build_server()
    port = server.add_insecure_port("127.0.0.1:0")
    assert port
    server.start()
    try:
        with grpc.insecure_channel(f"127.0.0.1:{port}") as channel:
            grpc.channel_ready_future(channel).result(timeout=5)
            start = channel.unary_unary(
                f"/{service}/StartExecution",
                request_serializer=pb.Target.SerializeToString,
                response_deserializer=pb.OperationReply.FromString,
            )
            identities = [f"{index:032x}" for index in range(1, 5)]
            requests = [pb.Target(station_id="virtual-station-01", experiment_id=identity)
                        for identity in identities]
            assert start(requests[0], timeout=3).accepted
            for wave, fault in enumerate(("missing", "duplicate", "cancelled", "mismatch", "outsider"), start=1):
                metadata = ((START_WAVE_HEADER, _start_wave_metadata(f"{wave:032x}", identities)),)
                arrivals = [start.future(request, metadata=metadata, timeout=4) for request in requests[:2]]
                sleep(.10)
                assert all(not arrival.done() for arrival in arrivals)
                assert starts == identities[:1]
                expected = grpc.StatusCode.DEADLINE_EXCEEDED
                if fault == "duplicate":
                    arrivals.append(start.future(requests[0], metadata=metadata, timeout=4))
                    expected = grpc.StatusCode.FAILED_PRECONDITION
                elif fault == "cancelled":
                    assert arrivals.pop().cancel()
                    expected = grpc.StatusCode.CANCELLED
                elif fault == "mismatch":
                    other = ((START_WAVE_HEADER, _start_wave_metadata(f"{wave:032x}",
                                                                      [*identities[:3], "9" * 32])),)
                    arrivals.append(start.future(requests[2], metadata=other, timeout=4))
                    expected = grpc.StatusCode.FAILED_PRECONDITION
                elif fault == "outsider":
                    outsider = pb.Target(station_id="virtual-station-01", experiment_id="9" * 32)
                    arrivals.append(start.future(outsider, metadata=metadata, timeout=4))
                    expected = grpc.StatusCode.FAILED_PRECONDITION
                for arrival in arrivals:
                    with pytest.raises(grpc.RpcError) as aborted:
                        arrival.result()
                    assert aborted.value.code() == expected
                with pytest.raises(grpc.RpcError) as late:
                    start(requests[-1], metadata=metadata, timeout=3)
                assert late.value.code() == expected
                assert starts == identities[:1]
            wave = "f" * 32
            metadata = ((START_WAVE_HEADER, _start_wave_metadata(wave, identities)),)
            arrivals = [start.future(request, metadata=metadata, timeout=4) for request in requests]
            releases = set()
            for arrival, identity in zip(arrivals, identities):
                assert arrival.result().accepted
                proof = _decode_start_wave(arrival.initial_metadata())
                assert proof["wave_id"] == wave and proof["experiment_id"] == identity
                assert proof["entered_ns"] <= proof["released_ns"]
                releases.add(proof["released_ns"])
            assert len(releases) == 1 and sorted(starts[1:]) == identities
    finally:
        server.stop(0).wait()





@pytest.mark.skipif(os.name != "nt", reason="Windows acceptance receipt")
@pytest.mark.parametrize("method, scope", [
    (None, None),
    (HARDWARE_RENDEZVOUS, None),
    (HARDWARE_RENDEZVOUS, WINDOWS_FUNCTIONAL_SAFETY),
])
def test_underfilled_formal_stop_receipt_records_failure(tmp_path, monkeypatch, method, scope):
    module = sys.modules[__name__]
    monkeypatch.delenv("CIRNET_NATIVE_STAGE3_STOP_SMOKE", raising=False)
    monkeypatch.delenv("CIRNET_NATIVE_STAGE3_STOP_IDLE_BARRIER", raising=False)
    monkeypatch.delenv("CIRNET_NATIVE_STAGE3_STOP_START_RENDEZVOUS", raising=False)
    monkeypatch.delenv(STOP_METHOD_ENV, raising=False)
    monkeypatch.delenv(STOP_ACCEPTANCE_SCOPE_ENV, raising=False)
    if scope:
        monkeypatch.setenv(STOP_ACCEPTANCE_SCOPE_ENV, scope)
    if method:
        monkeypatch.setenv(STOP_METHOD_ENV, method)
    monkeypatch.setattr(module, "artifact_directory", lambda _name: tmp_path)
    monkeypatch.setattr(stop, "_load_stop_limits", lambda _sha: {})
    attempts = []

    def underfilled(lane, native, _selected, _monkeypatch, _workload, samples_required, **mode):
        attempts.append((lane.name, native, mode["diagnostic"]))
        assert samples_required == 100
        assert mode["start_rendezvous"] == (method == HARDWARE_RENDEZVOUS)
        return {
            "samples": [{}] * 99, "warmups": [],
            "rejected": [{"rejected": "a worker replied before target exit"}] * 304,
            "peer_capture_sha256": PEER_CAPTURE_SHA256, "percentiles": {},
        }

    monkeypatch.setattr(module, "_measure", underfilled)
    with pytest.raises(AssertionError):
        test_stage3_natural_stop({"reference_sha256": "reference", "manifest_sha256": "candidate"}, monkeypatch)
    summary = json.loads((tmp_path / "stop-summary.json").read_text(encoding="utf-8"))
    assert summary["status"] == "FAIL"
    assert summary["method"] == (method or REMOTE_RENDEZVOUS)
    assert summary["windows_required_per_side"] == 3
    assert attempts == [("1-python", False, False)]
    python, rust = (summary["qualification"][side] for side in ("python", "rust"))
    assert len(python) == len(rust) == 3
    assert python[0]["status"] == "FAIL"
    assert (python[0]["samples"], python[0]["attempts"], python[0]["required"], python[0]["attempt_cap"]) == (
        99, 403, 100, 403,
    )
    for lane in [*python[1:], *rust]:
        assert lane["status"] == "NOT RUN"
        assert lane["samples"] == lane["attempts"] == 0
    if scope:
        assert summary["acceptance_scope"] == scope
        assert not summary["windows_safety_checks"]
        assert summary["performance_diagnostics"]["status"] == "NOT RUN"
    else:
        assert not summary["checks"]




@pytest.mark.skipif(os.name != "nt", reason="Windows acceptance receipt")
@pytest.mark.parametrize("scope, baseline_ms, candidate_ms, verdict", [
    (WINDOWS_FUNCTIONAL_SAFETY, 10, 20, "PASS"),
    (WINDOWS_FUNCTIONAL_SAFETY, 110, 110, "FAIL"),
    (None, 10, 20, "FAIL"),
])
def test_stop_acceptance_scope_separates_frozen_and_paired(tmp_path, monkeypatch,
                                                           scope, baseline_ms, candidate_ms, verdict):
    module = sys.modules[__name__]
    for setting in ("CIRNET_NATIVE_STAGE3_STOP_SMOKE", "CIRNET_NATIVE_STAGE3_STOP_IDLE_BARRIER",
                    "CIRNET_NATIVE_STAGE3_STOP_START_RENDEZVOUS", STOP_ACCEPTANCE_SCOPE_ENV):
        monkeypatch.delenv(setting, raising=False)
    monkeypatch.setenv(STOP_METHOD_ENV, HARDWARE_RENDEZVOUS)
    if scope:
        monkeypatch.setenv(STOP_ACCEPTANCE_SCOPE_ENV, scope)
    monkeypatch.setattr(module, "artifact_directory", lambda _name: tmp_path)
    limits = {field: {percentile: 100 for percentile in stop.STOP_GATE_PERCENTILES}
              for field in stop.STOP_GATE_FIELDS}
    monkeypatch.setattr(stop, "_load_stop_limits", lambda _sha: limits)
    order = []

    def complete(lane, native, _selected, _monkeypatch, _workload, samples_required, **mode):
        order.append(lane.name)
        assert samples_required == 100
        assert mode == {"diagnostic": False, "idle_barrier": False, "start_rendezvous": True}
        timing = candidate_ms if native else baseline_ms
        return {
            "samples": [{}] * 100, "warmups": [], "rejected": [],
            "peer_capture_sha256": PEER_CAPTURE_SHA256,
            "percentiles": {field: dict.fromkeys(percentiles, timing) for field, percentiles in limits.items()},
        }

    monkeypatch.setattr(module, "_measure", complete)
    selected = {"reference_sha256": "reference", "manifest_sha256": "candidate"}
    if verdict == "FAIL":
        with pytest.raises(AssertionError):
            test_stage3_natural_stop(selected, monkeypatch)
    else:
        test_stage3_natural_stop(selected, monkeypatch)
    summary = json.loads((tmp_path / "stop-summary.json").read_text(encoding="utf-8"))
    assert summary["status"] == verdict
    assert summary["method"] == HARDWARE_RENDEZVOUS
    assert (summary["windows_required_per_side"], summary["samples_required_per_lane"],
            summary["attempt_cap_per_lane"]) == (3, 100, 403)
    assert order == ["1-python", "1-rust", "2-rust", "2-python", "3-python", "3-rust"]
    assert all(lane["status"] == "PASS" and lane["samples"] == 100
               for windows in summary["qualification"].values() for lane in windows)
    if scope:
        assert summary["acceptance_scope"] == scope
        assert summary["linux_performance"]["status"] == "NOT RUN"
        assert summary["linux_performance"]["thresholds"] == "TBD_BEFORE_ACCEPTANCE"
        checks = summary["windows_safety_checks"]
        diagnostics = summary["performance_diagnostics"]
        assert len(checks) == len(diagnostics["paired_checks"]) == len(diagnostics["historical_combined_checks"]) == 6
        assert all(check["maximum_ms"] == 100 and check["passed"] == (candidate_ms <= 100)
                   for check in checks.values())
        assert all(check["passed"] == (candidate_ms <= 1.10 * baseline_ms)
                   for check in diagnostics["paired_checks"].values())
        assert all(not check["passed"] for check in diagnostics["historical_combined_checks"].values())
    else:
        assert "acceptance_scope" not in summary
        assert len(summary["checks"]) == 6 and all(not check["passed"] for check in summary["checks"].values())


if __name__ == "__main__":
    role, directory = sys.argv[1:]
    if role == "hardware":
        install_python_stop_ingress()
    serve_test_lane(role, Path(directory))
