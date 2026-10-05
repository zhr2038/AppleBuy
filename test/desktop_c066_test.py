"""C066 desktop control tests; existing engine is offline, no personal browser/profile/UI automation."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import threading
import unittest
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("desktop_app", ROOT / "src/desktop/app.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)

class DesktopTests(unittest.TestCase):
    def test_existing_offline_engine_terminal_refusal_reselection(self):
        p = subprocess.run(app.command("node"), cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=20)
        result = app.classify(p.stdout, p.returncode)
        self.assertEqual(result["choices"], 3)
        self.assertEqual(result["refusals"], 2)
        self.assertEqual(result["realOrders"], 0)

    def test_unknown_live_or_submit_output_cannot_claim_success(self):
        base = {"fakeData": True, "scenario": app.SCENARIO, "phase": "REHEARSAL_ENDPOINT", "mismatches": [],
                "dispatched": [{"kind": "chooseSlot"}, {"kind": "chooseSlot"}], "records": [{"type": "refusal"}]}
        for delta in [{"fakeData": False}, {"phase": "UNKNOWN"}, {"mismatches": ["FAKE mismatch"]},
                      {"dispatched": [{"kind": "submitOrder"}]}, {"records": []}]:
            with self.assertRaises(ValueError):
                app.classify(json.dumps({**base, **delta}), 0)
        with self.assertRaises(ValueError):
            app.classify(json.dumps(base), 1)

    def test_duplicate_start_and_cancellation_leave_no_owned_process(self):
        entered, release, exited = threading.Event(), threading.Event(), threading.Event()
        calls = []
        class FakeProcess:
            returncode = None
            def communicate(self, timeout=None):
                entered.set()
                if not release.wait(2):
                    raise AssertionError("FAKE worker did not stop")
                exited.set()
                return "{}", ""
            def poll(self): return self.returncode
            def terminate(self): self.returncode = -15; release.set()
            def kill(self): self.returncode = -9; release.set()
            def wait(self, timeout=None): return self.returncode
        def popen(*args, **kwargs): calls.append(args); return FakeProcess()
        runner = app.Runner(popen=popen)
        self.assertTrue(runner.start())
        self.assertTrue(entered.wait(2))
        self.assertFalse(runner.start())
        runner.stop()
        self.assertTrue(exited.wait(2))
        self.assertFalse(runner.busy)
        self.assertIsNone(runner.process)
        self.assertEqual(len(calls), 1)

    def test_command_is_fixed_offline_engine_not_personal_browser(self):
        self.assertEqual(app.command("node")[2:], ["rehearse", "--scenario", "last-slot-three-dates", "--json"])
        self.assertEqual(app.ROOT, ROOT)

if __name__ == "__main__": unittest.main()
