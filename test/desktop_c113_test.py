import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src/desktop'));sys.path.insert(0,str(ROOT/'test'))
from app import classify_existing_chrome,App,Runner
from desktop_c078_test import fake_app
from install_chrome_native import installation
import chrome_native_broker as broker
import install_chrome_native as installer
import tempfile,time,subprocess,os,types,io
from contextlib import redirect_stdout
sys.path.insert(0,str(ROOT/'tools/delegation'))
from run_review_checks import python_counts

class C113NativeReviewTests(unittest.TestCase):
    def test_guest_bag_result_cannot_advertise_verified_login_or_account(self):
        for phase in ('EMPTY_BAG','BAG'):
            result=classify_existing_chrome(json.dumps({'scope':'existing-chrome-readonly','phase':phase,'readOnly':True,'mutationCount':0,'tabClosed':True,'oldRecordUnchanged':True}),0)
            self.assertIn('登录及账户身份未核实',result['message'])
    def test_ascii_launcher_and_origin_are_exact_and_nonascii_cannot_mislaunch(self):
        command,manifest=installation('a'*32,python_path=Path('C:/FAKE/python.exe'))
        self.assertTrue(command.startswith('@echo off\r\n'));self.assertIn(' %*\r\n',command);self.assertEqual(manifest['allowed_origins'],['chrome-extension://'+'a'*32+'/'])
        with self.assertRaises(ValueError):installation('a'*32,python_path=Path('C:/FAKE/测试/python.exe'))
    def test_owner_loss_disables_normal_chrome_button(self):
        app=fake_app();app.checkout.events.put({'generation':1,'type':'owner-lost','message':'FAKE lease lost'});app.poll();self.assertEqual(app.chrome_probe_button.state,'disabled')
    def test_readonly_runner_consumes_contained_fake_child_without_opening_browser(self):
        output={'scope':'existing-chrome-readonly','phase':'EMPTY_BAG','readOnly':True,'mutationCount':0,'tabClosed':True,'oldRecordUnchanged':True}
        class Child:
            returncode=0
            def communicate(self,**kw):return json.dumps(output),'FAKE ignored stderr'
            def poll(self):return 0
        seen=[]
        runner=Runner(popen=lambda args,**kw:seen.append(args) or Child());runner.generation=1;runner.busy=True
        with patch('app.shutil.which',return_value='FAKE-node'):runner._run(1,'existing-chrome')
        generation,kind,result=runner.events.get_nowait();self.assertEqual((generation,kind),(1,'done'));self.assertIn('chrome-readonly-probe.mjs',seen[0][1]);self.assertIn('登录及账户身份未核实',result['message']);self.assertFalse(runner.busy)
    def test_python_skip_and_error_counts_are_explicit(self):
        self.assertEqual(python_counts('Ran 3 tests in 1s\n\nOK (skipped=1)\n'),{'tests':3,'failures':0,'errors':0,'skipped':1})
        self.assertEqual(python_counts('Ran 4 tests in 1s\n\nFAILED (failures=1, errors=2)\n'),{'tests':4,'failures':1,'errors':2,'skipped':0})
        self.assertIsNone(python_counts('FAKE incomplete'))
    def test_stale_ticket_cleanup_preserves_another_fresh_nonce(self):
        with tempfile.TemporaryDirectory(prefix='c113-',dir=ROOT/'.local/test-runs') as folder:
            ticket=Path(folder)/'ticket.json';value={'schema':'applebuy-native-ticket/v1','nonce':'a'*32,'expiresAt':time.time()+100}
            with patch.object(broker,'TICKET',ticket):
                ticket.write_text(json.dumps(value));broker.remove_ticket('b'*32);self.assertTrue(ticket.exists());broker.remove_ticket(expired_only=True);self.assertTrue(ticket.exists())
                value['expiresAt']=time.time()-1;ticket.write_text(json.dumps(value));broker.remove_ticket(expired_only=True);self.assertFalse(ticket.exists())
    @unittest.skipUnless(os.name=='nt','Windows native deadline')
    def test_actual_broker_deadline_removes_only_its_owned_ticket(self):
        with tempfile.TemporaryDirectory(prefix='c113-',dir=ROOT/'.local/test-runs') as folder:
            base=Path(folder);(base/'.local/desktop').mkdir(parents=True);(base/'.local/desktop/chrome-native-config.json').write_text(json.dumps({'schema':'applebuy-native-registration/v1','extensionId':'a'*32,'hostName':'com.applebuy.readonly'}))
            child=subprocess.Popen([sys.executable,'-B','test/desktop-c111-native-fixture.py','broker-timeout',folder],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                child.communicate(timeout=5);self.assertEqual(child.returncode,2);self.assertFalse((base/'.local/desktop/chrome-native-ticket.json').exists())
            finally:
                if child.poll() is None:child.kill();child.wait(timeout=5)
    def test_installer_writes_exact_ascii_launcher_and_only_fake_registry_views(self):
        registry={}
        class Key:
            def __init__(self,k):self.k=k
            def __enter__(self):return self
            def __exit__(self,*args):pass
        def open_key(hive,path,reserved,view):
            if (path,view) not in registry:raise FileNotFoundError()
            return Key((path,view))
        def create_key(hive,path,reserved,view):return Key((path,view))
        fake=types.SimpleNamespace(HKEY_CURRENT_USER=1,KEY_READ=0,KEY_SET_VALUE=0,KEY_WOW64_32KEY=32,KEY_WOW64_64KEY=64,REG_SZ=1,OpenKey=open_key,CreateKeyEx=create_key,QueryValueEx=lambda key,name:(registry[key.k],1),SetValueEx=lambda key,name,reserved,kind,value:registry.update({key.k:value}))
        with tempfile.TemporaryDirectory(prefix='c113-',dir=ROOT/'.local/test-runs') as folder:
            base=Path(folder)
            with patch.object(installer,'ROOT',base),patch.object(installer,'DEST',base/'.local/desktop/native-host'),patch.dict(sys.modules,{'winreg':fake}),patch.object(sys,'argv',['FAKE','--extension-id','a'*32,'--install']),redirect_stdout(io.StringIO()):
                self.assertEqual(installer.main(),0)
            manifest=json.loads((base/'.local/desktop/native-host/host.json').read_text());self.assertEqual(manifest['allowed_origins'],['chrome-extension://'+'a'*32+'/']);self.assertEqual(len(registry),2)
            launcher=(base/'.local/desktop/native-host/applebuy-native.cmd').read_bytes();self.assertTrue(launcher.isascii());self.assertTrue(launcher.endswith(b' %*\r\n'))

if __name__=='__main__':unittest.main()
