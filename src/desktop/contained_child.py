"""Own the desktop browser child tree; cancellation and cleanup occur on its worker, not UI automation."""
from pathlib import Path
import json
import sys
import threading
import time
import uuid
import subprocess
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/delegation"))
from process_tree import OwnedProcess

class ContainedChild:
    def __init__(self, args, cwd, **_):
        self.cancel = threading.Event()
        self.done = threading.Event()
        self.returncode = None
        self.receipt = ROOT / ".local" / ("desktop-child-" + uuid.uuid4().hex + ".json")
        def started(pid):
            self.receipt.write_text(json.dumps({"scope": "owned desktop public probe", "pid": pid, "terminal": False}), encoding="utf-8")
        self.owned = OwnedProcess(args, Path(cwd), started)

    def communicate(self, timeout=45):
        end = time.monotonic() + timeout
        first = True
        try:
            while True:
                if self.cancel.is_set() or time.monotonic() >= end:
                    self.owned.terminate_tree()
                try:
                    out, err = self.owned.process.communicate(input="" if first else None, timeout=.1)
                    break
                except subprocess.TimeoutExpired:
                    first = False
            self.owned.terminate_tree()
            self.returncode = self.owned.process.returncode
            return out, err
        finally:
            self.owned.terminate_tree()
            self.owned.close()
            self.receipt.write_text(json.dumps({"scope": "owned desktop public probe", "terminal": True, "cleanupConfirmed": True}), encoding="utf-8")
            self.done.set()

    def terminate(self): self.cancel.set()
    def kill(self): self.cancel.set()
    def poll(self): return self.returncode if self.done.is_set() else None
    def wait(self, timeout=None):
        if not self.done.wait(timeout):
            raise subprocess.TimeoutExpired("owned desktop child", timeout)
        return self.returncode
