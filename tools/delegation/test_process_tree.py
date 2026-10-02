"""Actual isolated child/grandchild regression; no Claude invocation or external account access."""
from pathlib import Path
import ctypes
from ctypes import wintypes as w
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from process_tree import OwnedProcess


def live(pid):
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    k.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD]; k.OpenProcess.restype=w.HANDLE
    k.WaitForSingleObject.argtypes=[w.HANDLE,w.DWORD]; k.WaitForSingleObject.restype=w.DWORD
    k.CloseHandle.argtypes=[w.HANDLE]; k.CloseHandle.restype=w.BOOL
    h=k.OpenProcess(0x100000,False,pid)  # SYNCHRONIZE, read-only liveness
    if not h: return False
    try:return k.WaitForSingleObject(h,0)==258
    finally:k.CloseHandle(h)


@unittest.skipUnless(os.name=='nt','Windows execution scope')
class ProcessTreeTests(unittest.TestCase):
    def test_timeout_removes_grandchild_before_return(self):
        child="import subprocess,sys,time,json; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); print(json.dumps({'grandchild':p.pid}),flush=True); time.sleep(60)"
        p=OwnedProcess([sys.executable,'-c',child],Path(__file__).parent,lambda pid:None)
        pid=p.process.pid
        out,err,timed_out=p.communicate('',1)
        grandchild=json.loads(out)['grandchild']
        self.assertTrue(timed_out);self.assertFalse(live(pid));self.assertFalse(live(grandchild));self.assertEqual(err,'')

    def test_returned_child_does_not_leave_tool_descendant(self):
        child="import subprocess,sys,json; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); print(json.dumps({'grandchild':p.pid}),flush=True)"
        p=OwnedProcess([sys.executable,'-c',child],Path(__file__).parent,lambda pid:None)
        out,_,timed_out=p.communicate('',10)
        self.assertFalse(timed_out);self.assertFalse(live(json.loads(out)['grandchild']));self.assertEqual(p.process.returncode,0)

    def test_child_does_not_execute_before_receipt_callback(self):
        with tempfile.TemporaryDirectory(prefix='applebuy-job-test-') as d:
            target=Path(d)/'executed.txt'
            child="from pathlib import Path; import sys; Path(sys.argv[1]).write_text('executed')"
            def receipt(pid):
                time.sleep(.1); self.assertFalse(target.exists()); self.assertTrue(live(pid))
            p=OwnedProcess([sys.executable,'-c',child,str(target)],Path(__file__).parent,receipt)
            p.communicate('',10);self.assertEqual(target.read_text(),'executed')

    def test_dispatcher_crash_kills_owned_child_and_grandchild(self):
        with tempfile.TemporaryDirectory(prefix='applebuy-job-crash-') as d:
            receipt=Path(d)/'receipt.json'
            child="import subprocess,sys,time,json; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); print(json.dumps({'grandchild':p.pid}),flush=True); time.sleep(60)"
            owner="from pathlib import Path; import sys,json,time; from process_tree import OwnedProcess; p=OwnedProcess([sys.executable,'-c',sys.argv[2]],Path.cwd(),lambda pid:None); info=json.loads(p.process.stdout.readline()); info['child']=p.process.pid; Path(sys.argv[1]).write_text(json.dumps(info)); time.sleep(60)"
            wrapper=subprocess.Popen([sys.executable,'-c',owner,str(receipt),child],cwd=Path(__file__).parent,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            try:
                deadline=time.monotonic()+10
                while not receipt.exists() and wrapper.poll() is None and time.monotonic()<deadline:time.sleep(.02)
                self.assertTrue(receipt.exists(),f'isolated wrapper exited: {wrapper.poll()}')
                info=json.loads(receipt.read_text());self.assertTrue(live(info['child']));self.assertTrue(live(info['grandchild']))
                wrapper.kill()  # ONLY the isolated dispatcher created by this test
                wrapper.communicate(timeout=10)
                deadline=time.monotonic()+5
                while (live(info['child']) or live(info['grandchild'])) and time.monotonic()<deadline:time.sleep(.02)
                self.assertFalse(live(info['child']));self.assertFalse(live(info['grandchild']))
            finally:
                if wrapper.poll() is None:wrapper.kill()
                wrapper.communicate(timeout=10)

    def test_known_spawn_failure_has_no_started_child(self):
        receipt=[]
        with self.assertRaises(FileNotFoundError):
            OwnedProcess([str(Path.cwd()/'does-not-exist-review.exe')],Path.cwd(),receipt.append)
        self.assertEqual(receipt,[])


if __name__=='__main__':unittest.main()
