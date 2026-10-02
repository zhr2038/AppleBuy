"""Independent process-level regression for the actual same-workspace dispatch race. No Claude calls."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest

from dispatch_lock import DispatchAlreadyRunning, dispatch_lease


class DispatchLeaseTests(unittest.TestCase):
    def test_competing_process_is_refused_then_acquires_after_release(self):
        with tempfile.TemporaryDirectory(prefix='applebuy-dispatch-test-') as scratch:
            path = Path(scratch)
            script = "from pathlib import Path; import sys; from dispatch_lock import dispatch_lease, DispatchAlreadyRunning\ntry:\n with dispatch_lease(Path(sys.argv[1])): print('acquired')\nexcept DispatchAlreadyRunning:\n print('refused'); sys.exit(5)"
            def contender():
                return subprocess.run([sys.executable, '-c', script, str(path)], cwd=Path(__file__).parent,
                                      capture_output=True, text=True, timeout=10)
            with dispatch_lease(path):
                blocked = contender()
                self.assertEqual(blocked.returncode, 5)
                self.assertEqual(blocked.stdout.strip(), 'refused')
            acquired = contender()
            self.assertEqual(acquired.returncode, 0)
            self.assertEqual(acquired.stdout.strip(), 'acquired')

    def test_owner_process_death_releases_os_lease_without_deleting_file(self):
        with tempfile.TemporaryDirectory(prefix='applebuy-dispatch-test-') as scratch:
            path = Path(scratch)
            script = "from pathlib import Path; import sys,time; from dispatch_lock import dispatch_lease\nwith dispatch_lease(Path(sys.argv[1])):\n print('held',flush=True); time.sleep(30)"
            owner = subprocess.Popen([sys.executable, '-c', script, str(path)], cwd=Path(__file__).parent,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                self.assertEqual(owner.stdout.readline().strip(), 'held')
                with self.assertRaises(DispatchAlreadyRunning):
                    with dispatch_lease(path):
                        self.fail('live owner lease was stolen')
                owner.terminate()  # only this isolated test child
                owner.communicate(timeout=10)
                with dispatch_lease(path):
                    self.assertTrue((path / 'dispatcher.lock').is_file())
            finally:
                if owner.poll() is None:
                    owner.kill()
                owner.communicate(timeout=10)


if __name__ == '__main__':
    unittest.main()
