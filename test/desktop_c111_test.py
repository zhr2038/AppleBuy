"""Bounded native framing/origin/response checks. All message values are fake; no registration or browser."""
import io
from pathlib import Path
import struct
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src/desktop'))
from chrome_native_protocol import extension_origin,read_frame,write_frame,probe_request,probe_result,pipe_name,valid_pipe,MAX_FRAME
from install_chrome_native import installation
from app import classify_existing_chrome
import json
import os
import subprocess
import threading
import queue
import tempfile
import time

class C111NativeTests(unittest.TestCase):
    @unittest.skipUnless(os.name=='nt','Windows native pipe')
    def test_real_native_host_and_broker_exchange_only_bounded_fake_result(self):
        with tempfile.TemporaryDirectory(prefix='c111-',dir=ROOT/'.local/test-runs') as folder:
            base=Path(folder);(base/'.local/desktop').mkdir(parents=True);(base/'.local/desktop/chrome-native-config.json').write_text(json.dumps({'schema':'applebuy-native-registration/v1','extensionId':'a'*32,'hostName':'com.applebuy.readonly'}),encoding='utf8')
            children=[]
            try:
                broker=subprocess.Popen([sys.executable,'-B','test/desktop-c111-native-fixture.py','broker',folder],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW);children.append(broker)
                ticket=base/'.local/desktop/chrome-native-ticket.json'
                for _ in range(100):
                    if ticket.exists():break
                    time.sleep(.02)
                self.assertTrue(ticket.exists())
                host=subprocess.Popen([sys.executable,'-B','test/desktop-c111-native-fixture.py','host',folder],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW);children.append(host)
                incoming=queue.Queue();threading.Thread(target=lambda:incoming.put(read_frame(host.stdout)),daemon=True).start();request=incoming.get(timeout=5);self.assertEqual(request['operation'],'observe-bag')
                write_frame(host.stdin,{'schema':request['schema'],'nonce':request['nonce'],'phase':'EMPTY_BAG','readOnly':True,'mutationCount':0,'tabClosed':True,'cookie':'FAKE-not-forwarded'})
                broker.wait(timeout=5);self.assertEqual(broker.returncode,0);result=json.loads(broker.stdout.read().decode('utf8'));self.assertEqual(result['phase'],'EMPTY_BAG');self.assertNotIn('cookie',result);self.assertFalse(ticket.exists())
                host.stdin.close();host.wait(timeout=5);self.assertEqual(host.returncode,0)
            finally:
                for child in children:
                    if child.poll() is None:child.kill()
                    child.wait(timeout=5)
                    for stream in (child.stdin,child.stdout,child.stderr):
                        if stream and not stream.closed:stream.close()
    def test_utf8_frame_byte_count_and_roundtrip(self):
        value={'FAKE':'只读，不下单'};stream=io.BytesIO();write_frame(stream,value);raw=stream.getvalue();self.assertEqual(struct.unpack('<I',raw[:4])[0],len(raw)-4);self.assertEqual(read_frame(io.BytesIO(raw)),value)
    def test_short_or_huge_frames_fail_without_payload_execution(self):
        for raw in [b'\x01',struct.pack('<I',MAX_FRAME+1),struct.pack('<I',10)+b'{}']:
            with self.assertRaises(ValueError):read_frame(io.BytesIO(raw))
        self.assertIsNone(read_frame(io.BytesIO()))
    def test_origin_is_pinned_and_no_wildcard_or_other_scheme(self):
        self.assertEqual(extension_origin('a'*32),'chrome-extension://'+'a'*32+'/')
        for value in ['*','a'*31,'x'*32,'a'*32+'/']:
            with self.assertRaises(ValueError):extension_origin(value)
        _,manifest=installation('a'*32);self.assertEqual(manifest['allowed_origins'],[extension_origin('a'*32)]);self.assertEqual(manifest['type'],'stdio')
    def test_named_pipe_must_be_exact_own_namespace_and_random_suffix(self):
        value=pipe_name('a'*32);self.assertTrue(value.startswith('\\\\.\\pipe\\'));self.assertTrue(valid_pipe(value));self.assertFalse(valid_pipe(value+'\\other'));self.assertFalse(valid_pipe('FAKE-other-pipe'))
    def test_only_fixed_readonly_operation_allowed(self):
        value={'schema':'applebuy-chrome-readonly/v1','nonce':'a'*32,'operation':'observe-bag'};self.assertEqual(probe_request(value),value)
        for change in [{'operation':'submitOrder'},{'cookie':'FAKE-secret'},{'nonce':'bad'}]:
            with self.assertRaises(ValueError):probe_request({**value,**change})
    def test_unknown_close_mismatch_and_false_integer_cannot_be_confirmed(self):
        nonce='a'*32;value={'schema':'applebuy-chrome-readonly/v1','nonce':nonce,'phase':'EMPTY_BAG','readOnly':True,'mutationCount':0,'tabClosed':True,'cookie':'FAKE-secret'}
        clean=probe_result(value,nonce);self.assertNotIn('cookie',clean)
        for change in [{'nonce':'b'*32},{'tabClosed':False},{'mutationCount':False},{'readOnly':False},{'phase':'CONFIRMED_UNPAID'}]:
            with self.assertRaises(ValueError):probe_result({**value,**change},nonce)
    def test_gui_readonly_probe_does_not_report_order_or_clear_pending(self):
        row={'scope':'existing-chrome-readonly','phase':'EMPTY_BAG','readOnly':True,'mutationCount':0,'tabClosed':True,'oldRecordUnchanged':True}
        result=classify_existing_chrome(json.dumps(row),0);self.assertIn('旧未知',result['message']);self.assertTrue(result['existingChromeProbe'])
        with self.assertRaises(ValueError):classify_existing_chrome(json.dumps({**row,'mutationCount':1}),0)

if __name__=='__main__':unittest.main()
