"""Own only one suspended Windows child and its descendants, never unrelated processes.

The child cannot run before its PID receipt is saved and it joins a kill-on-close
Job Object. Closing the dispatcher's job handle also contains dispatcher crashes.
Windows is the verified execution target; unsupported platforms fail closed.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes as w
import os
from pathlib import Path
import subprocess
import time
from typing import Callable


class ProcessTreeUnresolved(RuntimeError):
    """Do not mark an invocation terminal or start another implementer."""


class _BasicLimits(ctypes.Structure):
    _fields_ = [('user_time', ctypes.c_int64), ('job_time', ctypes.c_int64),
                ('flags', w.DWORD), ('min_working', ctypes.c_size_t),
                ('max_working', ctypes.c_size_t), ('active_limit', w.DWORD),
                ('affinity', ctypes.c_size_t), ('priority', w.DWORD), ('scheduling', w.DWORD)]


class _IoCounters(ctypes.Structure):
    _fields_ = [(name, ctypes.c_uint64) for name in
                ('read_ops', 'write_ops', 'other_ops', 'read_bytes', 'write_bytes', 'other_bytes')]


class _ExtendedLimits(ctypes.Structure):
    _fields_ = [('basic', _BasicLimits), ('io', _IoCounters),
                ('process_limit', ctypes.c_size_t), ('job_limit', ctypes.c_size_t),
                ('peak_process', ctypes.c_size_t), ('peak_job', ctypes.c_size_t)]


class _Accounting(ctypes.Structure):
    _fields_ = [('user', ctypes.c_int64), ('kernel', ctypes.c_int64),
                ('period_user', ctypes.c_int64), ('period_kernel', ctypes.c_int64),
                ('faults', w.DWORD), ('total', w.DWORD), ('active', w.DWORD), ('terminated', w.DWORD)]


class _ThreadEntry(ctypes.Structure):
    _fields_ = [('size', w.DWORD), ('usage', w.DWORD), ('tid', w.DWORD), ('pid', w.DWORD),
                ('base_priority', w.LONG), ('delta_priority', w.LONG), ('flags', w.DWORD)]


def _kernel():
    if os.name != 'nt':
        raise RuntimeError('Owned process tree is verified for Windows only')
    k = ctypes.WinDLL('kernel32', use_last_error=True)
    signatures = {
        'CreateJobObjectW': ([ctypes.c_void_p, w.LPCWSTR], w.HANDLE),
        'SetInformationJobObject': ([w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD], w.BOOL),
        'AssignProcessToJobObject': ([w.HANDLE, w.HANDLE], w.BOOL),
        'QueryInformationJobObject': ([w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD, ctypes.c_void_p], w.BOOL),
        'TerminateJobObject': ([w.HANDLE, w.UINT], w.BOOL),
        'CloseHandle': ([w.HANDLE], w.BOOL),
        'CreateToolhelp32Snapshot': ([w.DWORD, w.DWORD], w.HANDLE),
        'Thread32First': ([w.HANDLE, ctypes.POINTER(_ThreadEntry)], w.BOOL),
        'Thread32Next': ([w.HANDLE, ctypes.POINTER(_ThreadEntry)], w.BOOL),
        'OpenThread': ([w.DWORD, w.BOOL, w.DWORD], w.HANDLE),
        'ResumeThread': ([w.HANDLE], w.DWORD),
        'OpenProcess': ([w.DWORD, w.BOOL, w.DWORD], w.HANDLE),
        'WaitForSingleObject': ([w.HANDLE, w.DWORD], w.DWORD),
    }
    for name, (args, result) in signatures.items():
        fn = getattr(k, name); fn.argtypes = args; fn.restype = result
    return k


def _checked(ok):
    if not ok:
        raise ctypes.WinError(ctypes.get_last_error())


class OwnedProcess:
    def __init__(self, command:list[str], cwd:Path, on_started:Callable[[int], None]):
        self.k = _kernel()
        self.job = self.k.CreateJobObjectW(None, None)
        _checked(self.job)
        self.process:subprocess.Popen|None = None
        self.assigned = False
        try:
            limits = _ExtendedLimits()
            limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway
            _checked(self.k.SetInformationJobObject(self.job, 9, ctypes.byref(limits), ctypes.sizeof(limits)))
            self.process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                            stderr=subprocess.PIPE, encoding='utf-8', errors='replace',
                                            creationflags=subprocess.CREATE_NO_WINDOW | 0x4)  # CREATE_SUSPENDED
            on_started(self.process.pid)  # durable receipt BEFORE any child instruction can execute
            _checked(self.k.AssignProcessToJobObject(self.job, w.HANDLE(int(self.process._handle))))
            self.assigned = True
            self._resume_primary_thread()
        except BaseException:
            try:
                if self.process is not None:
                    if self.assigned:
                        self.terminate_tree()
                    else:
                        # The suspended child has never executed or spawned descendants.
                        self.process.kill()
                        self.process.wait(timeout=10)
                    self.process.communicate(timeout=5)
            except BaseException as error:
                raise ProcessTreeUnresolved('Child startup cleanup could not be confirmed') from error
            finally:
                self.close()
            raise

    def _resume_primary_thread(self):
        snapshot = self.k.CreateToolhelp32Snapshot(0x4, 0)  # TH32CS_SNAPTHREAD
        if snapshot in (None, ctypes.c_void_p(-1).value):
            _checked(False)
        try:
            entry = _ThreadEntry(); entry.size = ctypes.sizeof(entry)
            ok = self.k.Thread32First(snapshot, ctypes.byref(entry))
            tids = []
            while ok:
                if entry.pid == self.process.pid:
                    tids.append(entry.tid)
                entry.size = ctypes.sizeof(entry)
                ok = self.k.Thread32Next(snapshot, ctypes.byref(entry))
            if len(tids) != 1:
                raise RuntimeError('Suspended child primary thread could not be identified unambiguously')
            thread = self.k.OpenThread(0x2, False, tids[0])  # THREAD_SUSPEND_RESUME
            _checked(thread)
            try:
                if self.k.ResumeThread(thread) != 1:
                    raise RuntimeError('Suspended child resume could not be verified')
            finally:
                _checked(self.k.CloseHandle(thread))
        finally:
            _checked(self.k.CloseHandle(snapshot))

    def active_processes(self) -> int:
        info = _Accounting()
        _checked(self.k.QueryInformationJobObject(self.job, 1, ctypes.byref(info), ctypes.sizeof(info), None))
        return info.active

    def _owned_process_handles(self):
        # Hold handles BEFORE termination, avoiding PID reuse and observing the real exit signal.
        count = 64
        while count <= 4096:
            class Pids(ctypes.Structure):
                _fields_ = [('assigned', w.DWORD), ('listed', w.DWORD), ('ids', ctypes.c_size_t * count)]
            ids = Pids()
            if self.k.QueryInformationJobObject(self.job, 3, ctypes.byref(ids), ctypes.sizeof(ids), None):
                handles = []
                try:
                    for pid in ids.ids[:ids.listed]:
                        handle = self.k.OpenProcess(0x100000, False, pid)  # SYNCHRONIZE
                        if handle:
                            handles.append(handle)
                        elif ctypes.get_last_error() != 87:  # already-exited process may be gone
                            _checked(False)
                    return handles
                except BaseException:
                    for handle in handles:self.k.CloseHandle(handle)
                    raise
            if ctypes.get_last_error() != 234:  # ERROR_MORE_DATA
                _checked(False)
            count *= 2
        raise ProcessTreeUnresolved('Owned tree exceeds the verifiable process limit')

    def terminate_tree(self, timeout:float=10) -> None:
        handles = []
        try:
            handles = self._owned_process_handles()
            deadline = time.monotonic() + timeout
            if self.active_processes():
                _checked(self.k.TerminateJobObject(self.job, 1))
            while self.active_processes():
                if time.monotonic() >= deadline:
                    raise ProcessTreeUnresolved('Owned process tree still has active processes')
                time.sleep(.025)
            for handle in handles:
                remaining = max(0, int((deadline-time.monotonic())*1000))
                if self.k.WaitForSingleObject(handle, remaining) != 0:
                    raise ProcessTreeUnresolved('An owned process exit signal could not be confirmed')
            if self.process:
                self.process.wait(timeout=max(.1, deadline-time.monotonic()))
        except ProcessTreeUnresolved:
            raise
        except BaseException as error:
            raise ProcessTreeUnresolved('Owned process tree cleanup could not be verified') from error
        finally:
            for handle in handles:self.k.CloseHandle(handle)

    def communicate(self, prompt:str, timeout:float) -> tuple[str,str,bool]:
        timed_out = False
        try:
            try:
                stdout, stderr = self.process.communicate(input=prompt, timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                self.terminate_tree()
                stdout, stderr = self.process.communicate(timeout=5)
            # A returned CLI can leave tool descendants behind. Drain them before terminal metadata/lease release.
            self.terminate_tree()
            return stdout, stderr, timed_out
        except BaseException as original:
            try:
                self.terminate_tree()
            except BaseException as cleanup:
                raise ProcessTreeUnresolved('Cannot release an invocation as terminal') from cleanup
            raise original
        finally:
            self.close()

    def close(self):
        if self.job:
            handle, self.job = self.job, None
            _checked(self.k.CloseHandle(handle))
