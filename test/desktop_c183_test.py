import sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src/desktop'))
from desktop_c078_test import fake_app,FakeControl
class EndedDraftGuiTests(unittest.TestCase):
    def fixture(self):
        app=fake_app();app.pickup_values={};app.sent=[];app.checkout.send=app.sent.append;return app
    def test_unchecked_renewal_never_sends_even_when_source_shape_is_ready(self):
        app=self.fixture();app.checkout_can_renew_ended=True;app.transfer_checkout();self.assertEqual(app.sent,[])
    def test_checked_current_ended_draft_uses_separate_operation_and_consumes_tick(self):
        app=self.fixture();app.checkout.events.put({'generation':1,'type':'ready','readOnly':True,'canRenewEndedDraft':True,'message':'FAKE ready'});app.poll();app.transfer_confirm.set(True);app.transfer_checkout();self.assertEqual(app.sent[0]['action'],'renew-draft');self.assertTrue(all(app.sent[0][k] for k in ('approved','newContextConfirmed','merchantExpiryConfirmed','oldExecutorStopped','sameAccountOrdersClear')));self.assertFalse(app.transfer_confirm.get());self.assertFalse(app.final_confirm.get())
    def test_later_ordinary_source_ready_cannot_reuse_the_ended_draft_route(self):
        app=self.fixture();app.checkout_can_renew_ended=True;app.checkout.events.put({'generation':1,'type':'ready','readOnly':True,'message':'FAKE ordinary'});app.poll();app.transfer_confirm.set(True);app.transfer_checkout();self.assertEqual(app.sent[0]['action'],'transfer')
if __name__=='__main__':unittest.main()
