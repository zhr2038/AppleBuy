import unittest,os,json,subprocess,sys,tempfile,time,threading,queue
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src/desktop'))
from chrome_native_protocol import read_frame,write_frame
from interactive_child import CheckoutRunner
from app import App
from desktop_c078_test import fake_app,FakeControl
from unittest.mock import patch
class C123PreparedStreamTests(unittest.TestCase):
    def test_native_worker_is_distinct_and_rejects_profile_retention_before_launch(self):
        calls=[];runner=CheckoutRunner()
        with patch('interactive_child.InteractiveChild',side_effect=lambda *args:calls.append(args) or object()):self.assertTrue(runner.open('native-chrome'))
        self.assertTrue(calls[0][0][-1].endswith('native-purchase-worker.mjs'));self.assertFalse(any('--keep-session' in arg for arg in calls[0][0]))
        with patch('interactive_child.InteractiveChild') as child:
            with self.assertRaises(ValueError):CheckoutRunner().open('native-chrome',keep_session=True)
            child.assert_not_called()
    def test_native_gui_selection_uses_distinct_worker_without_copying_saved_profile_consent(self):
        app=fake_app();app.browser_choice=FakeControl('正常 Chrome 结账通道');app.keep_session=FakeControl(True);app.runner.busy=False;app.checkout.busy=False;calls=[];app.checkout.open=lambda **kw:calls.append(kw) or True
        app.open_checkout();self.assertEqual(calls,[{'browser_channel':'native-chrome','keep_session':False}]);self.assertEqual(app.browser_picker.state,'disabled');self.assertEqual(app.keep_session_checkbox.state,'disabled')
    @unittest.skipUnless(os.name=='nt','Windows AF_PIPE')
    def test_actual_bidirectional_stdios_and_authenticated_pipe_two_frames_no_browser(self):
        with tempfile.TemporaryDirectory(prefix='c123-',dir=ROOT/'.local/test-runs') as folder:
            base=Path(folder);(base/'.local/desktop').mkdir(parents=True);(base/'.local/desktop/checkout-native-config.json').write_text(json.dumps({'extensionId':'a'*32,'hostName':'com.applebuy.checkout'}));children=[]
            try:
                broker=subprocess.Popen([sys.executable,'-B','test/desktop-c123-stream-fixture.py','broker',folder],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW);children.append(broker)
                ticket=base/'.local/desktop/checkout-native-ticket.json'
                for _ in range(100):
                    if ticket.exists():break
                    time.sleep(.02)
                self.assertTrue(ticket.exists());host=subprocess.Popen([sys.executable,'-B','test/desktop-c123-stream-fixture.py','host',folder],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW);children.append(host)
                for index,operation in enumerate(('getTab','closeSession')):
                    request={'schema':'applebuy-native-checkout/v1','kind':'request','contextId':'FAKE-C123-native-context','id':'FAKE-frame-'+str(index),'operation':operation,'payload':{}}
                    broker.stdin.write((json.dumps(request)+'\n').encode());broker.stdin.flush();incoming=queue.Queue();threading.Thread(target=lambda:incoming.put(read_frame(host.stdout)),daemon=True).start();self.assertEqual(incoming.get(timeout=5),request)
                    reply={**{k:v for k,v in request.items() if k not in ('operation','payload')},'kind':'reply','ok':True,'result':{'closed':operation=='closeSession'}};write_frame(host.stdin,reply)
                    lines=queue.Queue();threading.Thread(target=lambda:lines.put(broker.stdout.readline()),daemon=True).start();self.assertEqual(json.loads(lines.get(timeout=5)),reply);self.assertFalse(ticket.exists(),'key ticket removed while stream is still active')
                broker.wait(timeout=5);self.assertEqual(broker.returncode,0);self.assertFalse(ticket.exists());host.stdin.close();host.wait(timeout=5);self.assertEqual(host.returncode,0)
            finally:
                for child in children:
                    if child.poll() is None:child.kill()
                    child.wait(timeout=5)
                    for stream in (child.stdin,child.stdout,child.stderr):
                        if stream and not stream.closed:stream.close()
if __name__=='__main__':unittest.main()
