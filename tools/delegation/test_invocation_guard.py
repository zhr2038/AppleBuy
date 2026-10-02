"""Independent management guard tests; fake missing executable only, no Claude calls."""
from pathlib import Path
import contextlib
import io
import json
import tempfile
import unittest
from unittest.mock import patch
import invoke_claude as dispatcher
from dispatch_lock import DispatchAlreadyRunning


class InvocationGuardTests(unittest.TestCase):
    def test_running_unreadable_unknown_records_each_block_dispatch(self):
        with tempfile.TemporaryDirectory(prefix='applebuy-guard-test-') as d:
            out=Path(d); record=out/'invocation.meta.json'
            for text in [json.dumps({'status':'running'}),'{broken',json.dumps({'status':'unexpected'}),'[]']:
                record.write_text(text)
                with self.assertRaises(DispatchAlreadyRunning):dispatcher.assert_terminal_records(out)
            record.write_text(json.dumps({'status':'failed'}));dispatcher.assert_terminal_records(out)
            record.write_text(json.dumps({'status':'returned_for_review'}));dispatcher.assert_terminal_records(out)

    def test_known_spawn_failure_records_terminal_without_fake_result(self):
        with tempfile.TemporaryDirectory(prefix='applebuy-spawn-test-') as d:
            root=Path(d)
            missing=str(root/'does-not-exist-review.exe')
            with patch.object(dispatcher,'ROOT',root),patch.object(dispatcher.shutil,'which',return_value=missing),patch.object(dispatcher.sys,'argv',['invoke_claude.py','SPAWN-TEST','--profile','probe']),contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(dispatcher.run_task(),1)
            meta=json.loads(next((root/'.local'/'claude').glob('*.meta.json')).read_text())
            self.assertEqual(meta['status'],'failed');self.assertTrue(meta['cleanup_confirmed'])
            self.assertIsNone(meta['pid']);self.assertIsNone(meta['result_path']);self.assertFalse(meta['model_verified'])
            dispatcher.assert_terminal_records(root/'.local'/'claude')


if __name__=='__main__':unittest.main()
