import unittest,sys
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src/desktop'))
from interactive_child import CheckoutRunner
from desktop_c078_test import fake_app,FakeControl
class R2WindowTests(unittest.TestCase):
 def test_r2_uses_existing_contained_native_worker_and_no_profile(self):
  calls=[]
  with patch('interactive_child.InteractiveChild',side_effect=lambda *a:calls.append(a) or object()):self.assertTrue(CheckoutRunner().open('native-r2'))
  self.assertTrue(calls[0][0][-2].endswith('native-purchase-worker.mjs'));self.assertEqual(calls[0][0][-1],'--browser-executor')
  with patch('interactive_child.InteractiveChild') as child:
   with self.assertRaises(ValueError):CheckoutRunner().open('native-r2',keep_session=True)
   child.assert_not_called()
 def test_window_keeps_start_control_and_selects_r2_without_saved_profile(self):
  app=fake_app();app.browser_choice=FakeControl('正常 Chrome 浏览器内执行 R2');app.keep_session=FakeControl(True);app.runner.busy=False;app.checkout.busy=False;calls=[];app.checkout.open=lambda **kw:calls.append(kw) or True
  app.open_checkout();self.assertEqual(calls,[{'browser_channel':'native-r2','keep_session':False}]);self.assertEqual(app.browser_picker.state,'disabled')
if __name__=='__main__':unittest.main()
