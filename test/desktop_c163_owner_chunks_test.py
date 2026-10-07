"""FAKE bounded transaction failures; no user ledger, browser or network."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fake_owner_chunks', Path(__file__).parents[1] / 'src/desktop/owner_lease.py')
holder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(holder)

class OwnerChunks(unittest.TestCase):
    def setUp(self):
        self.writer = holder.ChunkedPut()
        self.body = json.dumps({'oldUnknown':True, 'oldFinal':{'sent':True}, 'fake':'中文'}).encode()
        self.begin = {'action':'putBegin', 'id':9, 'key':holder.TASK_KEY, 'bytes':len(self.body), 'sha256':hashlib.sha256(self.body).hexdigest()}
        self.chunk = {'action':'putChunk', 'id':9, 'seq':0, 'data':base64.b64encode(self.body).decode()}
        self.commit = {'action':'putCommit', 'id':9}
        self.write_patch = patch.object(holder, 'put_task')
        self.write = self.write_patch.start()
        self.addCleanup(self.write_patch.stop)

    def test_only_complete_matching_digest_commits(self):
        self.assertIsNone(self.writer.receive(Path('FAKE.owner'), self.begin))
        self.assertIsNone(self.writer.receive(Path('FAKE.owner'), self.chunk))
        self.write.assert_not_called()
        self.assertTrue(self.writer.receive(Path('FAKE.owner'), self.commit))
        self.write.assert_called_once_with(Path('FAKE.owner'), json.loads(self.body))

    def test_partial_commit_never_writes(self):
        self.writer.receive(Path('FAKE.owner'), self.begin)
        with self.assertRaises(ValueError): self.writer.receive(Path('FAKE.owner'), self.commit)
        self.write.assert_not_called()

    def test_wrong_digest_never_writes(self):
        self.writer.receive(Path('FAKE.owner'), {**self.begin, 'sha256':'0'*64})
        self.writer.receive(Path('FAKE.owner'), self.chunk)
        with self.assertRaises(ValueError): self.writer.receive(Path('FAKE.owner'), self.commit)
        self.write.assert_not_called()

    def test_wrong_id_sequence_or_base64_never_writes(self):
        for change in ({'id':10}, {'seq':1}, {'data':'!'}):
            writer = holder.ChunkedPut()
            writer.receive(Path('FAKE.owner'), self.begin)
            with self.assertRaises(ValueError): writer.receive(Path('FAKE.owner'), {**self.chunk, **change})
        self.write.assert_not_called()

    def test_invalid_size_key_extra_and_bool_id_never_begin(self):
        for change in ({'bytes':16000001}, {'bytes':0}, {'key':'FAKE-other'}, {'extra':'FAKE'}, {'id':True}):
            with self.assertRaises(ValueError): holder.ChunkedPut().receive(Path('FAKE.owner'), {**self.begin, **change})
        self.write.assert_not_called()

    def test_overrun_and_mixed_write_reject(self):
        for request in ({**self.chunk,'data':base64.b64encode(self.body+b'FAKE').decode()}, {'action':'put','id':11,'key':holder.TASK_KEY,'value':{'FAKE':True}}):
            writer=holder.ChunkedPut(); writer.receive(Path('FAKE.owner'), self.begin)
            with self.assertRaises(ValueError): writer.receive(Path('FAKE.owner'), request)
        self.write.assert_not_called()

    def test_expired_staging_never_writes(self):
        self.writer.receive(Path('FAKE.owner'), self.begin)
        self.writer.stage['at'] -= 31
        with self.assertRaises(ValueError): self.writer.receive(Path('FAKE.owner'), self.chunk)
        self.write.assert_not_called()

if __name__ == '__main__': unittest.main()
