import sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src/desktop'))
from app import App
from desktop_c078_test import fake_app,FakeControl
class C125GuiTests(unittest.TestCase):
    def fixture(self):
        app=fake_app();app.browser_choice=FakeControl('正常 Chrome 结账通道');app.pickup_values={};app.checkout.busy=False;return app
    def test_no_current_attestation_sends_nothing(self):
        app=self.fixture();sent=[];app.checkout.send=sent.append;app.restart_empty_checkout();self.assertEqual(sent,[]);self.assertIn('本人确认',app.status.get())
    def test_explicit_empty_restart_carries_three_current_confirmations_and_consumes_tick(self):
        app=self.fixture();sent=[];app.checkout.send=sent.append;app.empty_restart_confirm.set(True);app.restart_empty_checkout();self.assertEqual(sent[0]['action'],'restart-empty');self.assertTrue(sent[0]['accountConfirmedByUser']);self.assertTrue(sent[0]['oldCheckoutStoppedByUser']);self.assertTrue(sent[0]['existingOrdersCheckedByUser']);self.assertFalse(app.empty_restart_confirm.get());self.assertEqual(app.empty_restart_button.state,'disabled');self.assertEqual(app.final_checkbox.state,'disabled')
    def test_owner_loss_disables_empty_restart_without_busy_poll_masking_it(self):
        app=self.fixture();app.checkout.events.put({'generation':1,'type':'owner-lost','message':'FAKE owner gone'});app.poll();self.assertEqual(app.empty_restart_button.state,'disabled');self.assertEqual(app.empty_restart_checkbox.state,'disabled')
    def test_only_native_readonly_result_enables_new_run_confirmation_and_never_reuses_old_tick(self):
        app=self.fixture();app.empty_restart_confirm.set(True);app.checkout.events.put({'generation':1,'type':'result','readOnly':True,'phase':'EMPTY_BAG'});app.poll();self.assertEqual(app.empty_restart_button.state,'normal');self.assertFalse(app.empty_restart_confirm.get());app.checkout.events.put({'generation':1,'type':'result','readOnly':False,'phase':'AUTH'});app.poll();self.assertEqual(app.empty_restart_button.state,'disabled')
if __name__=='__main__':unittest.main()
